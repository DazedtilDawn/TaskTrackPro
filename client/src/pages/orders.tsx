import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import {
  useQuery,
  useMutation,
} from "@tanstack/react-query";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { type SelectOrder, type SelectProduct } from "@db/schema";
import { Loader2, ChevronDown, ChevronUp, Trash2, Package, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderWithItems extends SelectOrder {
  items: Array<{
    product: SelectProduct;
    quantity: number;
    price: number;
  }>;
}

export default function Orders() {
  const { toast } = useToast();
  const [expandedOrders, setExpandedOrders] = useState<number[]>([]);

  const { data: orders = [], isLoading, error } = useQuery<OrderWithItems[], Error>({
    queryKey: ["/api/orders"],
    retry: 1,
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await apiRequest("DELETE", `/api/orders/${orderId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order deleted",
        description: "The order has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      });
    },
  });

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
  };

  const toggleOrderExpansion = (orderId: number) => {
    setExpandedOrders(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const formatPrice = (price: number | string | null) => {
    if (!price) return '$0.00';
    return `$${Number(price).toFixed(2)}`;
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>
                    View and manage your orders
                  </CardDescription>
                </div>
                {orders.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center text-destructive py-8">
                  <p>Error loading orders</p>
                  <p className="text-sm text-muted-foreground">{error.message}</p>
                </div>
              ) : orders.length ? (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className={cn(
                        "border rounded-lg transition-all duration-200",
                        expandedOrders.includes(order.id) && "border-primary/50"
                      )}
                    >
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded-lg"
                        onClick={() => toggleOrderExpansion(order.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="font-medium">#{order.id}</div>
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
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(order.createdAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-4 w-4" />
                              {formatPrice(order.total)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Order</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete order #{order.id}? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteOrderMutation.mutate(order.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            {expandedOrders.includes(order.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {expandedOrders.includes(order.id) && (
                        <div className="p-4 pt-0">
                          <div className="border-t mt-4 pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Product</TableHead>
                                  <TableHead>Quantity</TableHead>
                                  <TableHead className="text-right">Price</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.items.map((item, index) => (
                                  <TableRow key={`${order.id}-${index}`}>
                                    <TableCell className="font-medium">
                                      {item.product.name}
                                    </TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell className="text-right">
                                      {formatPrice(item.price)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={2} className="text-right font-medium">
                                    Total
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatPrice(order.total)}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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