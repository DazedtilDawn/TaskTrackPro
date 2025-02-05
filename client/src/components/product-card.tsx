import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Heart, Edit, Trash2, Sparkles, TrendingUp, Tag, Box,
  BarChart, CheckCircle2, ArrowUpRight, Share2, Info, BarChart2, PackageOpen
} from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useState, useCallback } from "react";
import ConvertWatchlistDialog from "./convert-watchlist-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: SelectProduct;
  onEdit: (product: SelectProduct) => void;
  inWatchlist?: boolean;
  view?: "grid" | "list" | "table";
}

interface AIAnalysis {
  category: string;
  marketAnalysis: {
    demandScore: number;
    competitionLevel: string;
    priceSuggestion: {
      min: number;
      max: number;
    };
  };
  suggestions: string[];
  seoKeywords: string[];
  ebayData?: {
    currentPrice: number;
    averagePrice: number;
    lowestPrice: number;
    highestPrice: number;
    soldCount: number;
    activeListing: number;
    recommendedPrice: number;
    lastUpdated: string;
  };
}

export default function ProductCard({ product, onEdit, inWatchlist, view = "grid" }: ProductCardProps) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);

  // Parse aiAnalysis if it's a string
  let aiAnalysis: AIAnalysis | undefined;
  try {
    if (typeof product.aiAnalysis === 'string') {
      aiAnalysis = JSON.parse(product.aiAnalysis);
    } else {
      aiAnalysis = product.aiAnalysis as AIAnalysis;
    }
  } catch (e) {
    console.error('Failed to parse aiAnalysis:', e);
  }

  const hasAnalysis = aiAnalysis && Object.keys(aiAnalysis).length > 0;
  const currentPrice = Number(product.price) || 0;
  const isUnderpriced = hasAnalysis && currentPrice < (aiAnalysis?.marketAnalysis?.priceSuggestion?.min ?? 0);
  const isOverpriced = hasAnalysis && currentPrice > (aiAnalysis?.marketAnalysis?.priceSuggestion?.max ?? 0);
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced;

  const markAsSold = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await apiRequest("POST", "/api/orders", {
        productId: product.id
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] })
      ]);

      toast({
        title: "Product marked as sold",
        description: product.name,
      });

      setLocation("/orders");
    } catch (error) {
      console.error('Error marking product as sold:', error);
      toast({
        title: "Error",
        description: "Failed to mark product as sold",
        variant: "destructive",
      });
    }
  }, [product.id, product.name, toast, setLocation]);

  const toggleWatchlist = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (inWatchlist && location.includes("/watchlist")) {
      return;
    }

    try {
      if (inWatchlist) {
        const response = await apiRequest("DELETE", `/api/watchlist/${product.id}`);
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/products"] })
        ]);
      } else {
        const response = await apiRequest("POST", "/api/watchlist", {
          productId: product.id
        });
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/products"] })
        ]);
      }

      toast({
        title: inWatchlist ? "Removed from watchlist" : "Added to watchlist",
        description: product.name,
      });
    } catch (error) {
      console.error('Watchlist operation failed:', error);
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive",
      });
    }
  }, [product.id, product.name, inWatchlist, toast, location]);

  const deleteProduct = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await apiRequest("DELETE", `/api/products/${product.id}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
      ]);

      toast({
        title: "Product deleted",
        description: product.name,
      });
    } catch (error) {
      console.error('Product deletion failed:', error);
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive",
      });
    }
  }, [product.id, product.name, toast]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onEdit(product);
  }, [onEdit, product]);

  const handleConvertDialog = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowConvertDialog(true);
  }, []);

  const generateEbayListing = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsGeneratingListing(true);
    try {
      const response = await apiRequest("POST", `/api/products/${product.id}/generate-ebay-listing`);
      const result = await response.json();

      if (result.error) {
        // Handle eBay authentication error
        if (response.status === 403 && result.error === "eBay authentication required") {
          toast({
            title: "eBay Authentication Required",
            description: "You need to connect your eBay account first.",
            variant: "default",
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/settings/ebay-auth";
                }}
              >
                Connect eBay
              </Button>
            ),
          });
          return;
        }
        throw new Error(result.error);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      toast({
        title: "eBay listing generated",
        description: "Your product has been listed on eBay",
      });

      // If we have a listing URL, open it in a new tab
      if (result.ebayListingUrl) {
        window.open(result.ebayListingUrl, '_blank');
      }
    } catch (error) {
      console.error('Error generating eBay listing:', error);
      toast({
        title: "Error",
        description: "Failed to generate eBay listing",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingListing(false);
    }
  }, [product.id, toast]);

  if (view === "table") {
    return (
      <>
        <div className="flex items-center gap-4 p-4 hover:bg-secondary/5 rounded-lg transition-colors group relative">
          {/* Thumbnail */}
          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center">
                <Box className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Name & Description */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{product.name}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {product.description}
            </p>
          </div>

          {/* List Price */}
          <div className="flex-shrink-0 w-32">
            <div className="text-sm font-medium">
              ${Number(product.price).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              {inWatchlist ? "Recommended" : "List Price"}
            </div>
          </div>

          {/* eBay Price */}
          <div className="flex-shrink-0 w-32">
            {product.ebayPrice ? (
              <>
                <div className="text-sm font-medium">
                  ${Number(product.ebayPrice).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">eBay Price</div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Not Listed</span>
            )}
          </div>

          {/* Condition */}
          <div className="flex-shrink-0 w-24">
            <span className="text-sm capitalize">
              {product.condition?.replace(/_/g, ' ') || 'Not Specified'}
            </span>
          </div>

          {/* Market Analysis */}
          {hasAnalysis && (
            <div className="flex-shrink-0 w-32">
              <div
                className={cn(
                  "text-xs px-2 py-1 rounded-full inline-flex items-center gap-1",
                  isUnderpriced && "bg-yellow-500/10 text-yellow-700",
                  isOverpriced && "bg-red-500/10 text-red-700",
                  isPricedRight && "bg-green-500/10 text-green-700"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {isUnderpriced ? 'Underpriced' :
                  isOverpriced ? 'Overpriced' :
                    'Optimal Price'}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 absolute right-4 bg-background/95 rounded-lg shadow-sm z-50">
            <div className="flex items-center gap-1 p-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleEdit}
                className="h-8 w-8 hover:scale-105 transition-transform"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={deleteProduct}
                className="h-8 w-8 hover:scale-105 transition-transform"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {!inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={markAsSold}
                  className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              )}
              {inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleConvertDialog}
                  className="h-8 w-8 hover:scale-105 transition-transform text-blue-600 hover:text-blue-700"
                  title="Convert to Inventory"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
              {!location.includes("/watchlist") && (
                <Button
                  size="icon"
                  variant={inWatchlist ? "secondary" : "ghost"}
                  onClick={toggleWatchlist}
                  className="h-8 w-8 hover:scale-105 transition-transform"
                >
                  <Heart className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
                </Button>
              )}
              {!inWatchlist && (
                <>
                  {!product.ebayListingUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={generateEbayListing}
                      disabled={isGeneratingListing}
                      className="h-8 w-8 hover:scale-105 transition-transform text-blue-600 hover:text-blue-700"
                      title="Generate eBay Listing"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                  {product.ebayListingUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => window.open(product.ebayListingUrl, '_blank')}
                      className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                      title="View on eBay"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <ConvertWatchlistDialog
          product={product}
          open={showConvertDialog}
          onOpenChange={setShowConvertDialog}
        />
      </>
    );
  }

  return (
    <>
      <Card className={cn(
        "overflow-hidden transition-all duration-200 hover:shadow-lg",
        isUnderpriced && "border-yellow-500/50",
        isOverpriced && "border-red-500/50",
        isPricedRight && "border-green-500/50",
        view === "list" && "flex"
      )}>
        {product.imageUrl && (
          <div className={cn(
            "relative",
            view === "grid" ? "w-full" : "w-48 shrink-0"
          )}>
            <img
              src={product.imageUrl}
              alt={product.name}
              className={cn(
                "object-cover",
                view === "grid" ? "w-full h-48" : "w-48 h-full"
              )}
            />
            {hasAnalysis && (
              <div className={cn(
                "absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium",
                isUnderpriced && "bg-yellow-500/90 text-yellow-50",
                isOverpriced && "bg-red-500/90 text-red-50",
                isPricedRight && "bg-green-500/90 text-green-50"
              )}>
                {isUnderpriced ? 'Underpriced' :
                  isOverpriced ? 'Overpriced' :
                    'Optimal Price'}
              </div>
            )}
          </div>
        )}
        <div className={cn(
          view === "list" && "flex-1 flex flex-col"
        )}>
          <CardContent className={cn(
            "p-4",
            view === "list" && "flex-1"
          )}>
            <div className="flex items-start justify-between mb-2">
              <div className={cn(
                view === "list" && "flex-1"
              )}>
                <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
                <p className="text-muted-foreground text-sm">{product.description}</p>
              </div>
              {hasAnalysis && aiAnalysis && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 transition-transform hover:scale-110 shrink-0"
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0">
                    <ScrollArea className="h-[400px]">
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between border-b pb-2 sticky top-0 bg-background z-10">
                          <h4 className="font-medium text-lg">Market Analysis</h4>
                          <span className="text-sm text-muted-foreground">{aiAnalysis.category}</span>
                        </div>

                        <div className="space-y-4">
                          <div className="p-3 bg-secondary/20 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Market Demand</span>
                              <span className="text-sm font-medium">{aiAnalysis.marketAnalysis.demandScore}/100</span>
                            </div>
                            <Progress value={aiAnalysis.marketAnalysis.demandScore} className="h-2" />
                            <div className="flex items-center gap-2">
                              <BarChart className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Competition: {aiAnalysis.marketAnalysis.competitionLevel}</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Tag className="h-4 w-4" />
                              <h5 className="font-medium">Price Analysis</h5>
                            </div>

                            <div className="pl-4 space-y-2">
                              <div className="flex flex-col gap-1">
                                <span className="text-sm text-muted-foreground">Current Price:</span>
                                <span className={cn(
                                  "text-lg font-semibold",
                                  isUnderpriced && "text-yellow-600",
                                  isOverpriced && "text-red-600",
                                  isPricedRight && "text-green-600"
                                )}>
                                  ${currentPrice}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-sm text-muted-foreground">Suggested Range:</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-lg font-semibold">${aiAnalysis.marketAnalysis.priceSuggestion.min}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="text-lg font-semibold">${aiAnalysis.marketAnalysis.priceSuggestion.max}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {aiAnalysis.ebayData && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <PackageOpen className="h-4 w-4" />
                                <h5 className="font-medium">eBay Data</h5>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm text-muted-foreground">Current Price:</span>
                                  <span className="text-sm font-medium">${aiAnalysis.ebayData.currentPrice}</span>
                                  <span className="text-sm text-muted-foreground">Average Price:</span>
                                  <span className="text-sm font-medium">${aiAnalysis.ebayData.averagePrice}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm text-muted-foreground">Lowest Price:</span>
                                  <span className="text-sm font-medium">${aiAnalysis.ebayData.lowestPrice}</span>
                                  <span className="text-sm text-muted-foreground">Highest Price:</span>
                                  <span className="text-sm font-medium">${aiAnalysis.ebayData.highestPrice}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm text-muted-foreground">Sold:</span>
                                  <span className="text-sm font-medium">{aiAnalysis.ebayData.soldCount}</span>
                                  <span className="text-sm text-muted-foreground">Active Listings:</span>
                                  <span className="text-sm font-medium">{aiAnalysis.ebayData.activeListing}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm text-muted-foreground">Recommended Price:</span>
                                  <span className="text-sm font-medium">${aiAnalysis.ebayData.recommendedPrice}</span>
                                  <span className="text-sm text-muted-foreground">Last Updated:</span>
                                  <span className="text-sm font-medium">{aiAnalysis.ebayData.lastUpdated}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="border-t pt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="h-4 w-4" />
                              <h5 className="font-medium">Optimization Tips</h5>
                            </div>
                            <ul className="space-y-2">
                              {aiAnalysis.suggestions.map((suggestion, index) => (
                                <li
                                  key={index}
                                  className="text-sm text-muted-foreground pl-4 border-l-2 border-primary/20"
                                >
                                  {suggestion}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className={cn(
              "space-y-2",
              view === "list" && "flex items-center gap-6"
            )}>
              <div className={cn(
                "flex items-baseline justify-between",
                view === "list" && "flex-1"
              )}>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground font-medium">
                    {inWatchlist ? "Recommended Buy Price" : "Selling Price"}
                  </div>
                  <div className="text-xl font-semibold text-primary">
                    ${Number(product.price).toFixed(2)}
                  </div>
                </div>
                {product.ebayPrice && (
                  <div className="flex flex-col items-end">
                    <span className="text-sm text-muted-foreground">eBay Price</span>
                    <span className="text-sm font-medium bg-secondary/20 px-2 py-1 rounded">
                      ${Number(product.ebayPrice).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Product Details */}
              {(product.weight || product.dimensions) && (
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  {product.weight && (
                    <div className="flex items-center gap-2">
                      <span>Weight:</span>
                      <span className="font-medium">{product.weight} lbs</span>
                    </div>
                  )}
                  {product.dimensions && (
                    <div className="flex items-center gap-2">
                      <span>Dimensions:</span>
                      <span className="font-medium">{product.dimensions}</span>
                    </div>
                  )}
                </div>
              )}

              {product.condition && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Condition:</span>
                  <span className="capitalize">{product.condition.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className={cn(
            "p-4 pt-0 flex justify-between",
            view === "list" && "border-t"
          )}>
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleEdit}
                className="hover:scale-105 transition-transform"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={deleteProduct}
                className="hover:scale-105 transition-transform"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {!inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={markAsSold}
                  className="hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              )}
              {inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleConvertDialog}
                  className="hover:scale-105 transition-transform text-blue-600 hover:text-blue-700"
                  title="Convert to Inventory"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}

              {/* Add eBay listing button - now always visible for non-watchlist items */}
              {!inWatchlist && (
                <>
                  {!product.ebayListingUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={generateEbayListing}
                      disabled={isGeneratingListing}
                      className="hover:scale-105 transition-transform text-blue-600 hover:text-blue-700"
                      title="Generate eBay Listing"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                  {product.ebayListingUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => window.open(product.ebayListingUrl, '_blank')}
                      className="hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                      title="View on eBay"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
            <Button
              size="icon"
              variant={inWatchlist ? "secondary" : "ghost"}
              onClick={toggleWatchlist}
              className="hover:scale-105 transition-transform"
            >
              <Heart className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
            </Button>
          </CardFooter>
        </div>
      </Card>
      <ConvertWatchlistDialog
        product={product}
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
      />
    </>
  );
}