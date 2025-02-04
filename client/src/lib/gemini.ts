import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiRequest } from "./queryClient";

interface SmartListingAnalysis {
  title: string;
  description: string;
  category: string;
  marketAnalysis: {
    demandScore: number;
    competitionLevel: string;
    priceSuggestion: {
      min: number;
      max: number;
    };
  };
  seoKeywords: string[];
  suggestions: string[];
}

interface ProductAnalysis {
  name: string;
  description: string;
  price?: number;
  sku?: string;
}

interface AIAnalysisResult {
  suggestions: string[];
  marketAnalysis: {
    demandScore: number;
    competitionLevel: string;
    priceSuggestion: {
      min: number;
      max: number;
    };
  };
  category: string;
  seoKeywords: string[];
  improvementAreas: string[];
}

let genAI: GoogleGenerativeAI | null = null;

async function initializeGemini() {
  if (!genAI) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please make sure it's properly configured.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      const MAX_DIMENSION = 600; // Further reduced for smaller file size

      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw image with white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with reduced quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.6 // Further reduced quality for smaller file size
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = URL.createObjectURL(file);
  });
}

async function fileToBase64(file: File): Promise<string> {
  const compressedBlob = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result) {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64Data = (reader.result as string).split(",")[1];
      if (!base64Data) {
        reject(new Error("Failed to extract base64 data"));
        return;
      }
      resolve(base64Data);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(compressedBlob);
  });
}

export async function generateSmartListing(
  files: File[]
): Promise<SmartListingAnalysis> {
  if (!files.length) {
    throw new Error("No files provided for analysis");
  }

  try {
    console.log('Processing image files...');
    // Process one image at a time
    const processedImages: string[] = [];

    for (const file of files) {
      // Validate file
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        throw new Error(`Invalid file type: ${file.type}. Only JPEG, PNG, and WebP are supported.`);
      }
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(`File too large: ${file.name}. Maximum size is 4MB.`);
      }

      const base64Data = await fileToBase64(file);
      processedImages.push(base64Data);

      // Add delay between processing images
      if (files.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Images processed successfully');

    // Add delay before making the API request
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await apiRequest(
      "POST",
      "/api/analyze-images",
      { images: processedImages }
    );

    const analysis = await response.json();

    if (!analysis || typeof analysis.error === 'string') {
      throw new Error(analysis.error || 'Failed to analyze images');
    }

    return analysis;
  } catch (error) {
    console.error("Smart listing generation error:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to generate smart listing");
  }
}

export async function analyzeBatchProducts(products: ProductAnalysis[]): Promise<Map<string, AIAnalysisResult>> {
  const genAI = await initializeGemini();

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
  const results = new Map<string, AIAnalysisResult>();
  const batchSize = 5; // Process 5 products at a time

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const promises = batch.map(async (product) => {
      const prompt = `Analyze this product for an e-commerce inventory system:
Name: ${product.name}
Description: ${product.description}
${product.price ? `Price: $${product.price}` : ''}
${product.sku ? `SKU: ${product.sku}` : ''}

Please provide a detailed analysis including:
1. Product category
2. SEO keywords (5-7 keywords)
3. 3-5 specific suggestions to improve the listing
4. Market analysis with:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Price range suggestion
5. Areas for improvement

Format the response in JSON.`;

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const analysis = JSON.parse(text);
        results.set(product.name, analysis);
      } catch (error) {
        console.error(`Error analyzing product ${product.name}:`, error);
        results.set(product.name, {
          suggestions: ["Error during analysis"],
          marketAnalysis: {
            demandScore: 0,
            competitionLevel: "unknown",
            priceSuggestion: { min: 0, max: 0 },
          },
          category: "unknown",
          seoKeywords: [],
          improvementAreas: ["Analysis failed"],
        });
      }
    });

    await Promise.all(promises);
    // Add a small delay between batches to respect rate limits
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export async function analyzeProduct({ name, description }: ProductAnalysis): Promise<AIAnalysisResult> {
  const results = await analyzeBatchProducts([{ name, description }]);
  return results.get(name) || {
    suggestions: ["Analysis failed"],
    marketAnalysis: {
      demandScore: 0,
      competitionLevel: "unknown",
      priceSuggestion: { min: 0, max: 0 },
    },
    category: "unknown",
    seoKeywords: [],
    improvementAreas: ["Analysis failed"],
  };
}