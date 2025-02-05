import express, { type Express } from "express";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import viteConfig from "../vite.config";
import { type Server } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });

  // Mount Vite's middleware only.
  // The proxy defined in vite.config.ts will forward /api requests appropriately.
  app.use(vite.middlewares);
}

// Ensure there is only one definition of serveStatic.
export function serveStatic(app: Express) {
  // Update the path to point to your build output folder
  const distPath = path.resolve(__dirname, "../dist/public");
  if (!distPath) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  // Fallback to index.html for any unmatched routes.
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
