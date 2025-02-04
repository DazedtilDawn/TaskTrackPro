import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { type SelectOrder, type SelectProduct } from "@db/schema";
import { Loader2 } from "lucide-react";

interface OrderWithItems extends SelectOrder {
  items?: Array<{
    product: SelectProduct;
    quantity: number;
    price: number;
  }>;
}

export default function Orders() {
  const { data: orders, isLoading, error } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders"],
    retry: 1,
    onError: (err) => {
      console.error("Error fetching orders:", err);
    },
    onSuccess: (data) => {
      console.log("Orders data received:", data);
    }
  });

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    return format(new Date(date), "MMM d, yyyy");
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
              <CardDescription>
                Manage and track your orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center text-destructive py-8">
                  <p>Error loading orders</p>
                  <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
                </div>
              ) : orders?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.id}</TableCell>
                        <TableCell>
                          {formatDate(order.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === "completed"
                                ? "default"
                                : order.status === "pending"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {order.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {order.items ? `${order.items.length} items` : '1 item'}
                        </TableCell>
                        <TableCell className="text-right">
                          ${Number(order.total || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>No orders found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}