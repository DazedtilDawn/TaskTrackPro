import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems, users } from "@db/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from 'multer';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { checkEbayAuth } from "./middleware/ebay-auth";
import cors from 'cors';

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
  // Add CORS configuration
  app.use(cors({
    origin: true,
    credentials: true
  }));

  setupAuth(app);

  // Add health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Add this endpoint near the top of registerRoutes function, after the health check
  app.get("/api/config/gemini-key", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: "Gemini API key not configured on server" 
      });
    }

    res.json({ apiKey });
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

  // Add near the top of the registerRoutes function, before other eBay routes
  app.get("/api/ebay-price", checkEbayAuth, async (req, res) => {
    console.log("[eBay Price API] Request received:", {
      isAuthenticated: req.isAuthenticated(),
      queryParams: req.query,
      userAuth: req.user ? {
        hasToken: !!req.user.ebayAuthToken,
        tokenExpiry: req.user.ebayTokenExpiry
      } : null
    });

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
        model: "gemini-2.0-flash-001",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2,
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
        model: "gemini-2.0-flash-001",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2,
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
      console.log('req.body', req.body);
      console.log('req.file', req.file); 

      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        sku: req.body.sku || null,
        price: req.body.price ? parseFloat(req.body.price) : null,
        quantity: parseInt(req.body.quantity) || 0,
        condition: req.body.condition || 'used_good',
        brand: req.body.brand || null,
        category: req.body.category || null,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
        aiAnalysis: req.body.aiAnalysis ? JSON.parse(req.body.aiAnalysis) : null,
        ebayPrice: req.body.ebayPrice ? parseFloat(req.body.ebayPrice) : null,
        userId: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        sold: false
      };

      console.log('Processed productData:', productData);

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
      console.log('PATCH req.body:', req.body);
      console.log('PATCH req.file:', req.file);

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

      const updateData: any = {};

      // Handle regular form fields
      Object.keys(req.body).forEach(key => {
        try {
          // Try to parse JSON fields
          if (key === 'aiAnalysis' || key === 'ebayListingData') {
            updateData[key] = JSON.parse(req.body[key]);
          } else if (key === 'price' || key === 'ebayPrice') {
            updateData[key] = parseFloat(req.body[key]) || null;
          } else if (key === 'quantity') {
            updateData[key] = parseInt(req.body[key]) || 0;
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

      console.log('Processed updateData:', updateData);

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
      console.log("[Product Delete] Starting deletion process for product ID:", req.params.id);
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        console.log("[Product Delete] Invalid product ID:", req.params.id);
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
        console.log("[Product Delete] Product not found or unauthorized:", productId);
        return res.status(404).json({ error: "Product not found" });
      }

      // Delete the product - watchlist entries will be automatically deleted due to ON DELETE CASCADE
      console.log("[Product Delete] Deleting product:", productId);
      const [deletedProduct] = await db.delete(products)
        .where(eq(products.id, productId))
        .returning();

      console.log("[Product Delete] Successfully deleted product:", deletedProduct);
      res.json({
        message: "Product deleted successfully",
        deletedProduct
      });
    } catch (error) {
      console.error("[Product Delete] Error deleting product:", error);
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
      console.log("[Order Creation] Starting order creation for product:", req.body.productId);
      const { productId } = req.body;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      // Use a transaction for atomicity
      const result = await db.transaction(async (tx) => {
        console.log("[Order Creation] Starting transaction");

        // Retrieve the product details within the transaction
        const [product] = await tx.select()
          .from(products)
          .where(
            and(
              eq(products.id, productId),
              eq(products.sold, false)  // Ensure product isn't already sold
            )
          )
          .limit(1);

        if (!product) {
          console.log("[Order Creation] Product not found or already sold:", productId);
          throw new Error("Product not found or already sold");
        }

        console.log("[Order Creation] Creating order for product:", product);

        // Create an order record within transaction
        const [order] = await tx.insert(orders)
          .values({
            userId: req.user!.id,
            status: "completed",
            total: product.price || "0",
            createdAt: new Date(),
            updatedAt: new Date()
          } as const)
          .returning();

        console.log("[Order Creation] Created order:", order);

        // Create order item within transaction
        const [orderItem] = await tx.insert(orderItems)
          .values({
            orderId: order.id,
            productId: product.id,
            price: product.price || "0",
            quantity: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          } as const)
          .returning();

        console.log("[Order Creation] Created order item:", orderItem);

        // Mark product as sold and set soldAt timestamp within transaction
        const now = new Date();
        const [updatedProduct] = await tx.update(products)
          .set({
            sold: true,
            soldAt: now,
            updatedAt: now
          })
          .where(eq(products.id, productId))
          .returning();

        console.log("[Order Creation] Updated product as sold:", updatedProduct);

        // Remove from any watchlists within transaction
        await tx.delete(watchlist)
          .where(eq(watchlist.productId, productId));

        console.log("[Order Creation] Removed product from watchlists");

        // Return all updated records
        return {
          order,
          orderItem,
          product: updatedProduct
        };
      });

      // Transaction succeeded
      res.status(201).json({
        message: "Product marked as sold",
        ...result
      });
    } catch (error) {
      console.error('[Order Creation] Error marking product as sold:', error);
      // Return appropriate error response based on error type
      if (error instanceof Error && error.message === "Product not found or already sold") {
        res.status(404).json({
          error: error.message
        });
      } else {
        res.status(500).json({
          error: "Failed to mark product as sold",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  });

  // Update the GET /api/orders endpoint to fix the recursive data structure
  app.get("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      console.log("[Orders API] Fetching orders for user:", req.user!.id);

      // First fetch all orders for the user
      const userOrders = await db.select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        ebayOrderId: orders.ebayOrderId,
        ebayOrderData: orders.ebayOrderData
      })
      .from(orders)
      .where(eq(orders.userId, req.user!.id))
      .orderBy(desc(orders.createdAt));

      console.log("[Orders API] Found orders:", userOrders.length);

      if (!userOrders.length) {
        return res.json([]);
      }

      // Then fetch items for these orders with a different variable name
      const orderItemsList = await db.select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        price: orderItems.price,
        product: {
          id: products.id,
          name: products.name,
          description: products.description,
          imageUrl: products.imageUrl
        }
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, userOrders.map(o => o.id)));

      console.log("[Orders API] Found order items:", orderItemsList.length);

      // Combine orders with their items, ensuring null safety
      const ordersWithItems = userOrders.map(order => ({
        ...order,
        items: orderItemsList
          .filter(item => item.orderId === order.id)
          .map(item => ({
            ...item,
            product: item.product || {
              id: null,
              name: "Product Unavailable",
              description: null,
              imageUrl: null
            }
          }))
      }));

      console.log("[Orders API] Successfully processed orders with items");
      res.json(ordersWithItems);
    } catch (error) {
      console.error("[Orders API] Error fetching orders:", error);
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
      console.log("[Order Delete] Starting deletion process for order ID:", req.params.id);
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        console.log("[Order Delete] Invalid order ID:", req.params.id);
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
        console.log("[Order Delete] Order not found or unauthorized:", orderId);
        return res.status(404).json({ error: "Order not found" });
      }

      console.log("[Order Delete] Deleting order items for order:", orderId);
      // Delete associated order items first
      await db.delete(orderItems)
        .where(eq(orderItems.orderId, orderId));

      console.log("[Order Delete] Deleting order:", orderId);
      // Delete the order
      const [deletedOrder] = await db.delete(orders)
        .where(eq(orders.id, orderId))
        .returning();

      console.log("[Order Delete] Successfully deleted order:", deletedOrder);
      res.json({
        message: "Order deleted successfully",
        deletedOrder
      });
    } catch (error) {
      console.error("[Order Delete] Error deleting order:", error);
      res.status(500).json({
        error: "Failed to delete order",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // generate-sale-price endpoint
  app.post("/api/generate-sale-price", async (req, res) => {    if (!req.isAuthenticated()) returnres.status(401).json({ error: "Unauthorized" });
    try {
      // Validate and parse input data
      const { productId, buyPrice, currentPrice, condition, category } = req.body;
      const buyPriceNum = Number(buyPrice);
      if (isNaN(buyPriceNum) || buyPriceNum <= 0) {
        return res.status(400).json({ error: "Invalid buyPrice. Itmust be a number greater than 0." });
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
        model: "gemini-2.0-flash-001",
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.2,
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

  // Add this endpoint after the generate-sale-price endpoint
  app.post("/api/generate-purchase-price", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { currentPrice, condition, category, ebayData } = req.body;

      // Use the existing Gemini AI model
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.2,
        },
      });

      const prompt = `As an expert reseller, analyze this product's market data and suggest an optimal purchase price:

Market Data:
${ebayData ? `
- Current eBay Price Range: $${ebayData.lowestPrice} - $${ebayData.highestPrice}
- Average Price: $${ebayData.averagePrice}
- Number of Active Listings: ${ebayData.activeListing}
- Total Sales: ${ebayData.soldCount}` : `
- Current Market Price: ${currentPrice ? `$${currentPrice}` : 'not available'}`}
- Product Condition: ${condition || "unspecified"}
- Category: ${category || "unspecified"}

Provide a strategic purchase price that would allow for a healthy profit margin (aim for at least 30-40% ROI) while remaining competitive in the market. Consider the current market dynamics, competition level, and potential for price fluctuations.

Format your response strictly as valid JSON with this structure:
{
  "suggestedPurchasePrice": number,
  "confidence": number,
  "reasoning": string,
  "estimatedROI": number
}

Do not include any additional text outside the JSON object.`;

      const result = await model.generateContent(prompt);
      const text = await result.response.text();

      // Extract JSON from the response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON object found in response");
        }
        const jsonStr = jsonMatch[0];
        const recommendation = JSON.parse(jsonStr);

        res.json(recommendation);
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        res.status(500).json({
          error: "Failed to generate purchase price suggestion",
          details: parseError instanceof Error ? parseError.message : "Unknown error"
        });
      }
    } catch (error) {
      console.error("Error generating purchase price:", error);
      res.status(500).json({
        error: "Failed to generate purchase price suggestion",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // API routes for watchlist
  app.post("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      console.log("[Watchlist] Adding item to watchlist:", req.body);
      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      // First verify the product exists and belongs to the authenticated user
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Try to insert the watchlist item
      try {
        const [watchlistItem] = await db.insert(watchlist)
          .values({
            userId: req.user!.id,
            productId: productId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        res.status(201).json(watchlistItem);
      } catch (insertError) {
        // Check if it's a duplicate entry error
        if (insertError.code === '23505') { // PostgreSQL unique violation code
          return res.status(409).json({
            error: "Product is already in your watchlist"
          });
        }
        throw insertError;
      }
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      res.status(500).json({
        error: "Failed to add to watchlist",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add GET endpoint for watchlist
  app.get("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const watchlistItems = await db.select({
        id: watchlist.id,
        userId: watchlist.userId,
        productId: watchlist.productId,
        createdAt: watchlist.createdAt,
        product: products
      })
        .from(watchlist)
        .leftJoin(products, eq(watchlist.productId, products.id))
        .where(eq(watchlist.userId, req.user!.id))
        .orderBy(desc(watchlist.createdAt));

      res.json(watchlistItems);
    } catch (error) {
      console.error("[Watchlist] Error fetching watchlist:", error);
      res.status(500).json({
        error: "Failed to fetch watchlist",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add DELETE endpoint for watchlist
  app.delete("/api/watchlist/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    try {
      const watchlistId = parseInt(req.params.id);
      if (isNaN(watchlistId)) {
        return res.status(400).json({ error: "Invalid watchlist ID" });
      }

      const [deletedItem] = await db.delete(watchlist)
        .where(
          and(
            eq(watchlist.id, watchlistId),
            eq(watchlist.userId, req.user!.id)
          )
        )
        .returning();

      if (!deletedItem) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }

      res.json({
        message: "Product removed from watchlist",
        deletedItem
      });
    } catch (error) {
      console.error("[Watchlist] Error removing from watchlist:", error);
      res.status(500).json({
        error: "Failed to remove product from watchlist",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Analytics endpoints
  app.get("/api/analytics/revenue", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("[Analytics API] Unauthorized request to revenue endpoint");
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      console.log("[Analytics API] Processing revenue request with query params:", req.query);
      const { startDate, endDate } = req.query;
      const startDateTime = startDate ? new Date(String(startDate)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDateTime = endDate ? new Date(String(endDate)) : new Date();

      console.log("[Analytics API] Date range:", { startDateTime, endDateTime });

      // Fetch orders with products and calculate revenue
      const revenueData = await db
        .select({
          date: sql`date_trunc('day', ${orders.createdAt})::date::text`,
          revenue: sql`COALESCE(SUM(${orderItems.price}::decimal * ${orderItems.quantity}), 0)`,
          cost: sql`COALESCE(SUM(COALESCE(${products.purchasePrice}::decimal, 0) * ${orderItems.quantity}), 0)`,
          profit: sql`COALESCE(
            SUM(${orderItems.price}::decimal * ${orderItems.quantity}) - 
            SUM(COALESCE(${products.purchasePrice}::decimal, 0) * ${orderItems.quantity}), 
            0
          )`
        })
        .from(orders)
        .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(
          and(
            eq(orders.userId, req.user!.id),
            gte(orders.createdAt, startDateTime),
            lte(orders.createdAt, endDateTime)
          )
        )
        .groupBy(sql`date_trunc('day', ${orders.createdAt})`)
        .orderBy(sql`date_trunc('day', ${orders.createdAt})`);

      console.log("[Analytics API] Raw revenue data:", revenueData);

      // Fill in missing dates with zero values
      const filledData = [];
      const currentDate = new Date(startDateTime);
      currentDate.setHours(0, 0, 0, 0);

      const finalEndDate = new Date(endDateTime);
      finalEndDate.setHours(23, 59, 59, 999);

      while (currentDate <= finalEndDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const existingData = revenueData.find(d => d.date === dateStr);

        filledData.push(existingData || {
          date: dateStr,
          revenue: "0",
          cost: "0",
          profit: "0"
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log("[Analytics API] Final revenue data:", filledData);
      res.json(filledData);
    } catch (error) {
      console.error("[Analytics API] Error in revenue endpoint:", error);
      res.status(500).json({
        error: "Failed to fetch revenue analytics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/analytics/inventory", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("[Analytics API] Unauthorized request to inventory endpoint");
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      console.log("[Analytics API] Fetching inventory analytics for user:", req.user!.id);

      const inventoryData = await db
        .select({
          category: products.category,
          totalValue: sql`SUM(${products.price}::decimal * ${products.quantity})`,
          totalCost: sql`SUM(COALESCE(${products.purchasePrice}::decimal, 0) * ${products.quantity})`,
          itemCount: sql`COUNT(*)`,
          totalQuantity: sql`SUM(${products.quantity})`
        })
        .from(products)
        .where(
          and(
            eq(products.userId, req.user!.id),
            eq(products.sold, false)
          )
        )
        .groupBy(products.category);

      console.log("[Analytics API] Inventory analytics data:", inventoryData);
      res.json(inventoryData);
    } catch (error) {
      console.error("[Analytics API] Error in inventory endpoint:", error);
      res.status(500).json({
        error: "Failed to fetch inventory analytics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add new endpoint after the existing analytics endpoints
  app.get("/api/analytics/inventory-aging", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Calculate age buckets from createdAt date
      const agingData = await db
        .select({
          ageGroup: sql`
            CASE 
              WHEN NOW() - ${products.createdAt} < INTERVAL '30 days' THEN '0-30 days'
              WHEN NOW() - ${products.createdAt} < INTERVAL '60 days' THEN '31-60 days'
              WHEN NOW() - ${products.createdAt} < INTERVAL '90 days' THEN '61-90 days'
              ELSE 'Over 90 days'
            END
          `,
          totalValue: sql`SUM(${products.price}::numeric * ${products.quantity})::numeric`,
          totalCost: sql`SUM(${products.purchasePrice}::numeric * ${products.quantity})::numeric`,
          itemCount: sql`COUNT(*)::integer`,
          totalQuantity: sql`SUM(${products.quantity})::integer`,
          averagePrice: sql`AVG(${products.price})::numeric`,
          categories: sql`array_agg(DISTINCT ${products.category})`
        })
        .from(products)
        .where(
          and(
            eq(products.userId, req.user!.id),
            eq(products.sold, false)
          )
        )
        .groupBy(sql`
          CASE 
            WHEN NOW() - ${products.createdAt} < INTERVAL '30 days' THEN '0-30 days'
            WHEN NOW() - ${products.createdAt} < INTERVAL '60 days' THEN '31-60 days'
            WHEN NOW() - ${products.createdAt} < INTERVAL '90 days' THEN '61-90 days'
            ELSE 'Over 90 days'
          END
        `)
        .orderBy(sql`
          CASE ageGroup 
            WHEN '0-30 days' THEN 1
            WHEN '31-60 days' THEN 2
            WHEN '61-90 days' THEN 3
            ELSE 4
          END
        `);

      // Get detailed slow-moving items (over 60 days)
      const slowMovingItems = await db
        .select({
          id: products.id,
          name: products.name,
          category: products.category,
          price: products.price,
          purchasePrice: products.purchasePrice,
          quantity: products.quantity,
          createdAt: products.createdAt,
          daysInStock: sql`EXTRACT(DAY FROM NOW() - ${products.createdAt})::integer`,
          potentialLoss: sql`
            CASE 
              WHEN ${products.purchasePrice} IS NOT NULL 
              THEN (${products.purchasePrice} * ${products.quantity})::numeric 
              ELSE (${products.price} * 0.5 * ${products.quantity})::numeric 
            END
          `
        })
        .from(products)
        .where(
          and(
            eq(products.userId, req.user!.id),
            eq(products.sold, false),
            sql`NOW() - ${products.createdAt} >= INTERVAL '60 days'`
          )
        )
        .orderBy(sql`NOW() - ${products.createdAt}`, "desc")
        .limit(10);

      res.json({
        agingSummary: agingData,
        slowMovingItems
      });
    } catch (error) {
      console.error("Error fetching inventory aging analytics:", error);
      res.status(500).json({
        error: "Failed to fetch inventory aging analytics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/analytics/top-products", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { metric = 'profit', limit = 10 } = req.query;

      let orderMetric;
      switch (String(metric)) {
        case 'revenue':
          orderMetric = sql`SUM(${orderItems.price} * ${orderItems.quantity})`;
          break;
        case 'quantity':
          orderMetric = sql`SUM(${orderItems.quantity})`;
          break;
        case 'profit':
        default:
          orderMetric = sql`(SUM(${orderItems.price} * ${orderItems.quantity}) - SUM(${products.purchasePrice} * ${orderItems.quantity}))`;
          break;
      }

      const topProducts = await db
        .select({
          productId: products.id,
          name: products.name,
          metric: sql`${orderMetric}::numeric`,
          totalQuantity: sql`SUM(${orderItems.quantity})::integer`,
          averagePrice: sql`AVG(${orderItems.price})::numeric`
        })
        .from(products)
        .innerJoin(orderItems, eq(products.id, orderItems.productId))
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(eq(products.userId, req.user!.id))
        .groupBy(products.id, products.name)
        .orderBy(sql`${orderMetric}`, "desc")
        .limit(Number(limit));

      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({
        error: "Failed to fetch top products",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return app;
}