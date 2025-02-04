import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type InsertProduct, type SelectProduct } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeProduct } from "@/lib/gemini";
import { getEbayPrice } from "@/lib/ebay";
import { useState } from "react";
import { Loader2, BarChart2, Tag, TrendingUp, BookMarked, PackageOpen, Sparkles, InfoIcon, Info } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import ImageUpload from "@/components/ui/image-upload";
import SmartListingModal from "@/components/smart-listing-modal";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DialogContent, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Schema update for better validation
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
  aiAnalysis: z.any().optional().nullable(),
  ebayPrice: z.coerce.number().optional().nullable(),
  weight: z.coerce.number().optional().nullable(),
  dimensions: z.string().optional().nullable(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  product?: SelectProduct;
  onComplete: () => void;
}

const conditionOptions = [
  { value: "new", label: "New" },
  { value: "open_box", label: "Open Box", discount: 0.85 },
  { value: "used_like_new", label: "Used - Like New", discount: 0.8 },
  { value: "used_good", label: "Used - Good", discount: 0.7 },
  { value: "used_fair", label: "Used - Fair", discount: 0.6 },
];

export default function ProductForm({ product, onComplete }: ProductFormProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
      quantity: product?.quantity ?? 0,
      imageUrl: product?.imageUrl ?? "",
      aiAnalysis: product?.aiAnalysis ?? null,
      ebayPrice: product?.ebayPrice ? Number(product.ebayPrice) : null,
      weight: product?.weight ? Number(product.weight) : null,
      dimensions: product?.dimensions ?? "",
    },
  });

  const aiAnalysis = form.watch("aiAnalysis");
  const currentPrice = form.watch("price") || 0;
  const condition = form.watch("condition");
  const hasAnalysis = aiAnalysis && Object.keys(aiAnalysis).length > 0;

  const conditionData = conditionOptions.find(opt => opt.value === condition);
  const conditionDiscount = conditionData?.discount ?? 1;

  const getAdjustedPriceRange = () => {
    if (!hasAnalysis) return { min: 0, max: 0 };
    const baseMin = aiAnalysis.marketAnalysis.priceSuggestion.min;
    const baseMax = aiAnalysis.marketAnalysis.priceSuggestion.max;
    return {
      min: Math.floor(baseMin * conditionDiscount),
      max: Math.ceil(baseMax * conditionDiscount),
    };
  };

  const priceRange = getAdjustedPriceRange();
  const isUnderpriced = hasAnalysis && currentPrice < priceRange.min;
  const isOverpriced = hasAnalysis && currentPrice > priceRange.max;
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced;

  const onSubmit = async (data: ProductFormData) => {
    try {
      const trimmedName = data.name.trim();

      // Add debug logging
      console.log('Submitting form with name:', trimmedName);

      if (!trimmedName) {
        form.setError("name", {
          type: "manual",
          message: "Product name cannot be empty"
        });
        return;
      }

      const formData = new FormData();

      // Add all form fields with proper trimming
      // Add name field first and ensure it's a string
      formData.append('name', String(trimmedName));

      // Rest of fields
      formData.append('description', data.description?.trim() || '');
      formData.append('sku', data.sku?.trim() || '');
      formData.append('price', data.price ? String(data.price) : '');
      formData.append('quantity', String(data.quantity));
      formData.append('condition', data.condition);
      formData.append('brand', data.brand?.trim() || '');
      formData.append('category', data.category?.trim() || '');
      formData.append('weight', data.weight ? String(data.weight) : '');
      formData.append('dimensions', data.dimensions?.trim() || '');

      // Debug log formData
      const formDataEntries = Array.from(formData.entries());
      console.log('FormData contents:', formDataEntries);

      if (data.aiAnalysis) {
        formData.append('aiAnalysis', JSON.stringify(data.aiAnalysis));
      }
      if (data.ebayPrice) {
        formData.append('ebayPrice', String(data.ebayPrice));
      }

      // Add image file if present
      if (imageFiles.length > 0) {
        formData.append('image', imageFiles[0]);
      }

      if (product) {
        await apiRequest("PATCH", `/api/products/${product.id}`, formData);
      } else {
        await apiRequest("POST", "/api/products", formData);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: product ? "Product updated" : "Product created",
        description: trimmedName,
      });
      onComplete();
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: "Failed to save product",
        variant: "destructive",
      });
    }
  };

  const handleImagesUploaded = (files: File[]) => {
    setImageFiles(files);
    if (files.length > 0) {
      setShowSmartListing(true);
    }
  };

  const handleAnalysisComplete = (analysis: any) => {
    setIsAnalyzing(false);

    // Sanitize: keep only essential fields
    const sanitizedAnalysis = {
      title: analysis?.title,
      description: analysis?.description,
      category: analysis?.category,
      marketAnalysis: {
        demandScore: analysis?.marketAnalysis?.demandScore,
        competitionLevel: analysis?.marketAnalysis?.competitionLevel,
        priceSuggestion: {
          min: analysis?.marketAnalysis?.priceSuggestion?.min,
          max: analysis?.marketAnalysis?.priceSuggestion?.max,
        }
      },
      seoKeywords: analysis?.seoKeywords?.slice(0, 5),
      suggestions: analysis?.suggestions?.slice(0, 3),
    };

    form.setValue("aiAnalysis", sanitizedAnalysis);

    // Pre-fill form fields based on sanitized AI analysis
    if (sanitizedAnalysis.title) {
      form.setValue("name", sanitizedAnalysis.title);
    }
    if (sanitizedAnalysis.description) {
      form.setValue("description", sanitizedAnalysis.description);
    }
    if (sanitizedAnalysis.category) {
      form.setValue("category", sanitizedAnalysis.category);
    }
    if (sanitizedAnalysis.marketAnalysis?.priceSuggestion?.min) {
      const condition = form.getValues("condition");
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const conditionDiscount = conditionData?.discount ?? 1;

      // Apply condition-based discount to suggested price
      const adjustedPrice = Math.floor(
        sanitizedAnalysis.marketAnalysis.priceSuggestion.min * conditionDiscount
      );
      form.setValue("price", adjustedPrice);
    }
  };

  const analyzeProductDetails = async () => {
    const name = form.getValues("name");
    const description = form.getValues("description");

    if (!name || !description) {
      toast({
        title: "Missing details",
        description: "Please provide a name and description first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const [aiAnalysis, ebayPrice] = await Promise.all([
        analyzeProduct({ name, description }),
        getEbayPrice(name),
      ]);

      form.setValue("aiAnalysis", aiAnalysis);
      if (ebayPrice) {
        form.setValue("ebayPrice", ebayPrice);
      }

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed",
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: "Could not analyze product details",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl overflow-hidden">
      <DialogHeader>
        <h2 className="text-2xl font-semibold tracking-tight">
          {product ? "Edit Product" : "Add New Product"}
        </h2>
        <DialogDescription>
          Enter product details and use AI analysis for optimal pricing. Required fields are marked with an asterisk (*).
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-[80vh]">
        <div className="p-6">
          <div className="space-y-6">
            <div>
              {/* <h2 className="text-2xl font-semibold tracking-tight">
                {product ? "Edit Product" : "Add New Product"}
              </h2> */}
              {/* <p className="text-sm text-muted-foreground">
                Enter product details and use AI analysis for optimal pricing
              </p> */}
            </div>

            <TooltipProvider>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* Images Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <FormLabel>Product Images</FormLabel>
                        <FormDescription>
                          Upload clear, high-quality images of your product
                        </FormDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={analyzeProductDetails}
                        disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Analyze Product
                      </Button>
                    </div>
                    <ImageUpload onImagesUploaded={handleImagesUploaded} />
                  </div>

                  <Separator />

                  {/* AI Analysis Section */}
                  {hasAnalysis && (
                    <Card className={cn(
                      "p-6 border-2",
                      isUnderpriced && "border-yellow-500/50",
                      isOverpriced && "border-red-500/50",
                      isPricedRight && "border-green-500/50"
                    )}>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between border-b pb-4">
                          <div className="flex items-center gap-2">
                            <BookMarked className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-lg">AI Analysis Results</h3>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-sm font-medium",
                            isUnderpriced && "bg-yellow-500/10 text-yellow-600",
                            isOverpriced && "bg-red-500/10 text-red-600",
                            isPricedRight && "bg-green-500/10 text-green-600"
                          )}>
                            {isUnderpriced ? 'Consider Increasing Price' :
                              isOverpriced ? 'Consider Reducing Price' :
                                'Optimal Price Range'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <BarChart2 className="h-4 w-4 text-primary" />
                              <h4 className="font-medium">Market Analysis</h4>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between text-sm mb-2">
                                  <span className="text-muted-foreground">Market Demand</span>
                                  <span className="font-medium">{aiAnalysis.marketAnalysis.demandScore}/100</span>
                                </div>
                                <Progress
                                  value={aiAnalysis.marketAnalysis.demandScore}
                                  className="h-2"
                                />
                              </div>

                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Competition Level</span>
                                <span className="font-medium">{aiAnalysis.marketAnalysis.competitionLevel}</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <Tag className="h-4 w-4 text-primary" />
                              <h4 className="font-medium">Price Analysis</h4>
                            </div>

                            <div className="space-y-4">
                              {/* Market Price Range */}
                              <div>
                                <span className="text-sm text-muted-foreground">Market Price Range</span>
                                <div className="flex items-baseline gap-2 mt-1">
                                  <span className="text-2xl font-semibold">${priceRange.min}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="text-2xl font-semibold">${priceRange.max}</span>
                                </div>
                              </div>

                              {/* Recommended Buy/Sell Prices */}
                              <div className="p-3 bg-secondary/20 rounded-lg space-y-3">
                                <div>
                                  <span className="text-sm font-medium">Recommended Buy Price</span>
                                  <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-xl font-semibold text-green-600">
                                      ${Math.floor(priceRange.min * 0.7)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      (30% below market min)
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  <span className="text-sm font-medium">Recommended Sell Price</span>
                                  <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-xl font-semibold text-blue-600">
                                      ${Math.ceil(priceRange.max * 1.15)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      (15% above market max)
                                    </span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-border/50">
                                  <span className="text-sm font-medium">Potential Profit Margin</span>
                                  <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-xl font-semibold text-primary">
                                      {Math.round(((priceRange.max * 1.15) /
                                        (priceRange.min * 0.7) - 1) * 100)}%
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      estimated margin
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {form.getValues("ebayPrice") && (
                                <div>
                                  <span className="text-sm text-muted-foreground">Average eBay Price</span>
                                  <div className="text-lg font-medium mt-1">
                                    ${form.getValues("ebayPrice")}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <h4 className="font-medium">Optimization Tips</h4>
                          </div>
                          <ul className="grid grid-cols-2 gap-3">
                            {aiAnalysis.suggestions.slice(0, 4).map((suggestion: string, index: number) => (
                              <li
                                key={index}
                                className="text-sm text-muted-foreground p-3 bg-secondary/20 rounded-lg"
                              >
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Basic Info Section */}
                  <div className="grid gap-6">
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
                              <Input
                                {...field}
                                placeholder="Enter product name"
                                className={cn(
                                  form.formState.errors.name && "border-destructive"
                                )}
                              />
                            </FormControl>
                            {form.formState.errors.name && (
                              <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.name.message}
                              </p>
                            )}
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
                              <Input {...field} placeholder="Enter brand name" />
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
                              value={field.value ?? ''}
                              placeholder="Describe the product's features, specifications, and condition"
                              className={cn(
                                "min-h-[100px]",
                                form.formState.errors.description && "border-destructive"
                              )}
                            />
                          </FormControl>
                          {form.formState.errors.description && (
                            <p className="text-sm text-destructive mt-1">
                              {form.formState.errors.description.message}
                            </p>
                          )}
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
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
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
                              <Input {...field} placeholder="Product category" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Inventory Details */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">Inventory Details</h3>
                      <Tooltip>
                        <TooltipTrigger>
                          <InfoIcon className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Enter pricing and inventory information</p>
                        </TooltipContent>
                      </Tooltip>
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
                                value={field.value ?? ''}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                className={cn(
                                  isUnderpriced && "border-yellow-500 focus-visible:ring-yellow-500",
                                  isOverpriced && "border-red-500 focus-visible:ring-red-500",
                                  isPricedRight && "border-green-500 focus-visible:ring-green-500",
                                  form.formState.errors.price && "border-destructive"
                                )}
                                placeholder="0.00"
                              />
                            </FormControl>
                            {form.formState.errors.price && (
                              <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.price.message}
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Quantity <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value}
                                onChange={e => field.onChange(Number(e.target.value))}
                                placeholder="0"
                                className={cn(
                                  form.formState.errors.quantity && "border-destructive"
                                )}
                              />
                            </FormControl>
                            {form.formState.errors.quantity && (
                              <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.quantity.message}
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 grid-cols-2">
                      <FormField
                        control={form.control}
                        name="sku"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              SKU
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="w-[200px] text-sm">
                                    Stock Keeping Unit - A unique identifier for your product.
                                    Useful for inventory tracking.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter SKU" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weight (lbs)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                {...field}
                                value={field.value ?? ''}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                placeholder="0.0"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="dimensions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Dimensions (L × W × H inches)
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-4 w-4 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="w-[200px] text-sm">
                                  Enter the product dimensions in inches (length x width x height).
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ''} placeholder="e.g., 12 × 8 × 4" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-between pt-6">
                    <Button type="button" variant="ghost" onClick={onComplete}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={form.formState.isSubmitting}
                      className="min-w-[120px]"
                    >
                      {form.formState.isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>{product ? "Update" : "Create"} Product</>
                      )}
                    </Button>
                  </div>

                  <SmartListingModal
                    open={showSmartListing}
                    onOpenChange={setShowSmartListing}
                    files={imageFiles}
                    onAnalysisComplete={handleAnalysisComplete}
                  />
                </form>
              </Form>
            </TooltipProvider>
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  );
}