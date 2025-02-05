import { useState } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product-card";
import { ProductTable } from "@/components/product-table";
import ViewToggle from "@/components/view-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, PackageSearch, AlertCircle } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import ProductForm from "@/components/product-form";
import { cn } from "@/lib/utils";
import { useViewPreference } from "@/hooks/use-view-preference";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WatchlistItem {
  id: number;
  userId: number;
  productId: number;
  createdAt: string;
  product: SelectProduct;
}

export default function Watchlist() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectProduct | undefined>();
  const [view, setView] = useViewPreference();

  // Enhanced data fetching with error handling
  const { data: watchlist = [], isLoading, error } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
    onError: (error) => {
      toast({
        title: "Error loading watchlist",
        description: error instanceof Error ? error.message : "Failed to load watchlist items",
        variant: "destructive",
      });
    },
  });

  // Improved filtering with type safety
  const filteredWatchlist = watchlist
    .filter((item): item is WatchlistItem & { product: NonNullable<SelectProduct> } => {
      return item.product != null;
    })
    .filter((item) => {
      const searchTerm = search.toLowerCase().trim();
      return (
        item.product.name.toLowerCase().includes(searchTerm) ||
        (item.product.sku?.toLowerCase() || '').includes(searchTerm) ||
        (item.product.brand?.toLowerCase() || '').includes(searchTerm)
      );
    });

  const handleEdit = (product: SelectProduct) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
  };

  const handleDelete = async (product: SelectProduct) => {
    try {
      const response = await apiRequest("DELETE", `/api/watchlist/${product.id}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Invalidate both queries to ensure data consistency
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/products"] })
      ]);

      toast({
        title: "Removed from watchlist",
        description: product.name,
      });
    } catch (error) {
      console.error('Watchlist removal failed:', error);
      toast({
        title: "Error",
        description: "Failed to remove from watchlist",
        variant: "destructive",
      });
    }
  };

  const handleDialogClose = () => {
    setSelectedProduct(undefined);
    setIsDialogOpen(false);
  };

  const toggleWatchlist = async (product: SelectProduct) => {
    await handleDelete(product);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, or brand..."
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
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium">Failed to load watchlist</h3>
              <p className="text-sm text-muted-foreground">Please try refreshing the page</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center items-center h-[200px]">
              <div className="animate-spin">
                <PackageSearch className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
          ) : (
            <>
              {view === "table" ? (
                <ProductTable
                  products={filteredWatchlist.map(item => item.product)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleWatchlist={toggleWatchlist}
                  inWatchlist={true}
                />
              ) : (
                <div className={cn(
                  view === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    : view === "list"
                      ? "space-y-4"
                      : "divide-y"
                )}>
                  {filteredWatchlist.map((item) => (
                    <ProductCard
                      key={item.id}
                      product={item.product}
                      onEdit={handleEdit}
                      inWatchlist={true}
                      view={view}
                    />
                  ))}
                </div>
              )}

              {filteredWatchlist.length === 0 && (
                <div className="text-center text-muted-foreground mt-12">
                  <PackageSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">
                    {search ? "No matching products found" : "No products in your watchlist"}
                  </p>
                  <p className="text-sm mt-2">
                    {search 
                      ? "Try adjusting your search terms"
                      : "Add products to your watchlist to monitor them"}
                  </p>
                </div>
              )}
            </>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {selectedProduct ? "Edit Watchlist Product" : "Add Product to Watchlist"}
                </DialogTitle>
              </DialogHeader>
              <ProductForm
                product={selectedProduct}
                onComplete={handleDialogClose}
                isWatchlistItem={true}
              />
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}