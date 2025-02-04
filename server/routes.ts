import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";
import multer from 'multer';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  app.use(bodyParser.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      // @ts-ignore
      req.rawBody = buf;
    }
  }));

  // Serve static files from uploads directory
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

  // Image Analysis Endpoint
  app.post("/api/analyze-images", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { images } = req.body;
      if (!images || !Array.isArray(images)) {
        return res.status(400).json({ error: "Invalid request format" });
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        }
      });

      const prompt = `Analyze these product images and provide a detailed analysis including:
1. A clear, SEO-optimized product title
2. A detailed product description
3. Most suitable product category
4. Market analysis with:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Price suggestion range (min-max in USD)
5. 5-7 SEO keywords
6. 3-5 suggestions for listing improvement

Format the response strictly as a valid JSON object with these exact keys:
{
  "title": string,
  "description": string,
  "category": string,
  "marketAnalysis": {
    "demandScore": number,
    "competitionLevel": string,
    "priceSuggestion": {
      "min": number,
      "max": number
    }
  },
  "seoKeywords": string[],
  "suggestions": string[]
}

Important: Ensure the response is valid JSON that can be parsed with JSON.parse(). Do not include any explanatory text outside the JSON object.`;

      // Process images as parts
      const parts = images.map((img: any) => ({
        inlineData: {
          data: img.inlineData.data,
          mimeType: img.inlineData.mimeType
        }
      }));

      parts.unshift({ text: prompt });

      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 8192,
        }
      });

      const response = await result.response;
      const text = response.text();

      try {
        // Attempt to extract JSON from the response if it contains additional text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response');
        }
        const jsonStr = jsonMatch[0];
        const analysis = JSON.parse(jsonStr);

        // Validate required fields
        const requiredFields = [
          'title', 
          'description', 
          'category', 
          'marketAnalysis', 
          'seoKeywords', 
          'suggestions'
        ];

        const missingFields = requiredFields.filter(field => !(field in analysis));
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        res.json(analysis);
      } catch (parseError) {
        console.error('Failed to parse analysis:', parseError, '\nRaw text:', text);
        res.status(500).json({ 
          error: 'Failed to parse analysis results',
          details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
        });
      }
    } catch (error) {
      console.error('Image analysis error:', error);
      res.status(500).json({ 
        error: "Failed to analyze images",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add GET products endpoint before the POST endpoint
  app.get("/api/products", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const productsList = await db.select().from(products)
        .where(and(
          eq(products.userId, req.user!.id),
          eq(products.sold, false)
        ))
        .orderBy(products.createdAt);
      res.json(productsList);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ 
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Product endpoints
  app.post("/api/products", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      // Extract form data
      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        sku: req.body.sku || null,
        price: req.body.price || null,
        quantity: parseInt(req.body.quantity) || 0,
        condition: req.body.condition || 'used_good',
        brand: req.body.brand || null,
        category: req.body.category || null,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
        aiAnalysis: req.body.aiAnalysis ? JSON.parse(req.body.aiAnalysis) : null,
        ebayPrice: req.body.ebayPrice || null,
        userId: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        sold: false // Added sold status
      };

      const [product] = await db.insert(products)
        .values(productData)
        .returning();

      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ 
        error: "Failed to create product",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add DELETE endpoint for products after the POST endpoint
  app.delete("/api/products/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Verify the product exists and belongs to the user
      const [existingProduct] = await db.select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.userId, req.user!.id)
          )
        )
        .limit(1);

      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Remove from any watchlists first (foreign key constraint)
      await db.delete(watchlist)
        .where(eq(watchlist.productId, productId));

      // Delete the product
      const [deletedProduct] = await db.delete(products)
        .where(eq(products.id, productId))
        .returning();

      res.json({
        message: "Product deleted successfully",
        deletedProduct
      });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ 
        error: "Failed to delete product",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Mark product as sold endpoint
  app.post("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { productId } = req.body;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      // Retrieve the product details
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Create an order record
      const [order] = await db.insert(orders)
        .values({
          userId: req.user!.id,
          status: "completed",
          total: product.price,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create order item
      await db.insert(orderItems)
        .values({
          orderId: order.id,
          productId: product.id,
          price: product.price,
          quantity: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      // Mark product as sold instead of deleting
      await db.update(products)
        .set({ 
          sold: true,
          updatedAt: new Date()
        })
        .where(eq(products.id, productId));

      // Remove from any watchlists
      await db.delete(watchlist)
        .where(eq(watchlist.productId, productId));

      res.status(201).json({
        message: "Product marked as sold",
        order,
      });
    } catch (error) {
      console.error('Error marking product as sold:', error);
      res.status(500).json({
        error: "Failed to mark product as sold",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get orders endpoint
  app.get("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const userOrders = await db.select({
        id: orders.id,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        items: {
          id: orderItems.id,
          quantity: orderItems.quantity,
          price: orderItems.price,
          product: {
            id: products.id,
            name: products.name,
            description: products.description,
            sku: products.sku,
            imageUrl: products.imageUrl
          }
        }
      })
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.userId, req.user!.id))
      .orderBy(desc(orders.createdAt));

      // Group items by order
      const groupedOrders = userOrders.reduce((acc: any[], order) => {
        const existingOrder = acc.find(o => o.id === order.id);
        if (existingOrder) {
          if (order.items?.id) { // Only add if items exist
            existingOrder.items.push(order.items);
          }
        } else {
          acc.push({
            ...order,
            items: order.items?.id ? [order.items] : [] // Only include if items exist
          });
        }
        return acc;
      }, []);

      res.json(groupedOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ 
        error: "Failed to fetch orders",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this before the watchlist routes
  // Delete order endpoint
  app.delete("/api/orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      // Verify the order exists and belongs to the user
      const [existingOrder] = await db.select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.userId, req.user!.id)
          )
        )
        .limit(1);

      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Delete associated order items first
      await db.delete(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // Delete the order
      const [deletedOrder] = await db.delete(orders)
        .where(eq(orders.id, orderId))
        .returning();

      res.json({
        message: "Order deleted successfully",
        deletedOrder
      });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ 
        error: "Failed to delete order",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this before the watchlist routes
  app.post("/api/generate-sale-price", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { productId, buyPrice, currentPrice, condition, category } = req.body;

      // Create a prompt that uses the product details and the provided buy price
      const prompt = `Given a product with:
- Buy price: $${buyPrice}
- Current market price: $${currentPrice || 'unknown'}
- Condition: ${condition || 'unknown'}
- Category: ${category || 'unknown'}

Please recommend a competitive sale price that ensures a healthy profit margin. Consider:
1. The product's condition and category
2. A target profit margin of at least 20-30%
3. Current market price if available
4. Competitive positioning

Format your answer as a JSON object with this exact structure:
{
  "recommendedSalePrice": number
}`;

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
        },
      });

      const result = await model.generateContent(prompt);
      const text = await result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in response");
      }
      const jsonStr = jsonMatch[0];
      const recommendation = JSON.parse(jsonStr);

      res.json(recommendation);
    } catch (error) {
      console.error("Error generating sale price:", error);
      res.status(500).json({ 
        error: "Failed to generate sale price",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // API routes for watchlist
  app.post("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      // Check if product exists
      const [productExists] = await db.select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!productExists) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Check if already in watchlist
      const [existing] = await db.select()
        .from(watchlist)
        .where(
          and(
            eq(watchlist.productId, productId),
            eq(watchlist.userId, req.user!.id)
          )
        )
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "Product already in watchlist" });
      }

      const [item] = await db.insert(watchlist)
        .values({
          productId,
          userId: req.user!.id,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      res.status(201).json(item);
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      res.status(500).json({ error: "Failed to add item to watchlist" });
    }
  });

  app.get("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const items = await db.select({
        id: watchlist.id,
        userId: watchlist.userId,
        productId: watchlist.productId,
        createdAt: watchlist.createdAt,
        product: {
          id: products.id,
          name: products.name,
          description: products.description,
          sku: products.sku,
          price: products.price,
          quantity: products.quantity,
          condition: products.condition,
          brand: products.brand,
          category: products.category,
          imageUrl: products.imageUrl,
          aiAnalysis: products.aiAnalysis,
          ebayPrice: products.ebayPrice
        }
      })
      .from(watchlist)
      .leftJoin(products, eq(watchlist.productId, products.id))
      .where(
        and(
          eq(watchlist.userId, req.user!.id),
          eq(products.sold, false)
        )
      )
      .orderBy(watchlist.createdAt);

      res.json(items);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      res.status(500).json({ 
        error: "Failed to fetch watchlist",
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      console.log(`Attempting to delete watchlist item for product ${productId} and user ${req.user!.id}`);

      // First verify the item exists
      const [existingItem] = await db.select()
        .from(watchlist)
        .where(
          and(
            eq(watchlist.productId, productId),
            eq(watchlist.userId, req.user!.id)
          )
        )
        .limit(1);

      if (!existingItem) {
        console.log(`No watchlist item found for product ${productId} and user ${req.user!.id}`);
        return res.status(404).json({ error: "Watchlist item not found" });
      }

      console.log(`Found watchlist item to delete:`, existingItem);

      // Perform the deletion
      const result = await db.delete(watchlist)
        .where(
          and(
            eq(watchlist.productId, productId),
            eq(watchlist.userId, req.user!.id)
          )
        )
        .returning();

      console.log(`Deletion result:`, result);

      if (!result.length) {
        return res.status(404).json({ error: "Failed to delete watchlist item" });
      }

      res.status(200).json({ message: "Item removed from watchlist", deletedItem: result[0] });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      res.status(500).json({ 
        error: "Failed to remove item from watchlist",
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}