import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

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
