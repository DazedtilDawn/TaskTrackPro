import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SelectProduct } from "@db/schema";

interface AddToWatchlistDialogProps {
  product: SelectProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddToWatchlistDialog({
  product,
  open,
  onOpenChange,
}: AddToWatchlistDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!product) return;

    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/watchlist", {
        productId: product.id
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add to watchlist");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });

      toast({
        title: "Added to watchlist",
        description: `${product.name} has been added to your watchlist.`
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add to watchlist:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add to watchlist",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
          <DialogDescription>
            Do you want to add {product?.name} to your watchlist?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !product}
          >
            {isSubmitting ? "Adding..." : "Add to Watchlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}