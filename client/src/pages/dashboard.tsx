import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Package, Heart, ShoppingCart, TrendingUp } from "lucide-react";
import { type Product, type Order, type WatchlistItem, type ApiResponse } from "@/types/api";

export default function Dashboard() {
  const { data: productsResponse } = useQuery<ApiResponse<Product[]>>({
    queryKey: ["/api/products"],
  });

  const { data: watchlistResponse } = useQuery<ApiResponse<WatchlistItem[]>>({
    queryKey: ["/api/watchlist"],
  });

  const { data: ordersResponse } = useQuery<ApiResponse<Order[]>>({
    queryKey: ["/api/orders"],
  });

  const products = productsResponse?.data || [];
  const watchlist = watchlistResponse?.data || [];
  const orders = ordersResponse?.data || [];

  const stats = [
    {
      title: "Total Products",
      value: products.length,
      icon: Package,
      description: "Products in inventory",
    },
    {
      title: "Watchlist Items",
      value: watchlist.length,
      icon: Heart,
      description: "Products being monitored",
    },
    {
      title: "Total Orders",
      value: orders.length,
      icon: ShoppingCart,
      description: "Processed orders",
    },
    {
      title: "Revenue",
      value: `$${orders.reduce((acc, order) => acc + Number(order.total), 0).toFixed(2)}`,
      icon: TrendingUp,
      description: "Total revenue",
    },
  ];

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {stats.map((stat) => (
              <Card key={stat.title} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="col-span-4">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Sales Overview</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={orders}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="createdAt" className="text-muted-foreground" />
                  <YAxis className="text-muted-foreground" />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}