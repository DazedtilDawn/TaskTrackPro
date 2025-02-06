import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems, users } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";
import multer from 'multer';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { checkEbayAuth } from "./middleware/ebay-auth";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const uploadsPath = path.resolve(__dirname, '../uploads');
console.log('[Upload Config] Uploads directory path:', uploadsPath);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('[Upload] Saving file to:', uploadsPath);
    cb(null, uploadsPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    console.log('[Upload] Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export function registerRoutes(app: Express): Express {
  setupAuth(app);

  // Add health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(bodyParser.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      // @ts-ignore
      req.rawBody = buf;
    }
  }));

  // Serve static files from uploads directory with proper logging
  console.log('[Static Files] Configuring uploads directory:', uploadsPath);
  app.use("/uploads", (req, res, next) => {
    console.log('[Static Files] Accessing:', req.url);
    express.static(uploadsPath)(req, res, next);
  });

  // Add this near the top of the routes registration, before the eBay-specific endpoints
  app.get("/callback", (req, res) => {
    console.log("[eBay Legacy Callback] Received request, redirecting to /api/ebay/callback");
    const queryString = Object.entries(req.query)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    res.redirect(307, `/api/ebay/callback${queryString ? '?' + queryString : ''}`);
  });

  // Add eBay auth endpoints
  app.get("/api/ebay/auth-url", async (req, res) => {
    console.log("[eBay Auth URL] Generating auth URL");
    if (!req.isAuthenticated()) {
      console.log("[eBay Auth URL] Unauthorized request");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Use environment variables or fallback to constructed URL
    const redirectUri = process.env.EBAY_REDIRECT_URI || `${process.env.APP_URL}/api/ebay/callback`;

    // Define required eBay API scopes
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account'
    ].join('%20');

    const authUrl = `https://auth.ebay.com/oauth2/authorize?` +
      `client_id=${process.env.EBAY_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}`;

    console.log("[eBay Auth URL] Generated URL:", authUrl);
    res.json({ authUrl });
  });

  // Update the existing callback endpoint to handle query params properly
  app.get("/api/ebay/callback", checkEbayAuth, async (req, res) => {
    console.log("[eBay Callback] Received callback");
    if (!req.isAuthenticated()) {
      console.log("[eBay Callback] Unauthorized request");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Extract the code from query parameters
    const { code } = req.query;
    if (!code || typeof code !== "string") {
      console.log("[eBay Callback] Missing or invalid authorization code");
      return res.status(400).send("Missing or invalid authorization code.");
    }

    try {
      console.log("[eBay Callback] Processing auth callback for user:", req.user!.id);

      // Exchange the authorization code for access and refresh tokens
      const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(
            `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
          ).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: process.env.EBAY_REDIRECT_URI || `${process.env.APP_URL}/api/ebay/callback`,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[eBay Callback] Token exchange failed:", errorText);
        return res.redirect("/settings/ebay-auth?status=error&message=token_exchange_failed");
      }

      const tokenData = await tokenResponse.json();
      console.log("[eBay Callback] Received token data");

      // Calculate token expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + tokenData.expires_in);

      console.log("[eBay Callback] Updating user with token");
      // Update user with eBay credentials
      await db.update(users)
        .set({
          ebayAuthToken: tokenData.access_token,
          ebayRefreshToken: tokenData.refresh_token,
          ebayTokenExpiry: expiryDate,
          updatedAt: new Date()
        })
        .where(eq(users.id, req.user!.id));

      console.log("[eBay Callback] Auth successful, redirecting");
      res.redirect("/settings/ebay-auth?status=success");
    } catch (error) {
      console.error("[eBay Callback] Error:", error);
      res.redirect("/settings/ebay-auth?status=error");
    }
  });

  // Add the new eBay price endpoint after the existing eBay auth endpoints
  app.get("/api/ebay-price", checkEbayAuth, async (req, res) => {
    console.log("[eBay Price API] Received price request");

    if (!req.isAuthenticated()) {
      console.log("[eBay Price API] Unauthorized request");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { productName } = req.query;
    console.log("[eBay Price API] Request params:", { productName });

    if (!productName || typeof productName !== "string") {
      console.log("[eBay Price API] Missing or invalid productName:", productName);
      return res.status(400).json({ error: "Missing or invalid productName" });
    }

    // Log authentication state
    console.log("[eBay Price API] Authentication state:", {
      hasToken: !!req.user?.ebayAuthToken,
      tokenExpiry: req.user?.ebayTokenExpiry,
      isValid: req.user?.ebayAuthToken && new Date(req.user.ebayTokenExpiry!) > new Date()
    });

    // Ensure the user has valid eBay authentication
    if (
      !req.user?.ebayAuthToken ||
      !req.user?.ebayTokenExpiry ||
      new Date(req.user.ebayTokenExpiry) < new Date()
    ) {
      console.log("[eBay Price API] Invalid or expired eBay token");
      return res.status(403).json({
        error: "eBay authentication required",
        details: "Please authenticate with eBay first",
        redirectTo: "/settings/ebay-auth"
      });
    }

    try {
      console.log("[eBay Price API] Fetching data for:", productName);
      // Call the eBay Browse API
      const response = await fetch(
        `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(productName)}&limit=10`,
        {
          headers: {
            "Authorization": `Bearer ${req.user.ebayAuthToken}`,
            "Content-Type": "application/json",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY-US"
          }
        }
      );

      console.log("[eBay Price API] eBay API response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[eBay Price API] eBay API error:", response.status, errorText);
        return res.status(response.status).json({ error: "Failed to fetch eBay data" });
      }

      const data = await response.json();
      console.log("[eBay Price API] Raw eBay response:", data);

      if (!data.itemSummaries?.length) {
        console.log("[eBay Price API] No items found");
        return res.status(404).json({ error: "No pricing data available" });
      }

      // Process the returned listings
      console.log("[eBay Price API] Processing listings");
      const prices = data.itemSummaries
        .map((item: any) => Number(item.price?.value))
        .filter((p: number) => !isNaN(p));

      const currentPrices = prices.sort((a: number, b: number) => a - b);
      const averagePrice = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;

      const priceData = {
        currentPrice: currentPrices[Math.floor(currentPrices.length / 2)], // median price
        averagePrice,
        lowestPrice: Math.min(...prices),
        highestPrice: Math.max(...prices),
        soldCount: data.total || 0,
        activeListing: data.itemSummaries.length,
        recommendedPrice: averagePrice * 0.95, // Slightly below average for competitiveness
        lastUpdated: new Date().toISOString()
      };

      console.log("[eBay Price API] Processed price data:", priceData);
      res.json(priceData);
    } catch (error) {
      console.error("[eBay Price API] Error:", error);
      res.status(500).json({
        error: "Failed to fetch eBay pricing data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add the eBay-specific endpoints with the auth middleware
  app.post("/api/products/:id/generate-ebay-listing", checkEbayAuth, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Fetch the product
      const [product] = await db.select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.userId, req.user!.id)
          )
        )
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Verify eBay authentication
      if (!req.user!.ebayAuthToken || new Date(req.user!.ebayTokenExpiry!) < new Date()) {
        return res.status(403).json({
          error: "eBay authentication required",
          details: "Please authenticate with eBay first"
        });
      }

      // Use AI to optimize the listing
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        }
      });

      const prompt = `Create an optimized eBay listing for this product:
Name: ${product.name}
Description: ${product.description}
Condition: ${product.condition}
Price: ${product.price}
Category: ${product.category || "unspecified"}
Brand: ${product.brand || "unspecified"}

Please generate an SEO-optimized title and description that follows eBay best practices.
Include relevant keywords and highlight key features.

Format the response as JSON with:
{
  "title": "eBay listing title (max 80 chars)",
  "description": "Detailed HTML description",
  "suggestedCategory": "Recommended eBay category",
  "keywords": ["relevant", "search", "terms"]
}`;

      const result = await model.generateContent(prompt);
      const text = await result.response.text();

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON object found in response");
        }
        const jsonStr = jsonMatch[0];
        const optimizedListing = JSON.parse(jsonStr);

        // For now, we'll just update the product with mock eBay data
        // In a real implementation, this would make actual eBay API calls
        const [updatedProduct] = await db.update(products)
          .set({
            ebayListingId: `mock-${Date.now()}`,
            ebayListingStatus: "active",
            ebayListingUrl: `https://www.ebay.com/itm/mock-${Date.now()}`,
            ebayLastSync: new Date(),
            updatedAt: new Date(),
            ebayListingData: optimizedListing
          })
          .where(eq(products.id, productId))
          .returning();

        res.json(updatedProduct);
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        res.status(500).json({
          error: "Failed to optimize listing",
          details: parseError instanceof Error ? parseError.message : "Unknown error"
        });
      }
    } catch (error) {
      console.error("Error generating eBay listing:", error);
      res.status(500).json({
        error: "Failed to generate eBay listing",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

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

      // Add type-safe text part
      parts.unshift({
        text: prompt,
        inlineData: undefined // Make TypeScript happy with union type
      });

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

  app.patch("/api/products/:id", upload.single("image"), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

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

      // Parse the update data, handling both JSON and form fields
      let updateData: any = {};

      // Handle regular form fields
      Object.keys(req.body).forEach(key => {
        try {
          // Try to parse JSON fields
          if (key === 'aiAnalysis' || key === 'ebayListingData') {
            updateData[key] = JSON.parse(req.body[key]);
          } else {
            updateData[key] = req.body[key];
          }
        } catch (e) {
          // If parsing fails, use the raw value
          updateData[key] = req.body[key];
        }
      });

      // Handle file upload if present
      if (req.file) {
        updateData.imageUrl = `/uploads/${req.file.filename}`;
      }

      // Add update timestamp
      updateData.updatedAt = new Date();

      // Remove undefined values
      Object.keys(updateData).forEach(key =>
        updateData[key] === undefined && delete updateData[key]
      );

      // Update the product
      const [updatedProduct] = await db.update(products)
        .set(updateData)
        .where(
          and(
            eq(products.id, productId),
            eq(products.userId, req.user!.id)
          )
        )
        .returning();

      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({
        error: "Failed to update product",
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
          total: product.price || "0",
          createdAt: new Date(),
          updatedAt: new Date()
        } as const)
        .returning();

      // Create order item
      await db.insert(orderItems)
        .values({
          orderId: order.id,
          productId: product.id,
          price: product.price || "0",
          quantity: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        } as const)
        .returning();

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
            name: products.name.toString(),
            description: products.description?.toString() || null,
            sku: products.sku?.toString() || null,
            imageUrl: products.imageUrl?.toString() || null
          }
        }
      })
        .from(orders)
        .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orders.userId, req.user!.id))
        .orderBy(desc(orders.createdAt));

      // Group items by order with proper type checking
      const groupedOrders = userOrders.reduce((acc: typeof userOrders, order) => {
        const existingOrder = acc.find(o => o.id === order.id);
        if (existingOrder) {
          if (order.items?.id) {
            existingOrder.items = order.items;
          }
        } else {
          acc.push({
            ...order,
            items: order.items?.id ? order.items : null
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

  // generate-sale-price endpoint
  app.post("/api/generate-sale-price", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      // Validate and parse input data
      const { productId, buyPrice, currentPrice, condition, category } = req.body;
      const buyPriceNum = Number(buyPrice);
      if (isNaN(buyPriceNum) || buyPriceNum <= 0) {
        return res.status(400).json({ error: "Invalid buyPrice. It must be a number greater than 0." });
      }
      const currentPriceNum = currentPrice ? Number(currentPrice) : null;

      // Construct an improved prompt
      const prompt = `We have a product with the following details:
- Buy Price: $${buyPriceNum.toFixed(2)}
- Current Market Price: ${currentPriceNum ? `$${currentPriceNum.toFixed(2)}` : "not available"}
- Condition: ${condition || "unspecified"}
- Category: ${category || "unspecified"}

Please recommend a competitive sale price that would secure a healthy profit margin (aim for at least a 20-30% margin) and reflect the product's condition and market positioning.

Format your answer strictly as valid JSON in the following format:
{
  "recommendedSalePrice": number
}
Do not include any additional text.`;

      // Log the prompt for debugging
      console.log("Sale price prompt:", prompt);

      // Get the generative model and send the prompt
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
        },
      });
      const result = await model.generateContent(prompt);
      const text = await result.response.text();
      console.log("Raw AI response:", text);

      // Try to extract a JSON object from the response text
      let recommendation;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON object found in response");
        }
        const jsonStr = jsonMatch[0];
        recommendation = JSON.parse(jsonStr);
      } catch (jsonError) {
        console.error("Failed to parse JSON from AI response:", jsonError);
        return res.status(500).json({
          error: "Failed to parse sale price recommendation",
          details: jsonError instanceof Error ? jsonError.message : "Unknown error",
        });
      }

      // Ensure that the JSON has the required key
      if (typeof recommendation.recommendedSalePrice !== "number") {
        return res.status(500).json({
          error: "Invalid recommendation format",
          details: "Expected a numeric 'recommendedSalePrice' field in the response.",
        });
      }

      res.json(recommendation);
    } catch (error) {
      console.error("Error generating sale price:", error);
      res.status(500).json({
        error: "Failed to generate sale price",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // generate-ebay-listing endpoint
  app.post("/api/products/:id/generate-ebay-listing", checkEbayAuth, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Fetch the product
      const [product] = await db.select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.userId, req.user!.id)
          )
        )
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Verify eBay authentication
      if (!req.user!.ebayAuthToken || new Date(req.user!.ebayTokenExpiry!) < new Date()) {
        return res.status(403).json({
          error: "eBay authentication required",
          details: "Please authenticate with eBay first"
        });
      }

      // Use AI to optimize the listing
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        }
      });

      const prompt = `Create an optimized eBay listing for this product:
Name: ${product.name}
Description: ${product.description}
Condition: ${product.condition}
Price: ${product.price}
Category: ${product.category || "unspecified"}
Brand: ${product.brand || "unspecified"}

Please generate an SEO-optimized title and description that follows eBay best practices.
Include relevant keywords and highlight key features.

Format the response as JSON with:
{
  "title": "eBay listing title (max 80 chars)",
  "description": "Detailed HTML description",
  "suggestedCategory": "Recommended eBay category",
  "keywords": ["relevant", "search", "terms"]
}`;

      const result = await model.generateContent(prompt);
      const text = await result.response.text();

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON object found in response");
        }
        const jsonStr = jsonMatch[0];
        const optimizedListing = JSON.parse(jsonStr);

        // For now, we'll just update the product with mock eBay data
        // In a real implementation, this would make actual eBay API calls
        const [updatedProduct] = await db.update(products)
          .set({
            ebayListingId: `mock-${Date.now()}`,
            ebayListingStatus: "active",
            ebayListingUrl: `https://www.ebay.com/itm/mock-${Date.now()}`,
            ebayLastSync: new Date(),
            updatedAt: new Date(),
            ebayListingData: optimizedListing
          })
          .where(eq(products.id, productId))
          .returning();

        res.json(updatedProduct);
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        res.status(500).json({
          error: "Failed to optimize listing",
          details: parseError instanceof Error ? parseError.message : "Unknown error"
        });
      }
    } catch (error) {
      console.error("Error generating eBay listing:", error);
      res.status(500).json({
        error: "Failed to generate eBay listing",
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
  return app;
}