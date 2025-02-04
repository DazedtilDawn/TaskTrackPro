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
      throw new Error("GEMINI_API_KEY is not set");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

async function fileToGenerativePart(file: File): Promise<{
  inlineData: { data: string; mimeType: string };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        if (!reader.result) {
          reject(new Error("Failed to read file"));
          return;
        }

        const base64Data = (reader.result as string).split(",")[1];
        if (!base64Data) {
          reject(new Error("Failed to extract base64 data"));
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
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function generateSmartListing(
  files: File[]
): Promise<SmartListingAnalysis> {
  try {
    console.log('Initializing Gemini...');
    const genAI = await initializeGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    console.log('Processing image files...');
    const imageParts = await Promise.all(
      files.map(file => fileToGenerativePart(file).catch(error => {
        console.error('Error processing file:', error);
        throw error;
      }))
    );

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
      throw new Error("No response from Gemini API");
    }

    const response = await result.response;
    if (!response) {
      throw new Error("Empty response from Gemini API");
    }

    const text = response.text();
    console.log('Raw response from Gemini:', text);

    try {
      const analysis = JSON.parse(text);
      console.log('Successfully parsed analysis:', analysis);
      return analysis;
    } catch (parseError) {
      console.error("Failed to parse AI response:", text);
      throw new Error(`Failed to parse AI analysis result: ${parseError.message}`);
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