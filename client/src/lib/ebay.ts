// eBay API integration
interface EbayPriceData {
  currentPrice: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  soldCount: number;
  activeListing: number;
  recommendedPrice: number;
  lastUpdated?: string;
}

export async function getEbayPrice(productName: string): Promise<EbayPriceData | null> {
  console.log("[eBay Price] Fetching price data for:", productName);

  // Simulated API call to eBay
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate mock price data
      const basePrice = Math.round(Math.random() * 190 + 10);
      const mockData: EbayPriceData = {
        currentPrice: basePrice,
        averagePrice: basePrice * 1.1,
        lowestPrice: basePrice * 0.8,
        highestPrice: basePrice * 1.4,
        soldCount: Math.floor(Math.random() * 50),
        activeListing: Math.floor(Math.random() * 100),
        recommendedPrice: basePrice * 1.05,
        lastUpdated: new Date().toISOString()
      };
      console.log("[eBay Price] Generated price data:", mockData);
      resolve(mockData);
    }, 1000);
  });
}

export async function checkEbayPrices(products: Array<{ name: string }>): Promise<Record<string, EbayPriceData>> {
  console.log("[eBay Price] Checking prices for multiple products:", products);
  const results: Record<string, EbayPriceData> = {};
  for (const product of products) {
    const priceData = await getEbayPrice(product.name);
    if (priceData) {
      results[product.name] = priceData;
    }
  }
  console.log("[eBay Price] Completed price check:", results);
  return results;
}

export async function getEbayMarketAnalysis(
  productName: string,
  aiAnalysis: any
): Promise<EbayPriceData & { aiSuggestedPrice?: number }> {
  console.log("[eBay Analysis] Starting market analysis for:", productName);
  console.log("[eBay Analysis] AI analysis:", aiAnalysis);

  // Get eBay price data first
  const ebayData = await getEbayPrice(productName);
  if (!ebayData) {
    throw new Error("Failed to fetch eBay market data");
  }

  // Calculate AI suggested price based on both eBay data and AI analysis
  const aiSuggestedPrice = calculateOptimalPrice(ebayData, aiAnalysis);

  console.log("[eBay Analysis] Final analysis:", {
    ...ebayData,
    aiSuggestedPrice
  });

  return {
    ...ebayData,
    aiSuggestedPrice
  };
}

function calculateOptimalPrice(ebayData: EbayPriceData, aiAnalysis: any): number {
  // Start with eBay's recommended price
  let basePrice = ebayData.recommendedPrice;

  // Adjust based on market conditions
  if (ebayData.soldCount > 30) { // High demand
    basePrice *= 1.1;
  } else if (ebayData.soldCount < 10) { // Low demand
    basePrice *= 0.9;
  }

  // Adjust based on competition
  if (ebayData.activeListing > 50) { // High competition
    basePrice *= 0.95;
  }

  // Consider AI analysis if available
  if (aiAnalysis?.marketAnalysis?.priceSuggestion) {
    const aiPrice = aiAnalysis.marketAnalysis.priceSuggestion;
    // Weighted average between eBay and AI suggestions
    basePrice = (basePrice * 0.6) + (aiPrice * 0.4);
  }

  return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
}