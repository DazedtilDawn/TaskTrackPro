import express from "express";

const app = express();

// Essential middleware
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Basic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Initialize server with proper error handling
async function initializeServer() {
  try {
    const PORT = Number(process.env.PORT) || 4000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Minimal server running on port ${PORT}`);
      if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        console.log(`Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
      }
    });

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

// Start server
initializeServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;