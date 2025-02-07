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
import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { InventoryAgingAnalysis } from "@/components/inventory-aging-analysis";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

type RevenueDataPoint = {
  date: string;
  revenue: string | number;
  cost: string | number;
  profit: string | number;
};

type InventoryCategory = {
  category: string;
  totalValue: number | string;
  totalCost: number | string;
  itemCount: number;
  totalQuantity: number;
};

type TopProduct = {
  productId: number;
  name: string;
  metric: number | string;
  totalQuantity: number;
  averagePrice: number | string;
};

type InventoryAging = {
  agingSummary: {
    ageGroup: string;
    totalValue: number | string;
    totalCost: number | string;
    itemCount: number;
    totalQuantity: number;
    averagePrice: number | string;
    categories: string[];
  }[];
  slowMovingItems: {
    id: number;
    name: string;
    category: string;
    price: number | string;
    purchasePrice: number | string | null;
    quantity: number;
    createdAt: string;
    daysInStock: number;
    potentialLoss: number | string;
  }[];
};

const convertToNumber = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols and other non-numeric characters except decimal points and negative signs
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const formatCurrency = (value: string | number | null | undefined): string => {
  const num = convertToNumber(value);
  return `$${num.toFixed(2)}`;
};

export default function Analytics() {
  console.log('[Analytics] Component mounted');

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [metricType, setMetricType] = useState<'profit' | 'revenue' | 'quantity'>('profit');

  // Revenue Data Query
  const { data: revenueData = [], isLoading: isRevenueLoading } = useQuery<RevenueDataPoint[]>({
    queryKey: ["/api/analytics/revenue", { startDate: startDate.toISOString(), endDate: endDate.toISOString() }]
  });

  // Process revenue data
  const processedRevenueData = revenueData.map(point => ({
    ...point,
    revenue: convertToNumber(point.revenue),
    cost: convertToNumber(point.cost),
    profit: convertToNumber(point.profit)
  }));

  // Inventory Data Query
  const { data: inventoryData = [], isLoading: isInventoryLoading } = useQuery<InventoryCategory[]>({
    queryKey: ["/api/analytics/inventory"]
  });

  const processedInventoryData = inventoryData.map(item => ({
    ...item,
    totalValue: convertToNumber(item.totalValue),
    totalCost: convertToNumber(item.totalCost)
  }));

  // Top Products Query
  const { data: topProducts = [], isLoading: isTopProductsLoading } = useQuery<TopProduct[]>({
    queryKey: ["/api/analytics/top-products", { metric: metricType }]
  });

  const processedTopProducts = topProducts.map(product => ({
    ...product,
    metric: convertToNumber(product.metric),
    averagePrice: convertToNumber(product.averagePrice)
  }));

  // Aging Data Query
  const { data: agingData, isLoading: isAgingLoading } = useQuery<InventoryAging>({
    queryKey: ["/api/analytics/inventory-aging"]
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
          <div className="grid gap-4 md:flex md:flex-wrap md:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">From:</span>
              <DatePicker date={startDate} onDateChange={setStartDate} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">To:</span>
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

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="hover:shadow-md transition-shadow md:col-span-2">
              <CardHeader>
                <CardTitle>Revenue & Profit Over Time</CardTitle>
                <CardDescription>Daily revenue and profit analysis</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {isRevenueLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => format(new Date(date), 'MM/dd')}
                        className="text-muted-foreground"
                      />
                      <YAxis className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))" }}
                        formatter={(value: any) => formatCurrency(value)}
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
                        data={processedInventoryData}
                        dataKey="totalValue"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ category, percent }) =>
                          `${category}: ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {processedInventoryData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))" }}
                        formatter={(value: any) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow md:col-span-2">
              <CardHeader>
                <CardTitle>Top Products by {metricType.charAt(0).toUpperCase() + metricType.slice(1)}</CardTitle>
                <CardDescription>Performance metrics for top-selling products</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                {isTopProductsLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={processedTopProducts}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-muted-foreground" />
                      <YAxis className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))" }}
                        formatter={(value: any) =>
                          metricType === "quantity" ? value : formatCurrency(value)
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

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Inventory Aging Analysis</CardTitle>
                <CardDescription>Track inventory age and identify slow-moving items</CardDescription>
              </CardHeader>
              <CardContent>
                <InventoryAgingAnalysis
                  data={agingData}
                  isLoading={isAgingLoading}
                />
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}