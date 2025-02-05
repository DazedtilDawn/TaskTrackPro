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
    if (!response.ok) {
      console.log("[eBay Auth] User fetch failed:", response.status);
      return false;
    }

    const user = await response.json();
    console.log("[eBay Auth] User data:", {
      hasToken: !!user.ebayAuthToken,
      tokenExpiry: user.ebayTokenExpiry,
      isValid: user.ebayAuthToken && new Date(user.ebayTokenExpiry) > new Date()
    });

    return user.ebayAuthToken && new Date(user.ebayTokenExpiry) > new Date();
  } catch (error) {
    console.error("[eBay Auth] Error checking auth status:", error);
    return false;
  }
}

export async function getEbayPrice(productName: string): Promise<EbayPriceData | null> {
  console.log("[eBay Price] Starting price fetch for:", productName);

  // Check eBay auth first
  const isAuthenticated = await checkEbayAuth();
  console.log("[eBay Price] Authentication check result:", isAuthenticated);

  if (!isAuthenticated) {
    console.log("[eBay Price] eBay authentication required, throwing error");
    throw new Error("eBay authentication required");
  }

  try {
    console.log("[eBay Price] Making API request for product:", productName);
    const response = await fetch(`/api/ebay-price?productName=${encodeURIComponent(productName)}`, {
      credentials: 'include'
    });

    console.log("[eBay Price] API response status:", response.status);
    if (!response.ok) {
      // If it's a 403, the user needs to authenticate with eBay
      if (response.status === 403) {
        const data = await response.json() as EbayAuthError;
        console.log("[eBay Price] Received 403 error:", data);
        if (data.redirectTo) {
          console.log("[eBay Price] Redirecting to:", data.redirectTo);
          window.location.href = data.redirectTo;
          return null;
        }
      }
      console.error("[eBay Price] API error:", response.statusText);
      return null;
    }

    const data = await response.json();
    console.log("[eBay Price] Successfully received price data:", data);
    return data;
  } catch (error) {
    console.error("[eBay Price] Error fetching price:", error);
    return null;
  }
}

export async function checkEbayPrices(products: Array<{ name: string }>): Promise<Record<string, EbayPriceData>> {
  console.log("[eBay Price] Starting batch price check for products:", products);
  const results: Record<string, EbayPriceData> = {};

  for (const product of products) {
    console.log("[eBay Price] Checking price for product:", product.name);
    const priceData = await getEbayPrice(product.name);
    if (priceData) {
      results[product.name] = priceData;
      console.log("[eBay Price] Added price data for:", product.name);
    } else {
      console.log("[eBay Price] Failed to get price data for:", product.name);
    }
  }

  console.log("[eBay Price] Completed batch price check. Results:", results);
  return results;
}

export async function getEbayMarketAnalysis(
  productName: string,
  aiAnalysis: any
): Promise<EbayPriceData & { aiSuggestedPrice?: number }> {
  console.log("[eBay Analysis] Starting market analysis for:", productName);
  console.log("[eBay Analysis] Input AI analysis:", aiAnalysis);

  // Check eBay auth before proceeding
  const isAuthenticated = await checkEbayAuth();
  console.log("[eBay Analysis] Authentication check result:", isAuthenticated);

  if (!isAuthenticated) {
    console.log("[eBay Analysis] Authentication required, throwing error");
    throw new Error("eBay authentication required. Please connect your eBay account in Settings.");
  }

  // Get eBay price data
  console.log("[eBay Analysis] Fetching eBay price data");
  const ebayData = await getEbayPrice(productName);
  if (!ebayData) {
    console.log("[eBay Analysis] Failed to fetch eBay data");
    throw new Error("Failed to fetch eBay market data. Please ensure your eBay connection is valid.");
  }

  // Calculate AI suggested price based on both eBay data and AI analysis
  console.log("[eBay Analysis] Calculating optimal price");
  const aiSuggestedPrice = calculateOptimalPrice(ebayData, aiAnalysis);
  console.log("[eBay Analysis] Calculated suggested price:", aiSuggestedPrice);

  const result = {
    ...ebayData,
    aiSuggestedPrice
  };

  console.log("[eBay Analysis] Final analysis result:", result);
  return result;
}

function calculateOptimalPrice(ebayData: EbayPriceData, aiAnalysis: any): number {
  console.log("[eBay Price Calculation] Starting price calculation");
  console.log("[eBay Price Calculation] Input data:", { ebayData, aiAnalysis });

  // Start with eBay's recommended price
  let basePrice = ebayData.recommendedPrice;
  console.log("[eBay Price Calculation] Starting with base price:", basePrice);

  // Adjust based on market conditions
  if (ebayData.soldCount > 30) { // High demand
    basePrice *= 1.1;
    console.log("[eBay Price Calculation] High demand adjustment:", basePrice);
  } else if (ebayData.soldCount < 10) { // Low demand
    basePrice *= 0.9;
    console.log("[eBay Price Calculation] Low demand adjustment:", basePrice);
  }

  // Adjust based on competition
  if (ebayData.activeListing > 50) { // High competition
    basePrice *= 0.95;
    console.log("[eBay Price Calculation] High competition adjustment:", basePrice);
  }

  // Consider AI analysis if available
  if (aiAnalysis?.marketAnalysis?.priceSuggestion) {
    const aiPriceSuggestion = aiAnalysis.marketAnalysis.priceSuggestion;
    console.log("[eBay Price Calculation] AI price suggestion:", aiPriceSuggestion);

    // Calculate average of min and max for AI price
    const aiAveragePrice = (aiPriceSuggestion.min + aiPriceSuggestion.max) / 2;
    // Weighted average between eBay and AI suggestions
    basePrice = (basePrice * 0.6) + (aiAveragePrice * 0.4);
    console.log("[eBay Price Calculation] After AI weighted adjustment:", basePrice);
  }

  const finalPrice = Math.round(basePrice * 100) / 100; // Round to 2 decimal places
  console.log("[eBay Price Calculation] Final calculated price:", finalPrice);
  return finalPrice;
}