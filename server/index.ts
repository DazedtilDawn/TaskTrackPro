import express, { type Request, Response, NextFunction } from "express";
import { setupVite, serveStatic } from "./vite";
import type { Server } from "http";
import { db } from "@db";
import { registerRoutes } from "./routes";

const app = express();

// Essential middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

// Initialize server with proper error handling
async function initializeServer() {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
    console.log(`Attempting to start server on port ${port}...`);

    const server: Server = await new Promise((resolve, reject) => {
      const httpServer = app.listen(port, '0.0.0.0', () => {
        console.log(`Server successfully started on port ${port}`);
        if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
          console.log(`Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
        }
        resolve(httpServer);
      });

      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${port} is already in use`);
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
    });

    // Register all routes
    registerRoutes(app);

    // Setup Vite for development
    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
  }
}

// Basic error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.stack);
  const status = (err as any).status || (err as any).statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

// Start server
initializeServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;