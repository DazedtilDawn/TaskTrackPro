import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { SelectProduct } from "@db/schema";

interface ConvertWatchlistFormData {
  buyPrice: number;
  recommendedSalePrice: number;
}

interface ConvertWatchlistDialogProps {
  product: SelectProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConvertWatchlistDialog({
  product,
  open,
  onOpenChange,
}: ConvertWatchlistDialogProps) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { isSubmitting },
  } = useForm<ConvertWatchlistFormData>({
    defaultValues: {
      buyPrice: 0,
      recommendedSalePrice: Number(product.price) || 0,
    }
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const generateRecommendation = async () => {
    setIsGenerating(true);
    try {
      const buyPrice = Number(getValues("buyPrice"));
      if (!buyPrice || buyPrice <= 0) {
        throw new Error("Please enter a valid buy price");
      }

      const response = await apiRequest("POST", "/api/generate-sale-price", {
        productId: product.id,
        buyPrice,
        currentPrice: product.price,
        condition: product.condition,
        category: product.category,
      });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setValue("recommendedSalePrice", data.recommendedSalePrice);

      toast({
        title: "Recommendation Generated",
        description: "The sale price has been recommended based on market data.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to generate recommendation",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = async (data: ConvertWatchlistFormData) => {
    try {
      // 1. Update the product with new price and quantity
      await apiRequest("PATCH", `/api/products/${product.id}`, {
        price: data.recommendedSalePrice,
        quantity: 1,
        sold: false,
      });

      // 2. Find and remove from watchlist using the correct watchlist item ID
      const watchlistResponse = await apiRequest("GET", "/api/watchlist");
      const watchlistItems = await watchlistResponse.json();

      const itemToDelete = watchlistItems.find((item: any) => item.productId === product.id);

      if (itemToDelete) {
        await apiRequest("DELETE", `/api/watchlist/${itemToDelete.id}`);
      } else {
        toast({
          title: "Error",
          description: "Failed to find item in the watchlist",
          variant: "destructive",
        });
        return;
      }

      // 3. Invalidate queries to refresh the UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
      ]);

      toast({
        title: "Product Converted",
        description: `${product.name} has been added to your inventory.`,
      });

      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to convert product",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to Inventory Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Buy Price ($)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register("buyPrice", { 
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                Recommended Sale Price ($)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register("recommendedSalePrice", { 
                  required: true,
                  min: 0,
                  valueAsNumber: true
                })}
                className="w-full"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={generateRecommendation}
              disabled={isGenerating || !(Number(getValues("buyPrice")) > 0)}
              className="mt-6"
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Generate"
              )}
            </Button>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !(Number(getValues("buyPrice")) > 0)}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Convert"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}