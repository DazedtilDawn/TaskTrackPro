import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { products, watchlist, orders, orderItems } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";
import multer from 'multer';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  app.use(bodyParser.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      // @ts-ignore
      req.rawBody = buf;
    }
  }));

  // Serve static files from uploads directory
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

  // Image Analysis Endpoint
  app.post("/api/analyze-images", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { images } = req.body;
      if (!images || !Array.isArray(images)) {
        return res.status(400).json({ error: "Invalid request format" });
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        }
      });

      const prompt = `Analyze these product images and provide a detailed analysis including:
1. A clear, SEO-optimized product title
2. A detailed product description
3. Most suitable product category
4. Market analysis with:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Price suggestion range (min-max in USD)
5. 5-7 SEO keywords
6. 3-5 suggestions for listing improvement

Format the response as a JSON object with these exact keys:
{
  "title": string,
  "description": string,
  "category": string,
  "marketAnalysis": {
    "demandScore": number,
    "competitionLevel": string,
    "priceSuggestion": {
      "min": number,
      "max": number
    }
  },
  "seoKeywords": string[],
  "suggestions": string[]
}`;

      // Process images as parts
      const parts = images.map((img: any) => ({
        inlineData: {
          data: img.inlineData.data,
          mimeType: img.inlineData.mimeType
        }
      }));

      parts.unshift({ text: prompt });

      const result = await model.generateContent({
        contents: [{ role: "user", parts }]
      });

      const response = await result.response;
      const text = response.text();

      try {
        const analysis = JSON.parse(text);
        res.json(analysis);
      } catch (parseError) {
        console.error('Failed to parse analysis:', parseError);
        res.status(500).json({ error: 'Failed to parse analysis results' });
      }
    } catch (error) {
      console.error('Image analysis error:', error);
      res.status(500).json({ 
        error: "Failed to analyze images",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}