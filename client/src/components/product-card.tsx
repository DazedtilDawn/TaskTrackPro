import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Edit, Trash2, Sparkles, TrendingUp, Tag, Box, BarChart } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

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

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        await apiRequest("DELETE", `/api/watchlist/${product.id}`);
      } else {
        await apiRequest("POST", "/api/watchlist", { productId: product.id });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: inWatchlist ? "Removed from watchlist" : "Added to watchlist",
        description: product.name,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive",
      });
    }
  };

  const deleteProduct = async () => {
    try {
      await apiRequest("DELETE", `/api/products/${product.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Product deleted",
        description: product.name,
      });
    } catch (error) {
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
    <Card className="overflow-hidden">
      {product.imageUrl && (
        <img 
          src={product.imageUrl} 
          alt={product.name} 
          className="w-full h-48 object-cover"
        />
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          {hasAnalysis && aiAnalysis && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Sparkles className="h-4 w-4 text-primary" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-lg">AI Analysis</h4>
                    <span className="text-sm text-muted-foreground">{aiAnalysis.category}</span>
                  </div>

                  <div className="p-4 bg-secondary/20 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Market Demand</span>
                      <span className="text-sm font-medium">{aiAnalysis.marketAnalysis.demandScore}/100</span>
                    </div>
                    <Progress value={aiAnalysis.marketAnalysis.demandScore} className="h-2" />

                    <div className="flex items-center gap-2 mt-2">
                      <BarChart className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Competition: {aiAnalysis.marketAnalysis.competitionLevel}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <h5 className="font-medium">Price Analysis</h5>
                    </div>

                    <div className="pl-6 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Suggested Range:</span>
                        <span className="font-medium">
                          ${aiAnalysis.marketAnalysis.priceSuggestion.min} - ${aiAnalysis.marketAnalysis.priceSuggestion.max}
                        </span>
                      </div>

                      <div className={`text-sm px-3 py-1.5 rounded-md ${
                        isUnderpriced ? 'bg-yellow-500/10 text-yellow-600' :
                        isOverpriced ? 'bg-red-500/10 text-red-600' :
                        'bg-green-500/10 text-green-600'
                      }`}>
                        {isUnderpriced ? '⚠️ Currently underpriced' :
                         isOverpriced ? '⚠️ Currently overpriced' :
                         '✓ Optimal price range'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <h5 className="font-medium">Top Suggestions</h5>
                    </div>
                    <ul className="space-y-1.5 pl-6">
                      {aiAnalysis.suggestions.slice(0, 3).map((suggestion: string, index: number) => (
                        <li key={index} className="text-sm text-muted-foreground list-disc">{suggestion}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4" />
                      <h5 className="font-medium">SEO Keywords</h5>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {aiAnalysis.seoKeywords.map((keyword: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-xs font-medium"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <p className="text-muted-foreground text-sm mb-2">{product.description}</p>
        <div className="flex justify-between items-center text-sm">
          <span className="font-medium">${product.price?.toString()}</span>
          <span>SKU: {product.sku}</span>
        </div>
        {product.ebayPrice && (
          <div className="mt-2 text-sm text-muted-foreground">
            eBay Price: ${product.ebayPrice.toString()}
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={() => onEdit(product)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={deleteProduct}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Button
          size="icon"
          variant={inWatchlist ? "secondary" : "ghost"}
          onClick={toggleWatchlist}
        >
          <Heart className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
        </Button>
      </CardFooter>
    </Card>
  );
}