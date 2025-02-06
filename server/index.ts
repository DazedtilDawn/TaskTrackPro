import express from "express";
import { setupVite, serveStatic } from "./vite";
import { registerRoutes } from "./routes";
import { db } from "@db";

const app = express();

// Essential middleware
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Initialize server with proper error handling
async function initializeServer() {
  try {
    // Try multiple ports if default is in use
    const tryPort = async (startPort: number): Promise<number> => {
      for (let port = startPort; port < startPort + 10; port++) {
        try {
          await new Promise((resolve, reject) => {
            const server = app.listen(port, '0.0.0.0', () => {
              resolve(server);
            }).on('error', (err: any) => {
              if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} in use, trying next port...`);
                resolve(null);
              } else {
                reject(err);
              }
            });
          });
          console.log(`Server running on port ${port}`);
          if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
            console.log(`Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
          }
          return port;
        } catch (err) {
          console.error(`Error trying port ${port}:`, err);
        }
      }
      throw new Error('No available ports found');
    };

    const port = await tryPort(4000);
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

// Basic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
initializeServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;