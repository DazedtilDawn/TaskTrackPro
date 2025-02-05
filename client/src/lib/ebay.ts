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

interface EbayAuthError {
  error: string;
  details: string;
  redirectTo: string;
}

export async function checkEbayAuth(): Promise<boolean> {
  console.log("[eBay Auth] Checking eBay authentication status");
  try {
    const response = await fetch('/api/user', { credentials: 'include' });
    if (!response.ok) return false;

    const user = await response.json();
    return user.ebayAuthToken && new Date(user.ebayTokenExpiry) > new Date();
  } catch (error) {
    console.error("[eBay Auth] Error checking auth status:", error);
    return false;
  }
}

export async function getEbayPrice(productName: string): Promise<EbayPriceData | null> {
  console.log("[eBay Price] Fetching price data for:", productName);

  // Check eBay auth first
  const isAuthenticated = await checkEbayAuth();
  if (!isAuthenticated) {
    console.log("[eBay Price] eBay authentication required");
    throw new Error("eBay authentication required");
  }

  try {
    const response = await fetch(`/api/ebay-price?productName=${encodeURIComponent(productName)}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      // If it's a 403, the user needs to authenticate with eBay
      if (response.status === 403) {
        const data = await response.json() as EbayAuthError;
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

  // Check eBay auth before proceeding
  const isAuthenticated = await checkEbayAuth();
  if (!isAuthenticated) {
    throw new Error("eBay authentication required. Please connect your eBay account in Settings.");
  }

  // Get eBay price data
  const ebayData = await getEbayPrice(productName);
  if (!ebayData) {
    throw new Error("Failed to fetch eBay market data. Please ensure your eBay connection is valid.");
  }

  // Calculate AI suggested price based on both eBay data and AI analysis
  const aiSuggestedPrice = calculateOptimalPrice(ebayData, aiAnalysis);

  const result = {
    ...ebayData,
    aiSuggestedPrice
  };

  console.log("[eBay Analysis] Final analysis:", result);
  return result;
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