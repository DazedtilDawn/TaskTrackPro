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

// Error type for eBay-specific errors
class EbayAPIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'EbayAPIError';
  }
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
    throw new EbayAPIError("eBay authentication required");
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
      throw new EbayAPIError(`API request failed: ${response.statusText}`, response.status);
    }

    const data = await response.json();
    console.log("[eBay Price] Successfully received price data:", data);
    return validatePriceData(data);
  } catch (error) {
    console.error("[eBay Price] Error fetching price:", error);
    if (error instanceof EbayAPIError) throw error;
    throw new EbayAPIError("Failed to fetch eBay market data");
  }
}

// Validate price data to ensure it matches expected format
function validatePriceData(data: any): EbayPriceData {
  const requiredFields = [
    'currentPrice', 'averagePrice', 'lowestPrice', 'highestPrice',
    'soldCount', 'activeListing', 'recommendedPrice'
  ];

  const missingFields = requiredFields.filter(field => typeof data[field] !== 'number');
  if (missingFields.length > 0) {
    throw new EbayAPIError(`Invalid price data: missing ${missingFields.join(', ')}`);
  }

  return {
    ...data,
    lastUpdated: data.lastUpdated || new Date().toISOString()
  };
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
    throw new EbayAPIError("eBay authentication required. Please connect your eBay account in Settings.");
  }

  // Get eBay price data
  console.log("[eBay Analysis] Fetching eBay price data");
  const ebayData = await getEbayPrice(productName);
  if (!ebayData) {
    console.log("[eBay Analysis] Failed to fetch eBay data");
    throw new EbayAPIError("Failed to fetch eBay market data. Please ensure your eBay connection is valid.");
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

/**
 * Calculates the optimal price based on eBay market data and AI analysis
 * @param ebayData - Current eBay market data
 * @param aiAnalysis - AI-generated market analysis
 * @returns Calculated optimal price
 */
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
    const aiPrice = aiAnalysis.marketAnalysis.priceSuggestion;
    console.log("[eBay Price Calculation] AI price suggestion:", aiPrice);
    // Weighted average between eBay and AI suggestions
    basePrice = (basePrice * 0.6) + (aiPrice * 0.4);
    console.log("[eBay Price Calculation] After AI weighted adjustment:", basePrice);
  }

  const finalPrice = Math.round(basePrice * 100) / 100; // Round to 2 decimal places
  console.log("[eBay Price Calculation] Final calculated price:", finalPrice);
  return finalPrice;
}