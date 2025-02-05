// client/src/components/product-form.tsx
import { useState, useEffect } from "react";
import { useForm, UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type InsertProduct, type SelectProduct } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeProduct } from "@/lib/gemini";
import { getEbayMarketAnalysis, checkEbayAuth } from "@/lib/ebay";
import { Loader2, BarChart2, BookMarked, PackageOpen, Sparkles, Info, TrendingUp } from "lucide-react";
import { DialogContent, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ImageUpload from "@/components/ui/image-upload";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import SmartListingModal from "@/components/smart-listing-modal";

// Product form schema
const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(10, "Description must be at least 10 characters").optional().nullable(),
  sku: z.string().optional().nullable(),
  condition: z.enum(["new", "open_box", "used_like_new", "used_good", "used_fair"]).default("used_good"),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be greater than 0").optional().nullable(),
  quantity: z.coerce.number().min(0, "Quantity must be 0 or greater").default(0),
  imageUrl: z.string().optional().nullable(),
  aiAnalysis: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    marketAnalysis: z.object({
      demandScore: z.number(),
      competitionLevel: z.string(),
      priceSuggestion: z.object({
        min: z.number(),
        max: z.number()
      })
    }),
    seoKeywords: z.array(z.string()),
    suggestions: z.array(z.string()),
    ebayData: z.object({
      currentPrice: z.number(),
      averagePrice: z.number(),
      lowestPrice: z.number(),
      highestPrice: z.number(),
      soldCount: z.number(),
      activeListing: z.number(),
      recommendedPrice: z.number(),
      lastUpdated: z.string().optional()
    }).optional()
  }).optional().nullable(),
  ebayPrice: z.coerce.number().optional().nullable(),
  weight: z.coerce.number().optional().nullable(),
  dimensions: z.string().optional().nullable(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  product?: SelectProduct;
  onComplete: () => void;
  isWatchlistItem?: boolean;
}

const conditionOptions = [
  { value: "new", label: "New" },
  { value: "open_box", label: "Open Box", discount: 0.85 },
  { value: "used_like_new", label: "Used - Like New", discount: 0.8 },
  { value: "used_good", label: "Used - Good", discount: 0.7 },
  { value: "used_fair", label: "Used - Fair", discount: 0.6 },
];

// Interface for AnalysisToolbar
interface AnalysisToolbarProps {
  isAnalyzing: boolean;
  isLoadingEbay: boolean;
  isRefiningPrice: boolean;
  hasEbayAuth: boolean | null;
  form: UseFormReturn<ProductFormData>;
  onAnalyze: () => void;
  onRefineWithEbay: () => void;
  onRefinePricing: () => void;
}

export default function ProductForm({ product, onComplete, isWatchlistItem = false }: ProductFormProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingEbay, setIsLoadingEbay] = useState(false);
  const [isRefiningPrice, setIsRefiningPrice] = useState(false);
  const [hasEbayAuth, setHasEbayAuth] = useState<boolean | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [showSmartListing, setShowSmartListing] = useState(false);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      sku: product?.sku ?? "",
      condition: (product?.condition as any) ?? "used_good",
      brand: product?.brand ?? "",
      category: product?.category ?? "",
      price: product?.price ? Number(product.price) : null,
      quantity: isWatchlistItem ? 0 : (product?.quantity ?? 0),
      imageUrl: product?.imageUrl ?? "",
      aiAnalysis: product?.aiAnalysis ?? null,
      ebayPrice: product?.ebayPrice ? Number(product.ebayPrice) : null,
      weight: product?.weight ? Number(product.weight) : null,
      dimensions: product?.dimensions ?? "",
    },
  });

  return (
    <div className="space-y-4">
      {/* Form Fields */}
      <div className="grid gap-4 grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Product Name <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter product name" value={field.value ?? ''} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="brand"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter brand name" value={field.value ?? ''} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Description <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Describe the product's features, specifications, and condition"
                className="min-h-[100px]"
                value={field.value ?? ''}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <div className="grid gap-4 grid-cols-2">
        <FormField
          control={form.control}
          name="condition"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condition</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? 'used_good'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {conditionOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <PackageOpen className="h-4 w-4" />
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Product category" value={field.value ?? ''} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      <div className="grid gap-4 grid-cols-2">
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Price <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  {...field}
                  placeholder="0.00"
                  value={field.value ?? ''}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input type="number" {...field} value={field.value ?? ''} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
      {/* Analysis Toolbar Component */}
      <AnalysisToolbar
        isAnalyzing={isAnalyzing}
        isLoadingEbay={isLoadingEbay}
        isRefiningPrice={isRefiningPrice}
        hasEbayAuth={hasEbayAuth}
        form={form}
        onAnalyze={handleAnalyze}
        onRefineWithEbay={handleRefineWithEbay}
        onRefinePricing={handleRefinePricing}
      />

    </div>
  );
}


// First, add proper interface for AnalysisToolbar
interface AnalysisToolbarProps {
  isAnalyzing: boolean;
  isLoadingEbay: boolean;
  isRefiningPrice: boolean;
  hasEbayAuth: boolean | null;
  form: UseFormReturn<ProductFormData>;
  onAnalyze: () => void;
  onRefineWithEbay: () => void;
  onRefinePricing: () => void;
}

// Add proper type for the form
const AnalysisToolbar: React.FC<AnalysisToolbarProps> = ({
  isAnalyzing,
  isLoadingEbay,
  isRefiningPrice,
  hasEbayAuth,
  form,
  onAnalyze,
  onRefineWithEbay,
  onRefinePricing,
}) => (
  <div className="flex flex-wrap gap-2 items-center mb-4">
    <Button
      type="button"
      variant="outline"
      onClick={onAnalyze}
      disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
      className="gap-2"
    >
      {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Analyze Product
    </Button>

    {hasEbayAuth && (
      <Button
        type="button"
        variant="outline"
        onClick={onRefineWithEbay}
        disabled={isLoadingEbay || !form.getValues("aiAnalysis")}
        className="gap-2"
      >
        {isLoadingEbay ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
        Refine with eBay
      </Button>
    )}

    {form.getValues("aiAnalysis")?.ebayData && (
      <Button
        type="button"
        variant="outline"
        onClick={onRefinePricing}
        disabled={isRefiningPrice}
        className="gap-2"
      >
        {isRefiningPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
        Refine Pricing
      </Button>
    )}
  </div>
);

// Define interface for eBay data
interface EbayData {
  currentPrice: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  soldCount: number;
  activeListing: number;
  recommendedPrice: number;
  lastUpdated?: string;
}