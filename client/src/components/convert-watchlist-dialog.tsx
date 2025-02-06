import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import type { SelectProduct } from "@db/schema";
import { cn } from "@/lib/utils";

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
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<ConvertWatchlistFormData>({
    defaultValues: {
      buyPrice: 0,
      recommendedSalePrice: Number(product.price) || 0,
    }
  });

  const [isGenerating, setIsGenerating] = useState(false);

  // Watch form values for real-time calculations
  const buyPrice = watch("buyPrice");
  const recommendedSalePrice = watch("recommendedSalePrice");

  // Calculate potential profit
  const potentialProfit = recommendedSalePrice - buyPrice;
  const profitMargin = buyPrice > 0 ? (potentialProfit / buyPrice) * 100 : 0;

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
      const updateResponse = await apiRequest("PATCH", `/api/products/${product.id}`, {
        price: data.recommendedSalePrice,
        quantity: 1,
        sold: false,
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(error.error || "Failed to update product");
      }

      // 2. Find and remove from watchlist
      const watchlistResponse = await apiRequest("GET", "/api/watchlist");
      const watchlistItems = await watchlistResponse.json();
      const itemToDelete = watchlistItems.find((item: any) => item.productId === product.id);

      if (itemToDelete) {
        const deleteResponse = await apiRequest("DELETE", `/api/watchlist/${itemToDelete.id}`);
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          const error = await deleteResponse.json();
          throw new Error(error.error || "Failed to remove from watchlist");
        }
      }

      // 3. Invalidate queries to refresh the UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
      ]);

      toast({
        title: "Added to Inventory",
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
          <DialogTitle className="text-xl">Convert to Inventory</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Product Info */}
          <div className="bg-secondary/10 p-4 rounded-lg">
            <h3 className="font-medium mb-2">{product.name}</h3>
            <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Market Price:</span>
              <span className="text-primary">${Number(product.price).toFixed(2)}</span>
            </div>
          </div>

          {/* Buy Price Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Purchase Price
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register("buyPrice", { 
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className="text-lg font-medium"
              placeholder="0.00"
            />
          </div>

          {/* Sale Price Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Sale Price
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateRecommendation}
                disabled={isGenerating || !(Number(getValues("buyPrice")) > 0)}
                className="h-8"
              >
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Generate Recommendation"
                )}
              </Button>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register("recommendedSalePrice", { 
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className="text-lg font-medium"
              placeholder="0.00"
            />
          </div>

          {/* Profit Calculator */}
          {buyPrice > 0 && recommendedSalePrice > 0 && (
            <div className={cn(
              "p-4 rounded-lg space-y-2",
              potentialProfit > 0 ? "bg-green-500/10" : "bg-red-500/10"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Potential Profit:</span>
                <span className={cn(
                  "font-semibold",
                  potentialProfit > 0 ? "text-green-600" : "text-red-600"
                )}>
                  ${potentialProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Profit Margin:</span>
                <span className={cn(
                  "font-semibold",
                  profitMargin > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {profitMargin.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
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
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Add to Inventory'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}