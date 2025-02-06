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
  id: number;  // Add id field for unique identification
  name: string;
  description: string;
  price?: number;
  sku?: string;
  condition?: string;
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

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  const compressedBlob = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result) {
        console.error('Failed to read file');
        return reject(new Error("Failed to read file"));
      }
      // Extract the mime type from the file and keep only the base64 data
      const resultStr = reader.result as string;
      const parts = resultStr.split(",");
      if (parts.length < 2) {
        console.error('Failed to extract base64 data');
        return reject(new Error("Failed to extract base64 data"));
      }
      resolve({
        inlineData: {
          data: parts[1],
          mimeType: file.type,
        },
      });
    };
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      reject(new Error("File reading error"));
    };
    reader.readAsDataURL(compressedBlob);
  });
}

export async function generateSmartListing(
  files: File[]
): Promise<SmartListingAnalysis> {
  console.log('generateSmartListing: Starting with files:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));

  if (!files.length) {
    console.error('generateSmartListing: No files provided');
    throw new Error("No files provided for analysis");
  }

  try {
    console.log('generateSmartListing: Processing image files...');
    const imageParts = [];

    for (const file of files) {
      console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`);

      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        console.error(`Invalid file type: ${file.type}`);
        throw new Error(`Invalid file type: ${file.type}. Only JPEG, PNG, and WebP are supported.`);
      }
      if (file.size > 4 * 1024 * 1024) {
        console.error(`File too large: ${file.name} (${file.size} bytes)`);
        throw new Error(`File too large: ${file.name}. Maximum size is 4MB.`);
      }

      const part = await fileToGenerativePart(file);
      imageParts.push(part);

      if (files.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('generateSmartListing: All images processed successfully');
    await new Promise(resolve => setTimeout(resolve, 2000));

    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 3000;

    while (retries < maxRetries) {
      try {
        console.log(`generateSmartListing: Sending analysis request (attempt ${retries + 1}/${maxRetries})`);
        const response = await apiRequest(
          "POST",
          "/api/analyze-images",
          { images: imageParts }
        );

        console.log('generateSmartListing: Received response:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });

        if (response.status === 429) {
          console.log(`Rate limited, attempt ${retries + 1} of ${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (retries + 1)));
          retries++;
          continue;
        }

        const text = await response.text();
        console.log('generateSmartListing: Response text:', text.substring(0, 200) + '...');

        try {
          const analysis = JSON.parse(text);
          if (!analysis || typeof analysis.error === 'string') {
            console.error('generateSmartListing: Invalid analysis response:', analysis);
            throw new Error(analysis.error || 'Failed to analyze images');
          }
          console.log('generateSmartListing: Successfully parsed analysis');
          return analysis;
        } catch (parseError) {
          console.error('generateSmartListing: Failed to parse API response:', text);
          throw new Error('Failed to parse analysis results');
        }
      } catch (error) {
        console.error(`generateSmartListing: Request error (attempt ${retries + 1}):`, error);
        if (retries === maxRetries - 1) throw error;
        retries++;
        await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
      }
    }

    throw new Error('Maximum retry attempts reached');
  } catch (error) {
    console.error("generateSmartListing: Fatal error:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to generate smart listing");
  }
}

// Helper function to compress image
async function compressImage(file: File): Promise<Blob> {
  console.log(`compressImage: Starting compression for ${file.name}`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      console.log(`Original dimensions: ${img.width}x${img.height}`);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        reject(new Error('Could not get canvas context'));
        return;
      }

      let width = img.width;
      let height = img.height;
      const MAX_DIMENSION = 600;

      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }

      console.log(`Resized dimensions: ${width}x${height}`);

      canvas.width = width;
      canvas.height = height;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error('Failed to create blob from canvas');
            reject(new Error('Failed to compress image'));
            return;
          }
          console.log(`Compressed size: ${blob.size} bytes`);
          resolve(blob);
        },
        'image/jpeg',
        0.7
      );
    };

    img.onerror = (err) => {
      console.error('Failed to load image:', err);
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = URL.createObjectURL(file);
  });
}

// Helper function to convert file to base64
async function fileToBase64(file: File): Promise<string> {
  console.log(`fileToBase64: Converting ${file.name} to base64`);
  const compressedBlob = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result) {
        console.error('Failed to read file');
        reject(new Error("Failed to read file"));
        return;
      }
      const base64Data = (reader.result as string).split(",")[1];
      if (!base64Data) {
        console.error('Failed to extract base64 data');
        reject(new Error("Failed to extract base64 data"));
        return;
      }
      console.log(`Base64 conversion complete: ${base64Data.length} chars`);
      resolve(base64Data);
    };
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(compressedBlob);
  });
}

export async function analyzeBatchProducts(products: ProductAnalysis[]): Promise<Map<number, AIAnalysisResult>> {
  const genAI = await initializeGemini();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
    }
  });

  // Change Map key type from string to number
  const results = new Map<number, AIAnalysisResult>();
  const batchSize = 3; // Reduced batch size due to rate limits

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const promises = batch.map(async (product) => {
      const prompt = `Analyze this product for an e-commerce inventory system:
Name: ${product.name}
Description: ${product.description}
${product.price ? `Price: $${product.price}` : ''}
${product.sku ? `SKU: ${product.sku}` : ''}
${product.condition ? `Condition: ${product.condition}` : ''}

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
        const text = await response.text();
        const analysis = JSON.parse(text);
        // Use product.id instead of product.name as the key
        results.set(product.id, analysis);
      } catch (error) {
        console.error(`Error analyzing product ${product.id} (${product.name}):`, error);
        results.set(product.id, {
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
    // Add a longer delay between batches to respect rate limits (10 RPM)
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 6000));
    }
  }

  return results;
}

export async function analyzeProduct({ name, description, condition = "used_good" }: ProductAnalysis): Promise<AIAnalysisResult> {
  const prompt = `Analyze this product for an e-commerce inventory system, considering it is in ${condition.replace('_', ' ')} condition:

Name: ${name}
Description: ${description}
Condition: ${condition}

Please provide a detailed analysis including:
1. Product category and subcategory
2. SEO keywords (5-7 keywords)
3. 3-5 specific suggestions to improve the listing, considering its condition
4. Market analysis with:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Price range suggestion for NEW condition
   Note: Final prices will be automatically adjusted based on condition.
5. Areas for improvement

Important: Assume this is a used/open box product. Consider:
- Typical depreciation for this type of item
- Market expectations for used items
- Condition-specific selling points to highlight

Format the response in JSON with the following structure:
{
  "category": "string",
  "seoKeywords": ["string"],
  "suggestions": ["string"],
  "marketAnalysis": {
    "demandScore": number,
    "competitionLevel": "string",
    "priceSuggestion": {
      "min": number,
      "max": number
    }
  },
  "improvementAreas": ["string"]
}`;

  const results = await analyzeBatchProducts([{ name, description, condition }]);
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