import { z } from "zod";

// Define schemas for validation
export const ebayDataSchema = z.object({
  currentPrice: z.number(),
  averagePrice: z.number(),
  lowestPrice: z.number(),
  highestPrice: z.number(),
  soldCount: z.number(),
  activeListing: z.number(),
  recommendedPrice: z.number(),
  lastUpdated: z.string().optional(),
});

export const marketAnalysisSchema = z.object({
  demandScore: z.number(),
  competitionLevel: z.string(),
  priceSuggestion: z.object({
    min: z.number(),
    max: z.number(),
  }),
});

export const aiAnalysisSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string(),
  marketAnalysis: marketAnalysisSchema,
  seoKeywords: z.array(z.string()),
  suggestions: z.array(z.string()),
  ebayData: ebayDataSchema.optional(),
});

// Export types
export type EbayData = z.infer<typeof ebayDataSchema>;
export type MarketAnalysis = z.infer<typeof marketAnalysisSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/**
 * Safely parse JSON data with type validation
 * @param jsonData The JSON data to parse
 * @param schema The zod schema to validate against
 * @returns Parsed and validated data, or null if invalid
 */
export function parseJSON<T>(jsonData: unknown, schema: z.ZodType<T>): T | null {
  try {
    // If it's already an object, just validate it
    if (typeof jsonData === 'object' && jsonData !== null) {
      return schema.parse(jsonData);
    }
    
    // If it's a string, parse it first
    if (typeof jsonData === 'string') {
      const parsed = JSON.parse(jsonData);
      return schema.parse(parsed);
    }

    return null;
  } catch (error) {
    console.error('JSON parsing error:', error);
    return null;
  }
}

/**
 * Parse AI analysis data from database
 * @param data Raw AI analysis data from database
 * @returns Parsed and validated AI analysis data
 */
export function parseAiAnalysis(data: unknown): AiAnalysis | null {
  return parseJSON(data, aiAnalysisSchema);
}

/**
 * Parse eBay data from database
 * @param data Raw eBay data from database
 * @returns Parsed and validated eBay data
 */
export function parseEbayData(data: unknown): EbayData | null {
  return parseJSON(data, ebayDataSchema);
}

/**
 * Format price for display
 * @param price Number to format as price
 * @returns Formatted price string
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '$0.00';
  return `$${Number(price).toFixed(2)}`;
}

/**
 * Calculate price status based on AI analysis
 * @param currentPrice Current product price
 * @param aiAnalysis AI analysis data
 * @returns Price status object
 */
export function calculatePriceStatus(currentPrice: number, aiAnalysis: AiAnalysis | null) {
  if (!aiAnalysis?.marketAnalysis?.priceSuggestion) {
    return {
      isUnderpriced: false,
      isOverpriced: false,
      isPricedRight: false,
    };
  }

  const { min, max } = aiAnalysis.marketAnalysis.priceSuggestion;
  return {
    isUnderpriced: currentPrice < min,
    isOverpriced: currentPrice > max,
    isPricedRight: currentPrice >= min && currentPrice <= max,
  };
}
