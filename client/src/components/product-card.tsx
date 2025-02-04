import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Edit, Trash2, Sparkles } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ProductCardProps {
  product: SelectProduct;
  onEdit: (product: SelectProduct) => void;
  inWatchlist?: boolean;
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

  const hasAnalysis = product.aiAnalysis && Object.keys(product.aiAnalysis).length > 0;

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
          {hasAnalysis && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Sparkles className="h-4 w-4 text-primary" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium">AI Analysis</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Category:</span> {product.aiAnalysis.category}</p>
                    <p><span className="font-medium">Demand Score:</span> {product.aiAnalysis.marketAnalysis.demandScore}/100</p>
                    <p><span className="font-medium">Competition:</span> {product.aiAnalysis.marketAnalysis.competitionLevel}</p>
                    <p><span className="font-medium">Suggested Price Range:</span> ${product.aiAnalysis.marketAnalysis.priceSuggestion.min} - ${product.aiAnalysis.marketAnalysis.priceSuggestion.max}</p>
                    <div>
                      <p className="font-medium">Suggestions:</p>
                      <ul className="list-disc pl-4">
                        {product.aiAnalysis.suggestions.slice(0, 3).map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">SEO Keywords:</p>
                      <p className="text-muted-foreground">{product.aiAnalysis.seoKeywords.join(", ")}</p>
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