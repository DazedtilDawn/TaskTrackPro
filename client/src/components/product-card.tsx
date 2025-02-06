import React, { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart, Edit, Trash2, Sparkles, TrendingUp, Tag, Box,
  BarChart, CheckCircle2, ArrowUpRight, Share2, Info,
  Package, Calendar, DollarSign, Boxes, ImageIcon, PackageOpen
} from "lucide-react";
import type { SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import ConvertWatchlistDialog from "./convert-watchlist-dialog";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

const DEFAULT_AI_ANALYSIS: AIAnalysis = {
  category: 'Uncategorized',
  marketAnalysis: {
    demandScore: 0,
    competitionLevel: 'Unknown',
    priceSuggestion: {
      min: 0,
      max: 0
    }
  },
  suggestions: ['No analysis available'],
  seoKeywords: [],
  ebayData: undefined
};

interface ProductCardProps {
  product: SelectProduct;
  onEdit: (product: SelectProduct) => void;
  inWatchlist?: boolean;
  view?: "grid" | "list" | "table";
  watchlistId?: number;
}

function ProductCard({
  product,
  onEdit,
  inWatchlist = false,
  view = "grid",
  watchlistId
}: ProductCardProps): JSX.Element {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const parseAIAnalysis = (data: unknown): AIAnalysis => {
    try {
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        if (!parsed?.marketAnalysis?.priceSuggestion) {
          console.warn('Invalid AI analysis structure:', parsed);
          return DEFAULT_AI_ANALYSIS;
        }
        return parsed;
      } else if (data && typeof data === 'object') {
        const typed = data as AIAnalysis;
        if (!typed?.marketAnalysis?.priceSuggestion) {
          console.warn('Invalid AI analysis structure:', typed);
          return DEFAULT_AI_ANALYSIS;
        }
        return typed;
      }
      return DEFAULT_AI_ANALYSIS;
    } catch (e) {
      console.error('Failed to parse aiAnalysis:', e);
      setImageError(e instanceof Error ? e.message : 'Unknown parsing error');
      return DEFAULT_AI_ANALYSIS;
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit(product);
    }
  }, [onEdit, product]);

  const aiAnalysis = parseAIAnalysis(product.aiAnalysis);
  const hasAnalysis = aiAnalysis !== DEFAULT_AI_ANALYSIS;
  const currentPrice = Number(product.price) || 0;
  const isUnderpriced = hasAnalysis && currentPrice < (aiAnalysis.marketAnalysis.priceSuggestion.min ?? 0);
  const isOverpriced = hasAnalysis && currentPrice > (aiAnalysis.marketAnalysis.priceSuggestion.max ?? 0);
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced;

  const getImageUrl = (url: string | null | undefined): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/uploads/')) {
      return url;
    }
    return `/uploads/${url.replace(/^\/+/, '')}`;
  };

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
        const id = watchlistId || product.id;
        const response = await apiRequest("DELETE", `/api/watchlist/${id}`);
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
  }, [product.id, product.name, inWatchlist, toast, location, watchlistId]);

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
        <div
          className="flex items-center gap-4 p-4 hover:bg-secondary/5 rounded-lg transition-colors group relative"
          role="article"
          aria-label={`Product: ${product.name}`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-secondary/20">
            {product.imageUrl && !imageError ? (
              <img
                src={getImageUrl(product.imageUrl)}
                alt={`Image of ${product.name}`}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{product.name}</h3>
            <p className="text-sm text-muted-foreground truncate" aria-label="Product description">
              {product.description}
            </p>
          </div>

          <div className="flex-shrink-0 w-32">
            <div className="text-sm font-medium">
              ${Number(product.price).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              {inWatchlist ? "Recommended" : "List Price"}
            </div>
          </div>

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

          <div className="flex-shrink-0 w-24">
            <span className="text-sm capitalize">
              {product.condition?.replace(/_/g, ' ') || 'Not Specified'}
            </span>
          </div>

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
              {aiAnalysis?.marketAnalysis?.priceSuggestion && (
                <div className="text-xs text-muted-foreground mt-1">
                  ${aiAnalysis.marketAnalysis.priceSuggestion.min} - ${aiAnalysis.marketAnalysis.priceSuggestion.max}
                </div>
              )}
            </div>
          )}

          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 absolute right-4 bg-background/95 rounded-lg shadow-sm z-50">
            <div className="flex items-center gap-1 p-1" role="toolbar" aria-label="Product actions">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleEdit}
                className="h-8 w-8 hover:scale-105 transition-transform"
                aria-label="Edit product"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={deleteProduct}
                className="h-8 w-8 hover:scale-105 transition-transform"
                aria-label="Delete product"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {!inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={markAsSold}
                  className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                  aria-label="Mark as sold"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              )}
              {inWatchlist && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConvertDialog}
                  className="h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
                  title="Add to Inventory"
                  aria-label="Add to Inventory"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Add to Inventory
                </Button>
              )}
              {!location.includes("/watchlist") && (
                <Button
                  size="icon"
                  variant={inWatchlist ? "secondary" : "ghost"}
                  onClick={toggleWatchlist}
                  className="h-8 w-8 hover:scale-105 transition-transform"
                  aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
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
                      aria-label="Generate eBay Listing"
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
                      aria-label="View on eBay"
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
      <Card className="overflow-hidden h-[700px]">
        <div className="flex flex-col h-full">
          <div className="flex-none">
            <div className="relative aspect-[16/9] bg-secondary/20">
              {product.imageUrl && !imageError ? (
                <img
                  src={getImageUrl(product.imageUrl)}
                  alt={`Image of ${product.name}`}
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
              <div className="absolute top-4 right-4 flex gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                  onClick={toggleWatchlist}
                >
                  <Heart className="h-5 w-5" fill={inWatchlist ? "currentColor" : "none"} />
                </Button>
                {hasAnalysis && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-9 w-9 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                      >
                        <Sparkles className="h-5 w-5 text-primary" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" side="left">
                      <ScrollArea className="h-[500px]">
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
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="flex-none px-6">
                <TabsList className="grid w-full grid-cols-3 p-1">
                  <TabsTrigger value="details" className="py-2">Details</TabsTrigger>
                  <TabsTrigger value="pricing" className="py-2">Pricing</TabsTrigger>
                  <TabsTrigger value="metrics" className="py-2">Metrics</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 mt-6">
                <ScrollArea className="h-full">
                  <TabsContent value="details" className="px-6 pb-6 m-0">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-semibold mb-3">{product.name}</h3>
                        <p className="text-muted-foreground text-base leading-relaxed">{product.description}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                            <Package className="h-5 w-5 text-primary" />
                            <span className="font-medium">SKU:</span>
                            <span>{product.sku || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Box className="h-5 w-5 text-primary" />
                            <span className="font-medium">Brand:</span>
                            <span>{product.brand || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Tag className="h-5 w-5 text-primary" />
                            <span className="font-medium">Category:</span>
                            <span>{product.category || "N/A"}</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                            <Info className="h-5 w-5 text-primary" />
                            <span className="font-medium">Condition:</span>
                            <span className="capitalize">
                              {(product.condition || "").replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Boxes className="h-5 w-5 text-primary" />
                            <span className="font-medium">Quantity:</span>
                            <span>{product.quantity}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Calendar className="h-5 w-5 text-primary" />
                            <span className="font-medium">Added:</span>
                            <span>
                              {format(new Date(product.createdAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {(product.weight || product.dimensions) && (
                        <div className="pt-4 mt-4 border-t">
                          <h4 className="text-sm font-medium mb-4">Specifications</h4>
                          <div className="grid grid-cols-2 gap-4">
                            {product.weight && (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="font-medium">Weight:</span>
                                <span>{product.weight} lbs</span>
                              </div>
                            )}
                            {product.dimensions && (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="font-medium">Dimensions:</span>
                                <span>{product.dimensions}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing" className="px-6 pb-6 m-0">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-4 rounded-lg bg-secondary/10">
                          <div className="text-sm text-muted-foreground mb-2">
                            List Price
                          </div>
                          <div className="text-3xl font-semibold text-primary">
                            ${Number(product.price).toFixed(2)}
                          </div>
                        </div>

                        {product.ebayPrice && (
                          <div className="p-4 rounded-lg bg-secondary/10">
                            <div className="text-sm text-muted-foreground mb-2">
                              eBay Price
                            </div>
                            <div className="text-3xl font-semibold">
                              ${Number(product.ebayPrice).toFixed(2)}
                            </div>
                          </div>
                        )}
                      </div>

                      {hasAnalysis && aiAnalysis?.marketAnalysis?.priceSuggestion && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Price Analysis</h4>
                          <div className="p-4 rounded-lg bg-secondary/10 space-y-3">
                            <div className="flex justify-between text-sm">
                              <span>Suggested Range:</span>
                              <span>
                                ${aiAnalysis.marketAnalysis.priceSuggestion.min} -
                                ${aiAnalysis.marketAnalysis.priceSuggestion.max}
                              </span>
                            </div>
                            {aiAnalysis.ebayData && (
                              <>
                                <div className="flex justify-between text-sm">
                                  <span>Average Price:</span>
                                  <span>${aiAnalysis.ebayData.averagePrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span>Market Range:</span>
                                  <span>
                                    ${aiAnalysis.ebayData.lowestPrice} -
                                    ${aiAnalysis.ebayData.highestPrice}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="metrics" className="px-6 pb-6 m-0">
                    <div className="space-y-6">
                      {hasAnalysis && (
                        <>
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Market Demand</h4>
                            <div className="p-4 rounded-lg bg-secondary/10 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Demand Score</span>
                                <span className="text-sm font-medium">
                                  {aiAnalysis.marketAnalysis.demandScore}/100
                                </span>
                              </div>
                              <Progress
                                value={aiAnalysis.marketAnalysis.demandScore}
                                className="h-2"
                              />
                              <div className="flex items-center gap-2 text-sm">
                                <BarChart className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  Competition: {aiAnalysis.marketAnalysis.competitionLevel}
                                </span>
                              </div>
                            </div>
                          </div>

                          {aiAnalysis.ebayData && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Market Activity</h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-lg bg-secondary/10">
                                  <div className="text-sm text-muted-foreground mb-2">
                                    Sold Items
                                  </div>
                                  <div className="text-xl font-semibold">
                                    {aiAnalysis.ebayData.soldCount}
                                  </div>
                                </div>
                                <div className="p-4 rounded-lg bg-secondary/10">
                                  <div className="text-sm text-muted-foreground mb-2">
                                    Active Listings
                                  </div>
                                  <div className="text-xl font-semibold">
                                    {aiAnalysis.ebayData.activeListing}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                </ScrollArea>
              </div>
            </Tabs>
          </div>

          <div className="flex-none p-6 border-t bg-muted/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-2">
                <Button
                  size="default"
                  variant="ghost"
                  onClick={handleEdit}
                  className="h-10"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  size="default"
                  variant="ghost"
                  onClick={deleteProduct}
                  className="h-10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                {!inWatchlist && (
                  <>
                    <Button
                      size="default"
                      variant="ghost"
                      onClick={markAsSold}
                      className="h-10 text-green-600 hover:text-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark Sold
                    </Button>
                    {!product.ebayListingUrl ? (
                      <Button
                        size="default"
                        variant="ghost"
                        onClick={generateEbayListing}
                        disabled={isGeneratingListing}
                        className="h-10 text-blue-600 hover:text-blue-700"
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        List on eBay
                      </Button>
                    ) : (
                      <Button
                        size="default"
                        variant="ghost"
                        onClick={() => window.open(product.ebayListingUrl, '_blank')}
                        className="h-10 text-green-600 hover:text-green-700"
                      >
                        <ArrowUpRight className="h-4 w-4 mr-2" />
                        View on eBay
                      </Button>
                    )}
                  </>
                )}
              </div>
              {inWatchlist ? (
                <Button
                  size="lg"
                  variant="default"
                  onClick={handleConvertDialog}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <ArrowUpRight className="h-5 w-5 mr-2" />
                  Add to Inventory
                </Button>
              ) : null}
            </div>
          </div>
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

export default ProductCard;