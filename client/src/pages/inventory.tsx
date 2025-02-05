import { useState } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ProductCard from "@/components/product-card";
import { ProductTable } from "@/components/product-table";
import ProductForm from "@/components/product-form";
import BatchAnalysisDialog from "@/components/batch-analysis-dialog";
import { Plus, Search, Sparkles } from "lucide-react";
import { type SelectProduct, type SelectWatchlist } from "@db/schema";
import { useViewPreference } from "@/hooks/use-view-preference";
import ViewToggle from "@/components/view-toggle";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Inventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBatchAnalysisOpen, setIsBatchAnalysisOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectProduct | undefined>();
  const [view, setView] = useViewPreference();

  const { data: products = [] } = useQuery<SelectProduct[]>({
    queryKey: ["/api/products"],
  });

  const { data: watchlist = [] } = useQuery<SelectWatchlist[]>({
    queryKey: ["/api/watchlist"],
  });

  const watchlistIds = new Set(watchlist.map((item) => item.productId));

  const filteredProducts = products.filter((product: SelectProduct) =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    (product.sku?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const handleEdit = (product: SelectProduct) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
  };

  const handleDelete = async (product: SelectProduct) => {
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
  };

  const toggleWatchlist = async (product: SelectProduct) => {
    try {
      if (watchlistIds.has(product.id)) {
        const response = await apiRequest("DELETE", `/api/watchlist/${product.id}`);
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }
      } else {
        const response = await apiRequest("POST", "/api/watchlist", {
          productId: product.id
        });
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
        title: watchlistIds.has(product.id) ? "Removed from watchlist" : "Added to watchlist",
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

  const handleDialogClose = () => {
    setSelectedProduct(undefined);
    setIsDialogOpen(false);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ViewToggle
                view={view}
                onViewChange={setView}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsBatchAnalysisOpen(true)}
                disabled={products.length === 0}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Batch Analysis
              </Button>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>

          {view === "table" ? (
            <ProductTable
              products={filteredProducts}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleWatchlist={toggleWatchlist}
            />
          ) : (
            <div className={cn(
              view === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                : view === "list"
                  ? "space-y-4"
                  : "divide-y"
            )}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={handleEdit}
                  inWatchlist={watchlistIds.has(product.id)}
                  view={view}
                />
              ))}
            </div>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {selectedProduct ? "Edit Product" : "Add New Product"}
                </DialogTitle>
              </DialogHeader>
              <ProductForm
                product={selectedProduct}
                onComplete={handleDialogClose}
              />
            </DialogContent>
          </Dialog>

          <BatchAnalysisDialog
            open={isBatchAnalysisOpen}
            onOpenChange={setIsBatchAnalysisOpen}
            products={products}
          />
        </main>
      </div>
    </div>
  );
}