import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Configure bodyParser for larger file uploads
  app.use(bodyParser.json({
    limit: '50mb', // Increase payload size limit
    verify: (req, res, buf) => {
      // Store raw body for verification if needed
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

  // Gemini API endpoint
  app.post("/api/analyze-images", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

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
      const text = response.text();

      // Ensure we get valid JSON
      try {
        const analysis = JSON.parse(text);
        res.json(analysis);
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', text);
        res.status(500).json({
          error: "Failed to parse AI response into valid JSON"
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to analyze images"
      });
    }
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