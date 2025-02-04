import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";

// Rate limiting setup
const requestQueue: Array<() => Promise<any>> = [];
let isProcessing = false;
let requestCount = 0;
let lastRequestTime = Date.now();

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  // Rate limiting: 10 requests per minute
  const now = Date.now();
  if (now - lastRequestTime < 60000) { // Within the same minute
    if (requestCount >= 10) {
      // Wait until the next minute
      setTimeout(processQueue, 60000 - (now - lastRequestTime));
      return;
    }
  } else {
    // Reset counter for new minute
    requestCount = 0;
    lastRequestTime = now;
  }

  isProcessing = true;
  try {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      await nextRequest();
      requestCount++;
    }
  } finally {
    isProcessing = false;
    if (requestQueue.length > 0) {
      // Add delay between requests within the rate limit
      setTimeout(processQueue, 6000); // 6 seconds between requests to stay under 10 RPM
    }
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  app.use(bodyParser.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      // @ts-ignore
      req.rawBody = buf;
    }
  }));

  // Products
  app.get("/api/products", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const allProducts = await db.query.products.findMany({
      where: eq(products.userId, req.user.id),
    });
    res.json(allProducts);
  });

  app.post("/api/products", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Validate required fields
    const { name, description, price, quantity } = req.body;

    // Debug logging
    console.log('Received product creation request:', {
      name,
      description: description?.length,
      price,
      quantity
    });

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }

    try {
      const [product] = await db
        .insert(products)
        .values({ 
          ...req.body,
          name: name.trim(),
          description: description || null,
          price: price || null,
          quantity: quantity || 0,
          userId: req.user.id 
        })
        .returning();
      res.json(product);
    } catch (error) {
      console.error('Failed to create product:', error);
      res.status(500).json({ 
        error: "Failed to create product",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const [product] = await db
      .update(products)
      .set(req.body)
      .where(eq(products.id, parseInt(req.params.id)))
      .returning();
    res.json(product);
  });

  // Add DELETE endpoint for products
  app.delete("/api/products/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const productId = parseInt(req.params.id);

    // First verify the product belongs to the authenticated user
    const [product] = await db.select()
      .from(products)
      .where(
        eq(products.id, productId),
        eq(products.userId, req.user.id)
      )
      .limit(1);

    if (!product) {
      return res.status(404).json({ error: "Product not found or access denied" });
    }

    // Delete the product
    await db.delete(products)
      .where(eq(products.id, productId));

    res.sendStatus(200);
  });

  // Gemini API endpoint with enhanced rate limiting
  app.post("/api/analyze-images", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const analyzeRequest = async () => {
      try {
        console.log('Starting image analysis request');
        const { images } = req.body;
        if (!images || !Array.isArray(images)) {
          console.error('Invalid image data:', req.body);
          return res.status(400).json({ error: "Invalid image data provided" });
        }

        console.log(`Processing ${images.length} images`);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.error('Missing Gemini API key');
          return res.status(500).json({ error: "Gemini API key not configured" });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.0-flash-exp",
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
          }
        });

        console.log('Sending request to Gemini API');
        const prompt = `Analyze these product images for an e-commerce listing. Provide a detailed analysis including:
1. A compelling product title
2. A detailed, SEO-friendly product description
3. Product category classification
4. Market analysis including:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Suggested price range (min and max)
5. 5-7 relevant SEO keywords
6. 3-5 specific suggestions to improve the listing

Format your response as a valid JSON object with the following structure:
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
}`;
        const result = await model.generateContent([prompt, ...images]);
        const response = await result.response;
        const text = await response.text();
        console.log('Received response from Gemini');

        try {
          const analysis = JSON.parse(text.replace(/```json\n|\n```/g, ''));
          console.log('Successfully parsed analysis response');
          res.json(analysis);
        } catch (parseError) {
          console.error('Failed to parse Gemini response:', text);
          res.status(500).json({
            error: "Failed to parse AI response into valid JSON"
          });
        }
      } catch (error) {
        console.error('Analysis error:', error);
        if (error instanceof Error && error.message.includes('429')) {
          console.log('Rate limit hit, queueing for retry');
          requestQueue.push(analyzeRequest);
          return res.status(429).json({
            error: "Rate limit exceeded. Request queued for retry."
          });
        }
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to analyze images"
        });
      }
    };

    requestQueue.push(analyzeRequest);
    processQueue();
  });

  // Watchlist
  app.get("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const items = await db.query.watchlist.findMany({
      where: eq(watchlist.userId, req.user.id),
      with: {
        product: true,
      },
    });
    res.json(items);
  });

  app.post("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const [item] = await db
      .insert(watchlist)
      .values({ ...req.body, userId: req.user.id })
      .returning();
    res.json(item);
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await db
      .delete(watchlist)
      .where(eq(watchlist.id, parseInt(req.params.id)));
    res.sendStatus(200);
  });

  // Orders
  app.get("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userOrders = await db.query.orders.findMany({
      where: eq(orders.userId, req.user.id),
      with: {
        items: {
          with: {
            product: true,
          },
        },
      },
    });
    res.json(userOrders);
  });

  app.post("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const [order] = await db
      .insert(orders)
      .values({ ...req.body, userId: req.user.id })
      .returning();

    if (req.body.items) {
      await db.insert(orderItems).values(
        req.body.items.map((item: any) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        }))
      );
    }

    res.json(order);
  });

  const httpServer = createServer(app);
  return httpServer;
}