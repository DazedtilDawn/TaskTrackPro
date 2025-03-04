import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product-card";
import { ProductTable } from "@/components/ProductTable";
import ViewToggle from "@/components/view-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState } from "react";
import { Search, Plus, PackageSearch } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import ProductForm from "@/components/product-form";
import { cn } from "@/lib/utils";
import { useViewPreference } from "@/hooks/use-view-preference";

interface WatchlistItem {
  id: number;
  userId: number;
  productId: number;
  createdAt: string;
  product: SelectProduct;
}

export default function Watchlist() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectProduct | undefined>();
  const [view, setView] = useViewPreference();

  const { data: watchlist = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const filteredWatchlist = watchlist
    .filter((item) => item.product)
    .filter((item) => {
      const searchTerm = search.toLowerCase();
      return (
        item.product.name.toLowerCase().includes(searchTerm) ||
        (item.product.sku?.toLowerCase() || '').includes(searchTerm)
      );
    });

  const handleDialogClose = () => {
    setSelectedProduct(undefined);
    setIsDialogOpen(false);
  };

  const handleAddProduct = () => {
    setSelectedProduct(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (product: SelectProduct) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
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
                  placeholder="Search watchlist..."
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
            <Button onClick={handleAddProduct}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-[200px]">
              <div className="animate-spin">
                <PackageSearch className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
          ) : (
            <>
              {view === "table" ? (
                <ProductTable products={filteredWatchlist.map(item => item.product)} />
              ) : (
                <>
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
                        watchlistId={item.id}
                      />
                    ))}
                  </div>

                  {filteredWatchlist.length === 0 && (
                    <div className="text-center text-muted-foreground mt-12">
                      <PackageSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium">No products in your watchlist</p>
                      <p className="text-sm mt-2">
                        Add products to your watchlist to monitor them
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-4xl">
              <ProductForm
                product={selectedProduct}
                onComplete={handleDialogClose}
                isWatchlistItem={true}
                open={isDialogOpen}
              />
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}