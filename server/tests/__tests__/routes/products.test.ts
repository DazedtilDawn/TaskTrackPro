import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { setupAuth } from '../../../auth';
import { pool } from '@db';
import connectPg from 'connect-pg-simple';
import { drizzle } from 'drizzle-orm/node-postgres';
import { products } from '@db/schema';
import { eq } from 'drizzle-orm';

const PostgresSessionStore = connectPg(session);
const db = drizzle(pool);

// Create a test app instance
const app = express();
app.use(express.json());
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    store: new PostgresSessionStore({ pool, createTableIfMissing: true }),
}));

// Setup auth and routes
setupAuth(app);

describe('Product API Routes', () => {
    let testProductId: number;

    // Helper function to authenticate requests
    const authenticateRequest = async (agent: request.SuperAgentTest) => {
        // Simulate login - adjust based on your auth implementation
        await agent
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'testpass' });
    };

    beforeAll(async () => {
        // Setup test database state
        await db.delete(products);
    });

    afterAll(async () => {
        // Cleanup test database
        await db.delete(products);
        await pool.end();
    });

    describe('POST /api/products', () => {
        it('creates a new product when authenticated', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            const newProduct = {
                name: 'Test Product',
                description: 'Test Description',
                price: '29.99',
                sku: 'TEST123',
                quantity: 1,
                condition: 'new',
                brand: 'TestBrand',
                category: 'TestCategory',
            };

            const response = await agent
                .post('/api/products')
                .send(newProduct)
                .expect(201);

            expect(response.body).toMatchObject({
                name: newProduct.name,
                description: newProduct.description,
                price: newProduct.price,
            });

            testProductId = response.body.id;
        });

        it('returns 401 when not authenticated', async () => {
            await request(app)
                .post('/api/products')
                .send({
                    name: 'Test Product',
                    description: 'Test Description',
                    price: '29.99',
                })
                .expect(401);
        });
    });

    describe('GET /api/products', () => {
        it('returns list of products when authenticated', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            const response = await agent
                .get('/api/products')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('name');
        });
    });

    describe('GET /api/products/:id', () => {
        it('returns a single product when authenticated', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            const response = await agent
                .get(`/api/products/${testProductId}`)
                .expect(200);

            expect(response.body).toMatchObject({
                id: testProductId,
                name: 'Test Product',
            });
        });

        it('returns 404 for non-existent product', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            await agent
                .get('/api/products/99999')
                .expect(404);
        });
    });

    describe('PUT /api/products/:id', () => {
        it('updates a product when authenticated', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            const updates = {
                name: 'Updated Test Product',
                price: '39.99',
            };

            const response = await agent
                .put(`/api/products/${testProductId}`)
                .send(updates)
                .expect(200);

            expect(response.body).toMatchObject(updates);
        });
    });

    describe('DELETE /api/products/:id', () => {
        it('deletes a product when authenticated', async () => {
            const agent = request.agent(app);
            await authenticateRequest(agent);

            await agent
                .delete(`/api/products/${testProductId}`)
                .expect(200);

            // Verify product is deleted
            await agent
                .get(`/api/products/${testProductId}`)
                .expect(404);
        });
    });
}); 