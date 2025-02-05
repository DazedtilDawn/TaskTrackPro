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

  try {
    const response = await fetch(`/api/ebay-price?productName=${encodeURIComponent(productName)}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      // If it's a 403, the user needs to authenticate with eBay
      if (response.status === 403) {
        const data = await response.json();
        if (data.redirectTo) {
          window.location.href = data.redirectTo;
          return null;
        }
      }
      console.error("[eBay Price] API error:", response.statusText);
      return null;
    }

    const data = await response.json();
    console.log("[eBay Price] Received price data:", data);
    return data;
  } catch (error) {
    console.error("[eBay Price] Error fetching price:", error);
    return null;
  }
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