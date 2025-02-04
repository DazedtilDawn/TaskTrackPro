import { GoogleGenerativeAI } from "@google/generative-ai";

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

let genAI: GoogleGenerativeAI;

function initializeGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  genAI = new GoogleGenerativeAI(apiKey);
}

export async function analyzeBatchProducts(products: ProductAnalysis[]): Promise<Map<string, AIAnalysisResult>> {
  if (!genAI) {
    initializeGemini();
  }

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