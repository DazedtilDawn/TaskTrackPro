import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Edit, Trash2 } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
        <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
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
