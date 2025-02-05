import express from "express";
import { db } from "@db";

const app = express();

// Basic JSON parsing
app.use(express.json());

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Initialize server
async function initializeServer() {
  try {
    // Verify database connection
    await db.execute('SELECT 1');
    console.log('Database connection verified');

    const PORT = Number(process.env.PORT) || 4000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Minimal server running on port ${PORT}`);
      if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        console.log(`Full URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
      }
    });

    return server;
  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
  }
}

// Start server
initializeServer().catch(console.error);