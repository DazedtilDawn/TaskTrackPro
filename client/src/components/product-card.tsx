import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Edit, Trash2, Sparkles, TrendingUp, Tag, Box, BarChart, CheckCircle2 } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {ScrollArea} from "@/components/ui/scroll-area";

interface ProductCardProps {
  product: SelectProduct;
  onEdit: (product: SelectProduct) => void;
  inWatchlist?: boolean;
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
}

export default function ProductCard({ product, onEdit, inWatchlist }: ProductCardProps) {
  const { toast } = useToast();

  const markAsSold = async () => {
    try {
      const response = await apiRequest("POST", "/api/orders", {
        productId: product.id
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Force refetch to update the UI
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/products"] }),
        queryClient.refetchQueries({ queryKey: ["/api/watchlist"] }),
        queryClient.refetchQueries({ queryKey: ["/api/orders"] })
      ]);

      toast({
        title: "Product marked as sold",
        description: product.name,
      });
    } catch (error) {
      console.error('Error marking product as sold:', error);
      toast({
        title: "Error",
        description: "Failed to mark product as sold",
        variant: "destructive",
      });
    }
  };

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        console.log(`Attempting to delete product ${product.id} from watchlist`);
        const response = await apiRequest("DELETE", `/api/watchlist/${product.id}`);
        const result = await response.json();
        console.log('Delete response:', result);

        if (result.error) {
          throw new Error(result.error);
        }

        // Force refetch instead of just invalidating
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["/api/watchlist"] }),
          queryClient.refetchQueries({ queryKey: ["/api/products"] })
        ]);

        console.log('Queries refetched after deletion');
      } else {
        console.log(`Attempting to add product ${product.id} to watchlist`);
        const response = await apiRequest("POST", "/api/watchlist", { 
          productId: product.id 
        });
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["/api/watchlist"] }),
          queryClient.refetchQueries({ queryKey: ["/api/products"] })
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
  };

  const deleteProduct = async () => {
    try {
      const response = await apiRequest("DELETE", `/api/products/${product.id}`);
      const result = await response.json();

      // Force refetch both queries to ensure UI is updated
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/products"] }),
        queryClient.refetchQueries({ queryKey: ["/api/watchlist"] })
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
  };

  const aiAnalysis = product.aiAnalysis as AIAnalysis | undefined;
  const hasAnalysis = aiAnalysis && Object.keys(aiAnalysis).length > 0;
  const currentPrice = Number(product.price) || 0;
  const isUnderpriced = hasAnalysis && currentPrice < (aiAnalysis?.marketAnalysis?.priceSuggestion?.min ?? 0);
  const isOverpriced = hasAnalysis && currentPrice > (aiAnalysis?.marketAnalysis?.priceSuggestion?.max ?? 0);
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced;

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-200 hover:shadow-lg",
      isUnderpriced && "border-yellow-500/50",
      isOverpriced && "border-red-500/50",
      isPricedRight && "border-green-500/50"
    )}>
      {product.imageUrl && (
        <div className="relative">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-48 object-cover"
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
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          {hasAnalysis && aiAnalysis && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 transition-transform hover:scale-110"
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

                      <div className="border-t pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="h-4 w-4" />
                          <h5 className="font-medium">Optimization Tips</h5>
                        </div>
                        <ul className="space-y-2">
                          {aiAnalysis.suggestions.map((suggestion: string, index: number) => (
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

        <p className="text-muted-foreground text-sm mb-4">{product.description}</p>

        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-lg font-semibold">${currentPrice}</span>
            {product.ebayPrice && (
              <div className="text-sm text-muted-foreground">
                eBay: ${product.ebayPrice.toString()}
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground">SKU: {product.sku}</span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex justify-between">
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(product)}
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
          <Button
            size="icon"
            variant="ghost"
            onClick={markAsSold}
            className="hover:scale-105 transition-transform text-green-600 hover:text-green-700"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
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
    </Card>
  );
}