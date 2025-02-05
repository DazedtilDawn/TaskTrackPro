import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { db } from "@db";
import { Pool } from "@neondatabase/serverless";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Security and CORS headers middleware
app.use((req, res, next) => {
  // Get the host from the request
  const host = req.get('host');

  // Allow Replit domains and our development domains
  const allowedOrigins = [
    'https://*.replit.dev',
    'https://*.repl.co',
    `https://${host}`,
    `http://${host}`
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.some(allowed => 
    origin.match(new RegExp(allowed.replace('*', '.*')))
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Fix CSP header formatting
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ws: wss: https://*.replit.dev https://*.repl.co https://${host}`
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  next();
});

// Add request logging middleware
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
        const summary = JSON.stringify(capturedJsonResponse).slice(0, 50);
        logLine += ` :: ${summary}${summary.length >= 50 ? '...' : ''}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('[Server] Starting server initialization...');

    // Test database connection
    try {
      await db.execute('SELECT 1');
      console.log('[Server] Database connection verified');
    } catch (error) {
      console.error('[Server] Database connection failed:', error);
      process.exit(1);
    }

    // Setup authentication
    setupAuth(app);
    console.log('[Server] Auth setup complete');

    // Register API routes
    const server = registerRoutes(app);
    console.log('[Server] API routes registered');

    // Add error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error('[Error Handler]', {
        status,
        message,
        stack: err.stack
      });

      res.status(status).json({ 
        error: message,
        ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
      });
    });

    // Setup Vite middleware in development
    if (process.env.NODE_ENV !== "production") {
      console.log('[Server] Setting up Vite middleware in development mode');
      await setupVite(app, server);
    } else {
      console.log('[Server] Setting up static file serving in production mode');
      serveStatic(app);
    }

    const PORT = Number(process.env.PORT) || 4000;

    server.listen(PORT, "0.0.0.0", () => {
      log(`Server is running on port ${PORT}`);
      console.log(`[Server] Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
})();