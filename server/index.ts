import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Security and CORS headers middleware
app.use((req, res, next) => {
  // Allow Replit domains in development
  const allowedOrigins = ['https://*.replit.dev', 'https://*.repl.co'];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.some(allowed => 
    origin.match(new RegExp(allowed.replace('*', '.*')))
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Set CSP headers
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://*.replit.dev https://*.repl.co; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://*.replit.dev https://*.repl.co;"
  );
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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('[Server] Starting server initialization...');

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

      res.status(status).json({ message });
    });

    // Setup Vite middleware in development
    if (process.env.NODE_ENV !== "production") {
      console.log('[Server] Setting up Vite middleware in development mode');
      await setupVite(app, server);
    } else {
      console.log('[Server] Setting up static file serving in production mode');
      serveStatic(app);
    }

    const PORT = Number(process.env.PORT) || 4000; // Changed to 4000 to avoid conflicts

    // Try to start the server with better error handling
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use. Please try a different port.`);
        process.exit(1);
      } else {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
      }
    });

    server.listen(PORT, "0.0.0.0", () => {
      log(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
})();