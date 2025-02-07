import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatDistanceToNow } from "date-fns";

interface InventoryAging {
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
}

interface Props {
  data?: InventoryAging;
  isLoading: boolean;
}

const COLORS = [
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted))",
];

export function InventoryAgingAnalysis({ data, isLoading }: Props) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inventory Age Distribution</CardTitle>
          <CardDescription>
            Analysis of inventory value by age group
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agingSummary}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="ageGroup" className="text-muted-foreground" />
                <YAxis className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--background))" }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Bar dataKey="totalValue" name="Total Value">
                  {data.agingSummary.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slow-Moving Inventory</CardTitle>
          <CardDescription>
            Items in stock for over 60 days that may need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="w-full h-[200px]" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="text-right">Potential Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slowMovingItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="text-right text-destructive">
                      ${item.potentialLoss.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
