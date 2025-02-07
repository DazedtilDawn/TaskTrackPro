import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from "supertest";
import express, { Express } from "express";
import { registerRoutes } from "../routes";
import { db } from "../../db";
import { products, orders, orderItems, users } from "../../db/schema";
import { eq } from "drizzle-orm";

// Dummy user for authentication tests
const dummyUser = {
    id: 1,
    username: "testuser",
    password: "hashedpassword", // In a real app, this would be properly hashed
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe("Analytics Endpoints", () => {
    let app: Express;

    // Before all tests, create an Express app, install a fake auth middleware,
    // register routes, and seed test data
    beforeAll(async () => {
        // Create a new Express application for testing
        app = express();
        app.use(express.json());

        // Fake authentication middleware: mark every request as authenticated
        // and assign dummyUser
        app.use((req, _res, next) => {
            req.isAuthenticated = () => true;
            req.user = dummyUser;
            next();
        });

        // Register our routes
        registerRoutes(app);

        // Clear existing test data
        await db.delete(orderItems).where(eq(orderItems.orderId, 1)).execute();
        await db.delete(orders).where(eq(orders.userId, dummyUser.id)).execute();
        await db.delete(products).where(eq(products.userId, dummyUser.id)).execute();
        await db.delete(users).where(eq(users.id, dummyUser.id)).execute();

        // Insert test user
        await db.insert(users).values(dummyUser).execute();

        // Insert test products
        const testProducts = [
            {
                userId: dummyUser.id,
                name: "Test Product 1",
                description: "A test product",
                price: "100.00",
                purchasePrice: "60.00",
                quantity: 2,
                sold: false,
                createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
                updatedAt: new Date(),
                category: "Electronics",
            },
            {
                userId: dummyUser.id,
                name: "Test Product 2",
                description: "Another test product",
                price: "150.00",
                purchasePrice: "90.00",
                quantity: 1,
                sold: false,
                createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
                updatedAt: new Date(),
                category: "Clothing",
            },
            {
                userId: dummyUser.id,
                name: "Test Product 3",
                description: "A third test product",
                price: "200.00",
                purchasePrice: "120.00",
                quantity: 3,
                sold: false,
                createdAt: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000), // 75 days ago
                updatedAt: new Date(),
                category: "Electronics",
            }
        ];

        for (const product of testProducts) {
            await db.insert(products).values(product).execute();
        }

        // Create test orders and order items
        const testOrder = {
            userId: dummyUser.id,
            status: "completed",
            total: "200.00",
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
            updatedAt: new Date(),
        };

        const [order] = await db.insert(orders).values(testOrder).returning().execute();

        // Get the inserted products
        const insertedProducts = await db
            .select()
            .from(products)
            .where(eq(products.userId, dummyUser.id))
            .execute();

        // Create order items for the products
        const orderItemsData = [
            {
                orderId: order.id,
                productId: insertedProducts[0].id,
                quantity: 1,
                price: "100.00",
            },
            {
                orderId: order.id,
                productId: insertedProducts[1].id,
                quantity: 1,
                price: "150.00",
            }
        ];

        for (const item of orderItemsData) {
            await db.insert(orderItems).values({
                ...item,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).execute();
        }
    });

    // After all tests, clean up the test data
    afterAll(async () => {
        await db.delete(orderItems).where(eq(orderItems.orderId, 1)).execute();
        await db.delete(orders).where(eq(orders.userId, dummyUser.id)).execute();
        await db.delete(products).where(eq(products.userId, dummyUser.id)).execute();
        await db.delete(users).where(eq(users.id, dummyUser.id)).execute();
    });

    // Test the revenue analytics endpoint
    test("GET /api/analytics/revenue returns daily revenue data", async () => {
        const response = await request(app)
            .get("/api/analytics/revenue")
            .query({
                startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                endDate: new Date().toISOString(),
            })
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        response.body.forEach((data: any) => {
            expect(data).toHaveProperty("date");
            expect(data).toHaveProperty("revenue");
            expect(data).toHaveProperty("cost");
            expect(data).toHaveProperty("profit");

            // Verify data types
            expect(typeof data.date).toBe("string");
            expect(typeof data.revenue).toBe("string");
            expect(typeof data.cost).toBe("string");
            expect(typeof data.profit).toBe("string");
        });

        // Verify that we have data for our test order
        const orderDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];
        const orderData = response.body.find((d: any) => d.date === orderDate);
        expect(orderData).toBeDefined();
        expect(parseFloat(orderData.revenue)).toBe(250); // 100 + 150
    });

    // Test the inventory analytics endpoint
    test("GET /api/analytics/inventory returns aggregated inventory by category", async () => {
        const response = await request(app)
            .get("/api/analytics/inventory")
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        response.body.forEach((item: any) => {
            expect(item).toHaveProperty("category");
            expect(item).toHaveProperty("totalValue");
            expect(item).toHaveProperty("totalCost");
            expect(item).toHaveProperty("itemCount");
            expect(item).toHaveProperty("totalQuantity");

            // Verify data types
            expect(typeof item.category).toBe("string");
            expect(typeof item.totalValue).toBe("string");
            expect(typeof item.totalCost).toBe("string");
            expect(typeof item.itemCount).toBe("number");
            expect(typeof item.totalQuantity).toBe("number");
        });

        // Verify category aggregations
        const electronics = response.body.find((item: any) => item.category === "Electronics");
        expect(electronics).toBeDefined();
        expect(electronics.itemCount).toBe(2); // We added 2 electronics products
    });

    // Test the top products analytics endpoint
    test("GET /api/analytics/top-products returns sorted top products", async () => {
        const response = await request(app)
            .get("/api/analytics/top-products")
            .query({ metric: "profit", limit: 5 })
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        response.body.forEach((item: any) => {
            expect(item).toHaveProperty("productId");
            expect(item).toHaveProperty("name");
            expect(item).toHaveProperty("metric");
            expect(item).toHaveProperty("totalQuantity");
            expect(item).toHaveProperty("averagePrice");

            // Verify data types
            expect(typeof item.productId).toBe("number");
            expect(typeof item.name).toBe("string");
            expect(typeof item.metric).toBe("string");
            expect(typeof item.totalQuantity).toBe("number");
            expect(typeof item.averagePrice).toBe("string");
        });

        // Verify sorting
        let lastMetric = Infinity;
        response.body.forEach((item: any) => {
            const currentMetric = parseFloat(item.metric);
            expect(currentMetric).toBeLessThanOrEqual(lastMetric);
            lastMetric = currentMetric;
        });
    });

    // Test the inventory aging analytics endpoint
    test("GET /api/analytics/inventory-aging returns aging summary and slow-moving items", async () => {
        const response = await request(app)
            .get("/api/analytics/inventory-aging")
            .expect(200);

        expect(response.body).toHaveProperty("agingSummary");
        expect(response.body).toHaveProperty("slowMovingItems");
        expect(Array.isArray(response.body.agingSummary)).toBe(true);
        expect(Array.isArray(response.body.slowMovingItems)).toBe(true);

        // Verify aging summary structure
        response.body.agingSummary.forEach((item: any) => {
            expect(item).toHaveProperty("ageGroup");
            expect(item).toHaveProperty("totalValue");
            expect(item).toHaveProperty("totalCost");
            expect(item).toHaveProperty("itemCount");
            expect(item).toHaveProperty("totalQuantity");
            expect(item).toHaveProperty("averagePrice");
            expect(item).toHaveProperty("categories");

            // Verify data types
            expect(typeof item.ageGroup).toBe("string");
            expect(typeof item.totalValue).toBe("string");
            expect(typeof item.totalCost).toBe("string");
            expect(typeof item.itemCount).toBe("number");
            expect(typeof item.totalQuantity).toBe("number");
            expect(typeof item.averagePrice).toBe("string");
            expect(Array.isArray(item.categories)).toBe(true);
        });

        // Verify slow-moving items structure
        response.body.slowMovingItems.forEach((item: any) => {
            expect(item).toHaveProperty("id");
            expect(item).toHaveProperty("name");
            expect(item).toHaveProperty("category");
            expect(item).toHaveProperty("price");
            expect(item).toHaveProperty("purchasePrice");
            expect(item).toHaveProperty("quantity");
            expect(item).toHaveProperty("createdAt");
            expect(item).toHaveProperty("daysInStock");
            expect(item).toHaveProperty("potentialLoss");

            // Verify data types
            expect(typeof item.id).toBe("number");
            expect(typeof item.name).toBe("string");
            expect(typeof item.category).toBe("string");
            expect(typeof item.price).toBe("string");
            expect(["string", "object"].includes(typeof item.purchasePrice)).toBe(true); // can be null
            expect(typeof item.quantity).toBe("number");
            expect(typeof item.createdAt).toBe("string");
            expect(typeof item.daysInStock).toBe("number");
            expect(typeof item.potentialLoss).toBe("string");
        });

        // Verify that our 75-day old product appears in slow-moving items
        const slowMovingProduct = response.body.slowMovingItems.find(
            (item: any) => item.name === "Test Product 3"
        );
        expect(slowMovingProduct).toBeDefined();
        expect(slowMovingProduct.daysInStock).toBeGreaterThanOrEqual(60);
    });
}); 