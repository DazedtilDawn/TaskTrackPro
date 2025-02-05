import { useState, useCallback } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Heart, Edit, Trash2, Sparkles, TrendingUp, Tag, Box,
  BarChart, CheckCircle2, ArrowUpRight, Share2, Info, BarChart2, PackageOpen, Loader2, ChevronDown, ChevronUp, Search
} from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import ConvertWatchlistDialog from "./convert-watchlist-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/utils";
import { useAnalysisVisibility } from "@/hooks/use-analysis-visibility";
import {
  parseAiAnalysis,
  formatPrice,
  calculatePriceStatus,
  type AiAnalysis
} from "@/lib/json-utils";

interface ProductCardProps {
  product: SelectProduct;
  onEdit: (product: SelectProduct) => void;
  inWatchlist?: boolean;
  view?: "grid" | "list" | "table";
}

export default function ProductCard({ product, onEdit, inWatchlist, view = "grid" }: ProductCardProps) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);
  const [isMarkingAsSold, setIsMarkingAsSold] = useState(false);
  const [imageError, setImageError] = useState(false);
  const displayUrl = getImageUrl(product.imageUrl);
  const [showAnalysis, setShowAnalysis] = useAnalysisVisibility(true); // Updated to default to true
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [showEbayData, setShowEbayData] = useState(false);

  const aiAnalysis = parseAiAnalysis(product.aiAnalysis);
  const hasAnalysis = Boolean(aiAnalysis);
  const currentPrice = Number(product.price) || 0;
  const { isUnderpriced, isOverpriced, isPricedRight } = calculatePriceStatus(currentPrice, aiAnalysis);

  const markAsSold = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMarkingAsSold) return;

    setIsMarkingAsSold(true);
    try {
      const response = await apiRequest("POST", "/api/orders", {
        productId: product.id
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to mark product as sold');
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
    } finally {
      setIsMarkingAsSold(false);
    }
  }, [product.id, product.name, toast, setLocation]);

  const toggleWatchlist = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (inWatchlist && location.includes("/watchlist")) {
      return;
    }

    if (isUpdatingWatchlist) return;

    setIsUpdatingWatchlist(true);
    try {
      const response = await apiRequest(
        inWatchlist ? "DELETE" : "POST",
        inWatchlist ? `/api/watchlist/${product.id}` : "/api/watchlist",
        !inWatchlist ? { productId: product.id } : undefined
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to update watchlist');
      }

      if (response.status !== 204) {
        const result = await response.json();
        if (result.error) {
          throw new Error(result.error);
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/products"] })
      ]);

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
    } finally {
      setIsUpdatingWatchlist(false);
    }
  }, [product.id, product.name, inWatchlist, toast, location]);

  const deleteProduct = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await apiRequest("DELETE", `/api/products/${product.id}`);

      if (response.status === 404) {
        const result = await response.json();
        if (result.error === "Product not found") {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
          ]);

          toast({
            title: "Product removed",
            description: "The product has been removed from the system",
          });
          return;
        }
      }

      if (response.status === 204) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
        ]);
        toast({
          title: "Product deleted",
          description: product.name,
        });
        return;
      }

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete product');
      }

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
        description: "Failed to delete product. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
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
      <div className="group/row relative">
        <div className="flex items-center gap-4 p-4 hover:bg-secondary/5 rounded-lg transition-colors">
          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
            {!imageError && displayUrl ? (
              <img
                src={displayUrl}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center">
                <Box className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 w-[300px]">
            <h3 className="font-medium line-clamp-1">{product.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {product.description}
            </p>
          </div>

          <div className="flex-shrink-0 w-[120px]">
            <div className="text-sm font-medium">
              {formatPrice(product.price)}
            </div>
            <div className="text-xs text-muted-foreground">
              {inWatchlist ? "Recommended" : "List Price"}
            </div>
          </div>

          <div className="flex-shrink-0 w-[120px]">
            {product.ebayPrice ? (
              <>
                <div className="text-sm font-medium">
                  {formatPrice(product.ebayPrice)}
                </div>
                <div className="text-xs text-muted-foreground">eBay Price</div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Not Listed</span>
            )}
          </div>

          <div className="flex-shrink-0 w-[100px]">
            <span className="text-sm capitalize">
              {product.condition?.replace(/_/g, ' ') || 'Not Specified'}
            </span>
          </div>

          {hasAnalysis && (
            <div className="flex-shrink-0 w-[150px]">
              <div
                className={cn(
                  "text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 font-medium",
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
                  {formatPrice(aiAnalysis.marketAnalysis.priceSuggestion.min)} - {formatPrice(aiAnalysis.marketAnalysis.priceSuggestion.max)}
                </div>
              )}
            </div>
          )}

          <div className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity duration-100 absolute right-4 bg-background/95 rounded-lg shadow-sm z-50">
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
                disabled={isDeleting}
                className="h-8 w-8 hover:scale-105 transition-transform"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
              {!inWatchlist && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={markAsSold}
                  disabled={isMarkingAsSold}
                  className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                >
                  {isMarkingAsSold ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
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
                  disabled={isUpdatingWatchlist}
                  className="h-8 w-8 hover:scale-105 transition-transform"
                >
                  {isUpdatingWatchlist ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
                  )}
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
                      onClick={() => product.ebayListingUrl ? window.open(product.ebayListingUrl, '_blank') : null}
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
      </div>
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
        <div className={cn(
          "relative",
          view === "grid" ? "w-full" : "w-48 shrink-0 h-48"
        )}>
          {!imageError && displayUrl ? (
            view === "grid" ? (
              <AspectRatio ratio={4 / 3} className="bg-secondary/20">
                <img
                  src={displayUrl}
                  alt={product.name}
                  className="object-cover w-full h-full"
                  onError={() => setImageError(true)}
                />
              </AspectRatio>
            ) : (
              <img
                src={displayUrl}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            )
          ) : (
            <div className={cn(
              "bg-secondary/20 flex items-center justify-center",
              view === "grid" ? (
                <AspectRatio ratio={4 / 3}>
                  <div className="flex items-center justify-center w-full h-full">
                    <Box className="w-8 h-8 text-muted-foreground" />
                  </div>
                </AspectRatio>
              ) : "w-full h-full"
            )}>
              <Box className="w-8 h-8 text-muted-foreground" />
            </div>
          )}

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
        <div className={cn(
          view === "list" && "flex-1 flex flex-col"
        )}>
          <CardContent className={cn(
            "p-4",
            view === "list" && "flex-1"
          )}>
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                view === "list" && "flex-1"
              )}>
                <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
                <p className="text-muted-foreground text-sm">{product.description}</p>
              </div>
            </div>

            {showAnalysis && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="font-medium text-lg">AI Analysis Results</h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 hover:bg-transparent p-0"
                    onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                  >
                    {showAiAnalysis ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {showAiAnalysis && (
                  <ScrollArea className="h-[400px] mt-4">
                    <div className="pr-4 space-y-4">
                      <div className="p-3 bg-secondary/20 rounded-lg space-y-3">
                        {aiAnalysis?.marketAnalysis?.demandScore && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">Market Demand</span>
                              <span className="text-sm font-medium">{aiAnalysis.marketAnalysis.demandScore}/100</span>
                            </div>
                            <Progress value={aiAnalysis.marketAnalysis.demandScore} className="h-2" />
                          </div>
                        )}
                        {aiAnalysis?.marketAnalysis?.competitionLevel && (
                          <div className="flex items-center gap-2">
                            <BarChart className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Competition: {aiAnalysis.marketAnalysis.competitionLevel}</span>
                          </div>
                        )}
                      </div>

                      {aiAnalysis?.marketAnalysis?.priceSuggestion && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            <h5 className="font-medium">Price Analysis</h5>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-sm text-muted-foreground">Current Price:</span>
                              <span className={cn(
                                "text-lg font-semibold block",
                                isUnderpriced && "text-yellow-600",
                                isOverpriced && "text-red-600",
                                isPricedRight && "text-green-600"
                              )}>
                                {formatPrice(currentPrice)}
                              </span>
                            </div>
                            <div className="space-y-2">
                              <span className="text-sm text-muted-foreground">Suggested Range:</span>
                              <div className="space-x-2">
                                <span className="text-lg font-semibold">{formatPrice(aiAnalysis.marketAnalysis.priceSuggestion.min)}</span>
                                <span className="text-muted-foreground">-</span>
                                <span className="text-lg font-semibold">{formatPrice(aiAnalysis.marketAnalysis.priceSuggestion.max)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
            {aiAnalysis?.ebayData && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <PackageOpen className="h-4 w-4" />
                    <h5 className="font-medium">eBay Market Data</h5>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 hover:bg-transparent p-0"
                    onClick={() => setShowEbayData(!showEbayData)}
                  >
                    {showEbayData ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {showEbayData && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-2">
                      <div>
                        <span className="text-muted-foreground">Current Price:</span>
                        <span className="font-medium block">{formatPrice(aiAnalysis.ebayData.currentPrice)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Average Price:</span>
                        <span className="font-medium block">{formatPrice(aiAnalysis.ebayData.averagePrice)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-muted-foreground">Price Range:</span>
                        <span className="font-medium block">
                          {formatPrice(aiAnalysis.ebayData.lowestPrice)} - {formatPrice(aiAnalysis.ebayData.highestPrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Market Activity:</span>
                        <span className="font-medium block">{aiAnalysis.ebayData.soldCount} sold / {aiAnalysis.ebayData.activeListing} active</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiAnalysis?.seoKeywords && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <h5 className="font-medium">SEO Keywords</h5>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiAnalysis.seoKeywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-secondary/40 rounded-full text-xs font-medium"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiAnalysis?.suggestions && (
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
            )}
          </CardContent>

          <CardFooter className={cn(
            "p-4 pt-0 flex justify-between",
            view === "list" && "border-t"
          )}>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleEdit}
                className="h-8 w-8 hover:scale-105 transition-transform"
              >
                <Edit className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={deleteProduct}
                disabled={isDeleting}
                className="h-8 w-8 hover:scale-105 transition-transform"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>

              {!inWatchlist && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={markAsSold}
                  disabled={isMarkingAsSold}
                  className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                >
                  {isMarkingAsSold ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {inWatchlist && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleConvertDialog}
                  className="h-8 w-8 hover:scale-105 transition-transform text-blue-600 hover:text-blue-700"
                  title="Convert to Inventory"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}

              {!location.includes("/watchlist") && (
                <Button
                  variant={inWatchlist ? "secondary" : "ghost"}
                  size="icon"
                  onClick={toggleWatchlist}
                  disabled={isUpdatingWatchlist}
                  className="h-8 w-8 hover:scale-105 transition-transform"
                >
                  {isUpdatingWatchlist ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
                  )}
                </Button>
              )}

              {!inWatchlist && (
                <>
                  {!product.ebayListingUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
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
                      variant="ghost"
                      size="icon"
                      onClick={() => product.ebayListingUrl ? window.open(product.ebayListingUrl, '_blank') : null}
                      className="h-8 w-8 hover:scale-105 transition-transform text-green-600 hover:text-green-700"
                      title="View on eBay"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
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