import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { analyzeBatchProducts } from "@/lib/gemini";
import { useToast } from "@/hooks/use-toast";
import { type SelectProduct } from "@db/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BatchAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SelectProduct[];
}

export default function BatchAnalysisDialog({
  open,
  onOpenChange,
  products,
}: BatchAnalysisDialogProps) {
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const toggleProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleAnalysis = async () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to analyze",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);
    try {
      const productsToAnalyze = products.filter(p => selectedProducts.has(p.id));
      const results = await analyzeBatchProducts(
        productsToAnalyze.map(p => ({
          id: p.id,  // Include id in the analysis request
          name: p.name,
          description: p.description || "",
          price: Number(p.price),
          sku: p.sku,
        }))
      );

      // Update each product with its analysis using product.id as the key
      for (const product of productsToAnalyze) {
        const analysis = results.get(product.id);
        if (analysis) {
          await apiRequest("PATCH", `/api/products/${product.id}`, {
            aiAnalysis: analysis,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Analysis complete",
        description: `Successfully analyzed ${selectedProducts.size} products`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: "An error occurred while analyzing products",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch Product Analysis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select products to analyze. The AI will provide insights and suggestions for improvement.
          </p>
          <ScrollArea className="h-[300px] border rounded-md p-4">
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`product-${product.id}`}
                    checked={selectedProducts.has(product.id)}
                    onCheckedChange={() => toggleProduct(product.id)}
                  />
                  <label
                    htmlFor={`product-${product.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {product.name}
                  </label>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedProducts.size} products selected
            </p>
            <div className="space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={analyzing}
              >
                Cancel
              </Button>
              <Button onClick={handleAnalysis} disabled={analyzing}>
                {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analyze Selected Products
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}