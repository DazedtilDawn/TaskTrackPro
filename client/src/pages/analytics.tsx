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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useState } from "react";
import { format, subDays } from "date-fns";
import { InventoryAgingAnalysis } from "@/components/inventory-aging-analysis";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

type RevenueDataPoint = {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
};

type InventoryCategory = {
  category: string;
  totalValue: number;
  totalCost: number;
  itemCount: number;
  totalQuantity: number;
};

type TopProduct = {
  productId: number;
  name: string;
  metric: number;
  totalQuantity: number;
  averagePrice: number;
};

type InventoryAging = {
  agingSummary: {
    ageGroup: string;
    totalValue: number;
    totalCost: number;
    itemCount: number;
    totalQuantity: number;
    averagePrice: number;
    categories: string[];
  }[];
  slowMovingItems: {
    id: number;
    name: string;
    category: string;
    price: number;
    purchasePrice: number | null;
    quantity: number;
    createdAt: string;
    daysInStock: number;
    potentialLoss: number;
  }[];
};

export default function Analytics() {
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [metricType, setMetricType] = useState<'profit' | 'revenue' | 'quantity'>('profit');

  // Fetch revenue data
  const { data: revenueData = [], isLoading: isRevenueLoading } = useQuery<RevenueDataPoint[]>({
    queryKey: ["/api/analytics/revenue", { startDate: startDate.toISOString(), endDate: endDate.toISOString() }],
  });

  // Fetch inventory data
  const { data: inventoryData = [], isLoading: isInventoryLoading } = useQuery<InventoryCategory[]>({
    queryKey: ["/api/analytics/inventory"],
  });

  // Fetch top products
  const { data: topProducts = [], isLoading: isTopProductsLoading } = useQuery<TopProduct[]>({
    queryKey: ["/api/analytics/top-products", { metric: metricType }],
  });

  // Fetch inventory aging data
  const { data: agingData, isLoading: isAgingLoading } = useQuery<InventoryAging>({
    queryKey: ["/api/analytics/inventory-aging"],
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">From:</span>
              <DatePicker date={startDate} onDateChange={setStartDate} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">To:</span>
              <DatePicker date={endDate} onDateChange={setEndDate} />
            </div>
            <Select value={metricType} onValueChange={(value: any) => setMetricType(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profit">Profit</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="quantity">Quantity Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Revenue Over Time */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Revenue & Profit Over Time</CardTitle>
                <CardDescription>Daily revenue and profit analysis</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {isRevenueLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => format(new Date(date), 'MM/dd')}
                        className="text-muted-foreground"
                      />
                      <YAxis className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))" }}
                        formatter={(value: any) => {
                          if (typeof value === 'number') {
                            return `$${value.toFixed(2)}`;
                          }
                          return '$0.00';
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name="Profit"
                        stroke="hsl(var(--success))"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Inventory Value by Category */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Inventory Value by Category</CardTitle>
                <CardDescription>Distribution of inventory value</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {isInventoryLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inventoryData}
                        dataKey="totalValue"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ category, percent }) =>
                          `${category}: ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {inventoryData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))" }}
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Top Products by {metricType.charAt(0).toUpperCase() + metricType.slice(1)}</CardTitle>
              <CardDescription>
                Performance metrics for top-selling products
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {isTopProductsLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-muted-foreground" />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))" }}
                      formatter={(value: number) =>
                        metricType === "quantity" ? value : `$${value.toFixed(2)}`
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey="metric"
                      name={metricType.charAt(0).toUpperCase() + metricType.slice(1)}
                      fill="hsl(var(--primary))"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Inventory Aging Analysis */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Inventory Aging Analysis</CardTitle>
              <CardDescription>
                Track inventory age and identify slow-moving items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryAgingAnalysis
                data={agingData}
                isLoading={isAgingLoading}
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}