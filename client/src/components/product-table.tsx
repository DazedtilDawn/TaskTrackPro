import { useState, useCallback } from "react";
import { type SelectProduct } from "@db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings2, Box } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ProductCard from "@/components/product-card";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { 
  formatPrice, 
  calculatePriceStatus, 
  parseAiAnalysis 
} from "@/lib/json-utils";

interface ProductTableProps {
  products: SelectProduct[];
  onEdit: (product: SelectProduct) => void;
  onDelete: (product: SelectProduct) => void;
  onToggleWatchlist: (product: SelectProduct) => void;
  inWatchlist?: boolean;
}

export function ProductTable({
  products,
  onEdit,
  onDelete,
  onToggleWatchlist,
  inWatchlist,
}: ProductTableProps) {
  const [columnVisibility, setColumnVisibility] = useState({
    name: true,
    sku: true,
    price: true,
    ebayPrice: true,
    condition: true,
    brand: true,
    category: true,
    status: true,
    imageUrl: true,
  });
  const [selectedProduct, setSelectedProduct] = useState<SelectProduct | null>(null);

  const handleRowClick = useCallback((product: SelectProduct) => {
    setSelectedProduct(product);
  }, []);

  const columns: ColumnDef<SelectProduct>[] = [
    {
      accessorKey: "imageUrl",
      header: "Image",
      cell: ({ row }) => {
        const imageUrl = row.original.imageUrl;
        const displayUrl = imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `/uploads/${imageUrl}`) : null;

        return (
          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={row.original.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = 'https://placehold.co/48';
                }}
              />
            ) : (
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center">
                <Box className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Product Name",
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate font-medium">
          {row.getValue("name")}
        </div>
      ),
    },
    {
      accessorKey: "sku",
      header: "SKU",
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => formatPrice(Number(row.getValue("price"))),
    },
    {
      accessorKey: "ebayPrice",
      header: "eBay Price",
      cell: ({ row }) => formatPrice(Number(row.getValue("ebayPrice"))),
    },
    {
      accessorKey: "condition",
      header: "Condition",
      cell: ({ row }) => (
        <span className="capitalize">
          {(row.getValue("condition") as string)?.replace(/_/g, ' ') || 'Not Specified'}
        </span>
      ),
    },
    {
      accessorKey: "brand",
      header: "Brand",
    },
    {
      accessorKey: "category",
      header: "Category",
    },
    {
      accessorKey: "status",
      header: "Market Status",
      cell: ({ row }) => {
        const product = row.original;
        const aiAnalysis = parseAiAnalysis(product.aiAnalysis);
        const currentPrice = Number(product.price) || 0;
        const { isUnderpriced, isOverpriced, isPricedRight } = calculatePriceStatus(currentPrice, aiAnalysis);

        if (!aiAnalysis) return null;

        return (
          <div
            className={cn(
              "text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 font-medium",
              isUnderpriced && "bg-yellow-500/10 text-yellow-700",
              isOverpriced && "bg-red-500/10 text-red-700",
              isPricedRight && "bg-green-500/10 text-green-700"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {isUnderpriced ? 'Underpriced' :
              isOverpriced ? 'Overpriced' :
                'Optimal Price'}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: products,
    columns,
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-t hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <ProductCard
              product={selectedProduct}
              onEdit={onEdit}
              inWatchlist={inWatchlist}
              view="list"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}