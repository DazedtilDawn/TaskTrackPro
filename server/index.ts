import express, { type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupVite, serveStatic } from "./vite";
import { registerRoutes } from "./routes";
import { db } from "@db";

const app = express();

// Essential middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Log request details
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Started`);
    const originalResJson = res.json;
    res.json = function (body) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Response:`, body);
        return originalResJson.call(this, body);
    };
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Completed in ${duration}ms`);
    });
    next();
});

// Initialize server with proper error handling
async function initializeServer() {
    try {
        // Use PORT from environment, fallback to 5000 (Replit's preferred port)
        const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
        console.log(`[Server] Attempting to start server on port ${port}`);

        const server = createServer(app);

        // Register all routes
        console.log('[Server] Registering routes...');
        registerRoutes(app);

        // Setup Vite for development
        console.log('[Server] Setting up Vite...');
        if (process.env.NODE_ENV !== 'production') {
            await setupVite(app, server);
        } else {
            serveStatic(app);
        }

        await new Promise<void>((resolve, reject) => {
            server.listen(port, '0.0.0.0', () => {
                console.log(`[Server] Server running on port ${port}`);

                // Use the specific Replit URL format
                if (process.env.REPL_ID) {
                    // Note: Instead of using REPL_SLUG directly, we'll construct the URL with
                    // your specific subdomain format
                    const replitDomain = process.env.REPL_ID.includes('1vlomg3cflyir') 
                        ? '1vlomg3cflyir' 
                        : process.env.REPL_SLUG || 'workspace';
                    const replitUrl = `https://${process.env.REPL_ID}-00-${replitDomain}.spock.replit.dev`;
                    console.log(`[Server] Replit URL: ${replitUrl}`);
                } else {
                    console.log(`[Server] Local URL: http://localhost:${port}`);
                }
                resolve();
            });

            server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[Server Error] Port ${port} is already in use`);
                    reject(new Error(`Port ${port} is already in use`));
                } else {
                    console.error('[Server Error] Server failed to start:', err);
                    reject(err);
                }
            });
        });

        return server;

    } catch (error) {
        console.error('[Server Error] Server initialization failed:', error);
        process.exit(1);
    }
}

// Basic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Error]:', err.stack);
    const status = (err as any).status || (err as any).statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
});

// Start server
console.log('[Server] Starting server initialization...');
initializeServer();

export default app;