// Log environment variables at startup
console.log("DATABASE_URL:", process.env.DATABASE_URL);
console.log("REPL_ID:", process.env.REPL_ID);
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "NOT SET");
console.log("EBAY_CLIENT_ID", process.env.EBAY_CLIENT_ID ? "SET" : "NOT SET");
console.log("EBAY_CLIENT_SECRET", process.env.EBAY_CLIENT_SECRET? "SET" : "NOT SET");
console.log("EBAY_REDIRECT_URI", process.env.EBAY_REDIRECT_URI? "SET" : "NOT SET");

import express, { type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupVite, serveStatic } from "./vite";
import { registerRoutes } from "./routes";
import { db } from "@db";
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configure payload limits
app.use(express.json({ limit: '10mb' }));  
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure CORS
const allowedOrigins = [
  'https://1437b402-c753-46c4-ab96-0e0234bae53b-00-1vlomg3cflyir.spock.replit.dev',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}));

// Configure uploads directory
const uploadsPath = path.resolve(__dirname, '../uploads');
console.log('[Static Files] Uploads directory path:', uploadsPath);

// Add request body logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Request Body:`, req.body);
  next();
});

// Serve static files from uploads directory with logging
app.use('/uploads', (req, res, next) => {
  console.log('[Static Files] Accessing:', req.url);
  express.static(uploadsPath, {
    setHeaders: (res, path) => {
      res.set('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      res.set('Access-Control-Allow-Origin', '*');
    }
  })(req, res, (err) => {
    if (err) {
      console.error('[Static Files] Error serving:', req.url, err);
      next(err);
    } else {
      next();
    }
  });
});

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
    // Always use port 5000 as specified in .replit file
    const port = 5000;
    console.log(`[Server] Attempting to start server on port ${port}`);

    const server = createServer(app);

    // Add health check endpoint before registering other routes
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Register all routes before setting up Vite
    console.log('[Server] Registering routes...');
    registerRoutes(app);

    // Re-enable Vite setup
    console.log('[Server] Setting up Vite...');
    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    await new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`[Server] Server running on port ${port}`);
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