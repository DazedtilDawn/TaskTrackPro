import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";

export default function Watchlist() {
  const [search, setSearch] = useState("");

  const { data: watchlist = [] } = useQuery({
    queryKey: ["/api/watchlist"],
  });

  const filteredWatchlist = watchlist.filter(item =>
    item.product.name.toLowerCase().includes(search.toLowerCase()) ||
    item.product.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search watchlist..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredWatchlist.map((item) => (
              <ProductCard
                key={item.id}
                product={item.product}
                onEdit={() => {}}
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
        </main>
      </div>
    </div>
  );
}
