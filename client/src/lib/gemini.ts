import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

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

async function fileToGenerativePart(file: File): Promise<{
  inlineData: { data: string; mimeType: string };
}> {
  return new Promise((resolve, reject) => {
    // Check file size (max 4MB)
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`File size too large. Maximum size is 4MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`));
      return;
    }

    // Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      reject(new Error(`Invalid file type: ${file.type}. Supported types are: JPEG, PNG, and WebP`));
      return;
    }

    const reader = new FileReader();

    // Set up a timeout (10 seconds)
    const timeout = setTimeout(() => {
      reader.abort();
      reject(new Error('File reading timed out. Please try again.'));
    }, 10000);

    reader.onloadend = () => {
      clearTimeout(timeout);
      try {
        if (!reader.result) {
          reject(new Error("Failed to read file"));
          return;
        }

        const base64Data = (reader.result as string).split(",")[1];
        if (!base64Data) {
          reject(new Error("Failed to extract base64 data from file"));
          return;
        }

        // Validate base64 data
        if (base64Data.length === 0 || !isValidBase64(base64Data)) {
          reject(new Error("Invalid image data"));
          return;
        }

        resolve({
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        });
      } catch (error) {
        console.error("Error processing file:", error);
        reject(new Error("Failed to process image file"));
      }
    };

    reader.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.onabort = () => {
      clearTimeout(timeout);
      reject(new Error('File reading was aborted'));
    };

    reader.readAsDataURL(file);
  });
}

// Helper function to validate base64 data
function isValidBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src); // Clean up

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      const MAX_DIMENSION = 1200;

      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;

      // Use better image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw image with white background to handle transparency
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with quality adjustment
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.8  // 80% quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = URL.createObjectURL(file);
  });
}

export async function generateSmartListing(
  files: File[]
): Promise<SmartListingAnalysis> {
  if (!files.length) {
    throw new Error("No files provided for analysis");
  }

  try {
    console.log('Initializing Gemini...');
    const genAI = await initializeGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    console.log('Processing image files...');

    // Process images sequentially to avoid memory issues
    const imageParts = [];
    for (const file of files) {
      try {
        // Compress image before processing
        const compressedBlob = await compressImage(file);
        const compressedFile = new File([compressedBlob], file.name, {
          type: 'image/jpeg'
        });

        // Add small delay between processing each image
        if (imageParts.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const part = await fileToGenerativePart(compressedFile);
        imageParts.push(part);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        throw error;
      }
    }

    console.log('Image files processed, count:', imageParts.length);

    const prompt = `Analyze these product images for an e-commerce listing. Provide a detailed analysis including:

1. A compelling product title that would work well for online marketplaces
2. A detailed, SEO-friendly product description
3. Product category classification
4. Market analysis including:
   - Demand score (0-100)
   - Competition level (low/medium/high)
   - Suggested price range (min and max) based on perceived quality and features
5. 5-7 relevant SEO keywords
6. 3-5 specific suggestions to improve the listing

Format your response as a JSON object with the following structure:
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

    console.log('Sending request to Gemini...');
    const result = await model.generateContent([prompt, ...imageParts]);
    if (!result) {
      throw new Error("No response received from Gemini API");
    }

    const response = await result.response;
    if (!response) {
      throw new Error("Empty response from Gemini API");
    }

    const text = response.text();
    console.log('Raw response from Gemini:', text);

    try {
      const analysis = JSON.parse(text) as SmartListingAnalysis;
      console.log('Successfully parsed analysis:', analysis);
      return analysis;
    } catch (parseError) {
      console.error("Failed to parse AI response:", text);
      throw new Error(
        parseError instanceof Error
          ? `Failed to parse AI analysis result: ${parseError.message}`
          : "Failed to parse AI analysis result"
      );
    }
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