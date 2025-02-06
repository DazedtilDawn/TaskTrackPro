import express, { type Request, Response, NextFunction } from "express";
import { setupVite, serveStatic } from "./vite";
import { registerRoutes } from "./routes";
import { db } from "@db";

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

      console.log(logLine); // Use console.log for detailed logging
    }
  });

  next();
});


// Initialize server with proper error handling
async function initializeServer() {
  try {
    // Try multiple ports starting from 8000
    const tryPort = async (startPort: number): Promise<number> => {
      for (let port = startPort; port < startPort + 10; port++) {
        console.log(`Attempting to start server on port ${port}...`);
        try {
          await new Promise<void>((resolve, reject) => {
            const server = app.listen(port, '0.0.0.0');

            server.once('listening', () => {
              console.log(`Server successfully bound to port ${port}`);
              server.close(() => {
                resolve();
              });
            });

            server.once('error', (err: NodeJS.ErrnoException) => {
              if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is in use, trying next port...`);
                resolve();
              } else {
                reject(err);
              }
            });
          });

          // If we get here, the port is available
          console.log(`Port ${port} is available, starting server...`);
          const server = app.listen(port, '0.0.0.0', () => {
            console.log(`Server running on port ${port}`);
            if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
              console.log(`Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
            }
          });

          return port;
        } catch (err) {
          console.error(`Error on port ${port}:`, err);
          continue;
        }
      }
      throw new Error('No available ports found in range 8000-8010');
    };

    const port = await tryPort(8000);
    const server = app.listen(port);

    // Setup Vite for development
    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Register all routes
    registerRoutes(app);

    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
  }
}

// Basic error handler (merged with original error handler)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.stack);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  //throw err; //Removed throw, as it's already handled by process.exit(1) in initializeServer
});


// Start server
initializeServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;