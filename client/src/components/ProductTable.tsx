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
import { useLocalStorage } from "@/hooks/use-local-storage"
import { cn } from "@/lib/utils"

interface Product {
  id: number
  name: string
  description: string | null
  sku: string | null
  price: string | null
  quantity: number
  condition: string
  brand: string | null
  category: string | null
  image_url: string | null
  sold: boolean
}

interface ProductTableProps {
  products: Product[]
}

export function ProductTable({ products }: ProductTableProps) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(
    "product-table-columns",
    {}
  )

  // Define columns
  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <div className="min-w-[180px]">{row.getValue("name")}</div>,
    },
    {
      accessorKey: "sku",
      header: "SKU",
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
      accessorKey: "quantity",
      header: "Quantity",
    },
    {
      accessorKey: "condition",
      header: "Condition",
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

  return (
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
                className="border-b transition-colors hover:bg-muted/50"
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
  )
}