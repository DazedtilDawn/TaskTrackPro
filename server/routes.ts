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

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;
  try {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      await nextRequest();
    }
  } finally {
    isProcessing = false;
    if (requestQueue.length > 0) {
      // Add delay between requests
      setTimeout(processQueue, 1000);
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
    const [product] = await db
      .insert(products)
      .values({ ...req.body, userId: req.user.id })
      .returning();
    res.json(product);
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

  // Gemini API endpoint with rate limiting and retries
  app.post("/api/analyze-images", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const analyzeRequest = async () => {
      try {
        const { images } = req.body;
        if (!images || !Array.isArray(images)) {
          return res.status(400).json({ error: "Invalid image data provided" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(500).json({ error: "Gemini API key not configured" });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

        try {
          const analysis = JSON.parse(text.replace(/```json\n|\n```/g, ''));
          res.json(analysis);
        } catch (parseError) {
          console.error('Failed to parse Gemini response:', text);
          res.status(500).json({
            error: "Failed to parse AI response into valid JSON"
          });
        }
      } catch (error) {
        console.error('Analysis error:', error);
        if (error.status === 429) {
          // Add back to queue for retry
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