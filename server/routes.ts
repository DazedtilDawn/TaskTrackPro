import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq, and } from "drizzle-orm";
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

  // Products
  app.get("/api/products", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const allProducts = await db.query.products.findMany({
        where: eq(products.userId, req.user.id),
      });
      res.json(allProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { name, description, price, quantity, sku } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: "Product name is required" });
      }

      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      // Only include SKU if it's provided and not empty
      const skuValue = sku?.trim() || null;

      const productData = {
        name: name.trim(),
        description: description?.trim() || null,
        price: price ? parseFloat(price) : null,
        quantity: quantity ? parseInt(quantity) : 0,
        imageUrl,
        userId: req.user.id,
        sku: skuValue,
        aiAnalysis: req.body.aiAnalysis ? JSON.parse(req.body.aiAnalysis) : null,
        ebayPrice: req.body.ebayPrice ? parseFloat(req.body.ebayPrice) : null,
        condition: req.body.condition || null,
        brand: req.body.brand?.trim() || null,
        category: req.body.category?.trim() || null,
      };

      const [product] = await db
        .insert(products)
        .values(productData)
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

  app.patch("/api/products/:id", upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const productId = parseInt(req.params.id);

      // First verify the product belongs to the authenticated user
      const [existingProduct] = await db.select()
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.userId, req.user.id)
        ))
        .limit(1);

      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found or access denied" });
      }

      const updateData: any = { ...req.body };

      // Handle image upload if present
      if (req.file) {
        updateData.imageUrl = `/uploads/${req.file.filename}`;
      }

      // Handle SKU - only update if provided and not empty
      if ('sku' in req.body) {
        updateData.sku = req.body.sku?.trim() || null;
      }

      // Parse aiAnalysis if it's a string
      if (typeof req.body.aiAnalysis === 'string') {
        updateData.aiAnalysis = JSON.parse(req.body.aiAnalysis);
      }

      const [product] = await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, productId))
        .returning();

      res.json(product);
    } catch (error) {
      console.error('Failed to update product:', error);
      res.status(500).json({
        error: "Failed to update product",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const productId = parseInt(req.params.id);

      // Verify the product belongs to the authenticated user
      const [product] = await db.select()
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.userId, req.user.id)
        ))
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found or access denied" });
      }

      await db.delete(products)
        .where(eq(products.id, productId));

      res.sendStatus(200);
    } catch (error) {
      console.error('Failed to delete product:', error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Watchlist
  app.get("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const items = await db.query.watchlist.findMany({
        where: eq(watchlist.userId, req.user.id),
        with: {
          product: true,
        },
      });
      res.json(items);
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [item] = await db
        .insert(watchlist)
        .values({
          productId: req.body.productId,
          userId: req.user.id,
        })
        .returning();

      const watchlistItem = await db.query.watchlist.findFirst({
        where: eq(watchlist.id, item.id),
        with: {
          product: true,
        },
      });

      res.json(watchlistItem);
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const watchlistId = parseInt(req.params.id);

      // Verify the watchlist item belongs to the authenticated user
      const [item] = await db.select()
        .from(watchlist)
        .where(and(
          eq(watchlist.id, watchlistId),
          eq(watchlist.userId, req.user.id)
        ))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Watchlist item not found or access denied" });
      }

      await db.delete(watchlist)
        .where(eq(watchlist.id, watchlistId));

      res.sendStatus(200);
    } catch (error) {
      console.error('Failed to remove from watchlist:', error);
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  // Orders
  app.get("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
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
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [order] = await db
        .insert(orders)
        .values({
          userId: req.user.id,
          status: req.body.status || 'pending',
          total: req.body.total,
        })
        .returning();

      if (req.body.items && Array.isArray(req.body.items)) {
        await db.insert(orderItems).values(
          req.body.items.map((item: any) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          }))
        );
      }

      const createdOrder = await db.query.orders.findFirst({
        where: eq(orders.id, order.id),
        with: {
          items: {
            with: {
              product: true,
            },
          },
        },
      });

      res.json(createdOrder);
    } catch (error) {
      console.error('Failed to create order:', error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}