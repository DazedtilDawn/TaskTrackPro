import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { type SelectProduct } from "@db/schema";
import ProductForm from "@/components/product-form";

export default function Watchlist() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectProduct | undefined>();

  const { data: watchlist = [] } = useQuery<{ product: SelectProduct }[]>({
    queryKey: ["/api/watchlist"],
  });

  const filteredWatchlist = watchlist.filter(item =>
    item.product.name.toLowerCase().includes(search.toLowerCase()) ||
    item.product.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (product: SelectProduct) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
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
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search watchlist..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredWatchlist.map((item) => (
              <ProductCard
                key={item.product.id}
                product={item.product}
                onEdit={handleEdit}
                inWatchlist={true}
              />
            ))}
          </div>

          {filteredWatchlist.length === 0 && (
            <div className="text-center text-muted-foreground mt-12">
              <p>No products in your watchlist</p>
              <p className="text-sm mt-2">
                Add products to your watchlist to monitor them
              </p>
            </div>
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