import { useState } from "react"
import {
  ColumnDef,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useLocalStorage } from "../hooks/use-local-storage"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { SlidersHorizontal, ImageIcon } from "lucide-react"
import { format } from "date-fns"
import ProductCard from "./product-card"

interface Product {
  id: number
  name: string
  description: string | null
  sku: string | null
  price: string | null
  ebayPrice: string | null
  quantity: number
  condition: string
  brand: string | null
  category: string | null
  imageUrl: string | null
  sold: boolean
  createdAt: string
}

interface ProductTableProps {
  products: Product[]
}

export function ProductTable({ products }: ProductTableProps) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(
    "product-table-columns",
    {
      image: true,
      name: true,
      sku: true,
      price: true,
      ebayPrice: true,
      quantity: true,
      condition: true,
      brand: true,
      category: true,
      sold: true,
      createdAt: true,
    }
  )

  // Dialog state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const getImageUrl = (url: string | null | undefined): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/uploads/')) {
      return url;
    }
    return `/uploads/${url.replace(/^\/+/, '')}`;
  };

  // Define columns
  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: "imageUrl",
      header: "Image",
      cell: ({ row }) => {
        const imageUrl = getImageUrl(row.getValue("imageUrl"));
        return (
          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-secondary/20">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`Image of ${row.getValue("name")}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <div className="min-w-[180px]">{row.getValue("name")}</div>,
    },
    {
      accessorKey: "sku",
      header: "SKU",
      cell: ({ row }) => row.getValue("sku") || "-",
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => {
        const price = row.getValue<string | null>("price")
        const numPrice = price ? parseFloat(price) : null
        return numPrice ? `$${numPrice.toFixed(2)}` : "-"
      },
    },
    {
      accessorKey: "ebayPrice",
      header: "eBay Price",
      cell: ({ row }) => {
        const price = row.getValue<string | null>("ebayPrice")
        const numPrice = price ? parseFloat(price) : null
        return numPrice ? `$${numPrice.toFixed(2)}` : "-"
      },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
    },
    {
      accessorKey: "condition",
      header: "Condition",
      cell: ({ row }) => (
        <span className="capitalize">
          {(row.getValue<string>("condition") || "").replace(/_/g, " ")}
        </span>
      ),
    },
    {
      accessorKey: "brand",
      header: "Brand",
      cell: ({ row }) => row.getValue("brand") || "-",
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.getValue("category") || "-",
    },
    {
      accessorKey: "sold",
      header: "Status",
      cell: ({ row }) => (
        <div className={cn(
          "font-medium",
          row.getValue("sold") ? "text-red-500" : "text-green-500"
        )}>
          {row.getValue("sold") ? "Sold" : "Available"}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date Added",
      cell: ({ row }) => {
        const date = row.getValue<string>("createdAt")
        return date ? format(new Date(date), "MMM d, yyyy") : "-"
      },
    },
  ]

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleRowClick = (product: Product) => {
    setSelectedProduct(product)
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 border-dashed">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            {table.getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          {...{
                            className: header.column.getCanSort()
                              ? "cursor-pointer select-none"
                              : "",
                            onClick: header.column.getToggleSortingHandler(),
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl">
          {selectedProduct && (
            <ProductCard
              product={selectedProduct}
              onEdit={() => {}} // We'll handle edit through the parent component
              view="grid"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}