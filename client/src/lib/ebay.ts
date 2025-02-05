// Mock eBay API integration
interface EbayPriceData {
  currentPrice: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  soldCount: number;
  activeListing: number;
  recommendedPrice: number;
}

export async function getEbayPrice(productName: string): Promise<EbayPriceData | null> {
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
        recommendedPrice: basePrice * 1.05
      };
      resolve(mockData);
    }, 1000);
  });
}

export async function checkEbayPrices(products: Array<{ name: string }>): Promise<Record<string, EbayPriceData>> {
  const results: Record<string, EbayPriceData> = {};
  for (const product of products) {
    const priceData = await getEbayPrice(product.name);
    if (priceData) {
      results[product.name] = priceData;
    }
  }
  return results;
}