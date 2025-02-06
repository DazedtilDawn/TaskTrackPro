import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { type Product, type Order, type ApiResponse } from "@/types/api";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

type RevenueDataPoint = {
  date: string;
  revenue: number;
};

type CategoryInventory = {
  name: string;
  value: number;
};

export default function Analytics() {
  const { data: productsResponse } = useQuery<ApiResponse<Product[]>>({
    queryKey: ["/api/products"],
  });

  const { data: ordersResponse } = useQuery<ApiResponse<Order[]>>({
    queryKey: ["/api/orders"],
  });

  const products = productsResponse?.data || [];
  const orders = ordersResponse?.data || [];

  // Calculate revenue by date
  const revenueData = orders.reduce<RevenueDataPoint[]>((acc, order) => {
    const date = new Date(order.createdAt).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.revenue += Number(order.total);
    } else {
      acc.push({ date, revenue: Number(order.total) });
    }
    return acc;
  }, []);

  // Calculate inventory value by category
  const inventoryData = products.reduce<CategoryInventory[]>((acc, product) => {
    const value = Number(product.price) * Number(product.quantity);
    const category = product.aiAnalysis?.category || "Uncategorized";
    const existing = acc.find(item => item.name === category);
    if (existing) {
      existing.value += value;
    } else {
      acc.push({ name: category, value });
    }
    return acc;
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
                <CardDescription>Daily revenue analysis</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-muted-foreground" />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Inventory Value by Category</CardTitle>
                <CardDescription>Distribution of inventory value</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label
                    >
                      {inventoryData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Product Performance</CardTitle>
              <CardDescription>
                Comparison of product quantities and prices
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={products}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-muted-foreground" />
                  <YAxis yAxisId="left" className="text-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" className="text-muted-foreground" />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))" }} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="quantity"
                    fill="hsl(var(--primary))"
                    name="Quantity"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="price"
                    fill="hsl(var(--secondary))"
                    name="Price ($)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}