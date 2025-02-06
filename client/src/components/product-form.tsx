// client/src/components/product-form.tsx
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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

// Analysis Toolbar Component
const AnalysisToolbar = ({
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

  const aiAnalysis = form.watch("aiAnalysis");
  const hasAnalysis = Boolean(aiAnalysis);

  // Check eBay auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await checkEbayAuth();
      setHasEbayAuth(isAuthenticated);
    };
    checkAuth();
  }, []);

  const analyzeProductAI = async () => {
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
      const aiResult = await analyzeProduct({ name, description });
      console.log("[Product Analysis] Initial AI analysis:", aiResult);
      form.setValue("aiAnalysis", aiResult);

      // Set initial price based on AI analysis and condition discount
      if (aiResult.marketAnalysis?.priceSuggestion?.min) {
        const condition = form.getValues("condition");
        const conditionData = conditionOptions.find(opt => opt.value === condition);
        const conditionDiscount = conditionData?.discount ?? 1;
        const adjustedPrice = Math.floor(aiResult.marketAnalysis.priceSuggestion.min * conditionDiscount);
        form.setValue("price", adjustedPrice);
      }

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed with AI",
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

  const refineWithEbay = async () => {
    const name = form.getValues("name");
    const currentAnalysis = form.getValues("aiAnalysis");

    if (!name || !currentAnalysis) {
      toast({
        title: "Missing details",
        description: "Please analyze the product with AI first",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingEbay(true);
    try {
      const marketAnalysis = await getEbayMarketAnalysis(name, currentAnalysis);
      console.log("[Product Analysis] eBay market analysis:", marketAnalysis);

      // Combine the current AI analysis with the new eBay data
      const combinedAnalysis = {
        ...currentAnalysis,
        ebayData: {
          currentPrice: marketAnalysis.currentPrice,
          averagePrice: marketAnalysis.averagePrice,
          lowestPrice: marketAnalysis.lowestPrice,
          highestPrice: marketAnalysis.highestPrice,
          soldCount: marketAnalysis.soldCount,
          activeListing: marketAnalysis.activeListing,
          recommendedPrice: marketAnalysis.recommendedPrice,
          lastUpdated: new Date().toISOString()
        },
        marketAnalysis: {
          ...currentAnalysis.marketAnalysis,
          priceSuggestion: {
            min: Math.min(currentAnalysis.marketAnalysis.priceSuggestion.min, marketAnalysis.recommendedPrice * 0.9),
            max: Math.max(currentAnalysis.marketAnalysis.priceSuggestion.max, marketAnalysis.recommendedPrice * 1.1)
          }
        }
      };

      console.log("[Product Analysis] Combined analysis:", combinedAnalysis);
      form.setValue("aiAnalysis", combinedAnalysis);
      form.setValue("ebayPrice", marketAnalysis.recommendedPrice);

      // Adjust product price based on condition discount
      const condition = form.getValues("condition");
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const conditionDiscount = conditionData?.discount ?? 1;
      const adjustedPrice = Math.floor(marketAnalysis.recommendedPrice * conditionDiscount);
      form.setValue("price", adjustedPrice);

      toast({
        title: "eBay Analysis Complete",
        description: "Product details have been refined with eBay market data",
      });
    } catch (error) {
      console.error('[Product Analysis] eBay market analysis error:', error);
      if (error instanceof Error && error.message.includes('eBay authentication required')) {
        toast({
          title: "eBay Authentication Required",
          description: "Please connect your eBay account in Settings to include market data",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = "/settings/ebay-auth"}
            >
              Connect eBay
            </Button>
          ),
        });
      } else {
        toast({
          title: "eBay Market Analysis Failed",
          description: "Could not fetch eBay market data",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingEbay(false);
    }
  };

  const refinePricingWithAI = async () => {
    const currentAnalysis = form.getValues("aiAnalysis");
    const currentPrice = form.getValues("price");

    if (!currentAnalysis || !currentPrice) {
      toast({
        title: "Missing details",
        description: "Please complete the analysis steps first",
        variant: "destructive",
      });
      return;
    }

    setIsRefiningPrice(true);
    try {
      // Build the payload
      const buyPrice = form.getValues("ebayPrice") || currentPrice;
      const condition = form.getValues("condition");
      const category = form.getValues("category") || "";
      const payload: any = {
        buyPrice,
        currentPrice,
        condition,
        category,
      };
      if (product?.id) {
        payload.productId = product.id;
      }

      console.log("Refine Pricing payload:", payload);
      const response = await apiRequest("POST", "/api/generate-sale-price", payload);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      form.setValue("price", result.recommendedSalePrice);
      toast({
        title: "Price Refined",
        description: "The recommended sale price has been updated",
      });
    } catch (error) {
      console.error("Price refinement error:", error);
      toast({
        title: "Refinement Failed",
        description: "Could not refine the sale price",
        variant: "destructive",
      });
    } finally {
      setIsRefiningPrice(false);
    }
  };

  // Handle image upload
  const handleImagesUploaded = (files: File[]) => {
    setImageFiles(files);
    if (files.length > 0) {
      setShowSmartListing(true);
    }
  };

  const handleAnalysisComplete = (analysis: any) => {
    // Update form with analysis results
    form.setValue("aiAnalysis", analysis);
    if (analysis.title) {
      form.setValue("name", analysis.title);
    }
    if (analysis.description) {
      form.setValue("description", analysis.description);
    }
    if (analysis.category) {
      form.setValue("category", analysis.category);
    }
    if (analysis.marketAnalysis?.priceSuggestion?.min) {
      const condition = form.getValues("condition");
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const conditionDiscount = conditionData?.discount ?? 1;
      const adjustedPrice = Math.floor(
        analysis.marketAnalysis.priceSuggestion.min * conditionDiscount
      );
      form.setValue("price", adjustedPrice);
    }

    setShowSmartListing(false);
    toast({
      title: "Analysis Complete",
      description: "Product details have been analyzed from images"
    });
  };

  return (
    <>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <h2 className="text-2xl font-semibold tracking-tight">
            {product ? "Edit Product" : "Add New Product"}
          </h2>
          <DialogDescription>
            Enter product details and use AI analysis with eBay market data for optimal pricing.
            Required fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="p-6">
            {/* Analysis Toolbar */}
            <AnalysisToolbar
              isAnalyzing={isAnalyzing}
              isLoadingEbay={isLoadingEbay}
              isRefiningPrice={isRefiningPrice}
              hasEbayAuth={hasEbayAuth}
              form={form}
              onAnalyze={analyzeProductAI}
              onRefineWithEbay={refineWithEbay}
              onRefinePricing={refinePricingWithAI}
            />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(async (data) => {
                console.log("Submitting form with name:", data.name);

                try {
                  // Create a FormData object to handle image uploads
                  const formData = new FormData();

                  // Append text fields to FormData
                  formData.append('name', data.name.trim());
                  if (data.description) {
                    formData.append('description', data.description.trim());
                  }
                  if (data.sku) {
                    formData.append('sku', data.sku.trim());
                  }
                  if (data.brand) {
                    formData.append('brand', data.brand.trim());
                  }
                  if (data.category) {
                    formData.append('category', data.category.trim());
                  }
                  formData.append('quantity', data.quantity.toString());

                  // Handle price (ensure it's a number or null)
                  if (data.price !== undefined && data.price !== null) {
                    formData.append('price', data.price.toString());
                  }

                  // Ensure condition is appended
                  if (data.condition) {
                    formData.append('condition', data.condition);
                  }

                  // Stringify and append the AI analysis data
                  if (data.aiAnalysis) {
                    formData.append('aiAnalysis', JSON.stringify(data.aiAnalysis));
                  }

                  if (data.ebayPrice !== null && data.ebayPrice !== undefined) {
                    formData.append("ebayPrice", data.ebayPrice.toString());
                  }
                  if (data.weight !== null && data.weight !== undefined) {
                    formData.append("weight", data.weight.toString());
                  }
                  if (data.dimensions) {
                    formData.append('dimensions', data.dimensions.trim());
                  }

                  // Append image files
                  imageFiles.forEach((file) => {
                    formData.append('image', file);
                  });

                  // Determine endpoint and method based on whether we're editing or creating
                  const endpoint = product ? `/api/products/${product.id}` : "/api/products";
                  const method = product ? "PATCH" : "POST";

                  // Send the request using FormData
                  const response = await apiRequest(method, endpoint, formData);

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`${response.status}: ${JSON.stringify(errorData)}`);
                  }

                  queryClient.invalidateQueries({ queryKey: ["/api/products"] });
                  toast({
                    title: product ? "Product updated" : "Product created",
                    description: data.name.trim(),
                  });
                  onComplete();
                } catch (error) {
                  console.error('Form submission error:', error);
                  toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to save product",
                    variant: "destructive",
                  });
                }
              })} className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <FormLabel>Product Images</FormLabel>
                      <FormDescription>
                        Upload clear, high-quality images of your product
                      </FormDescription>
                    </div>
                  </div>
                  <ImageUpload onImagesUploaded={handleImagesUploaded} />
                </div>

                {!hasEbayAuth && (
                  <Alert className="mb-6">
                    <AlertDescription className="text-sm flex items-center justify-between">
                      <span>Connect your eBay account to access market pricing data</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.href = "/settings/ebay-auth"}
                        className="ml-4"
                      >
                        Connect eBay Account
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Display AI Analysis if available */}
                {hasAnalysis && (
                  <Card className="p-6 border-primary/20">
                    <div className="space-y-6">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">AI Analysis Results</h3>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium mb-2">Market Analysis</h4>
                          <div className="space-y-2">
                            <div>
                              <span className="text-sm text-muted-foreground">Demand Score</span>
                              <div className="text-2xl font-semibold">
                                {aiAnalysis.marketAnalysis.demandScore}/10
                              </div>
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Competition Level</span>
                              <div className="text-lg font-medium">
                                {aiAnalysis.marketAnalysis.competitionLevel}
                              </div>
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Suggested Price Range</span>
                              <div className="text-lg font-medium">
                                ${aiAnalysis.marketAnalysis.priceSuggestion.min.toFixed(2)} -
                                ${aiAnalysis.marketAnalysis.priceSuggestion.max.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">SEO Keywords</h4>
                          <div className="flex flex-wrap gap-2">
                            {aiAnalysis.seoKeywords.map((keyword, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-primary/10 rounded-md text-sm"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>

                          <h4 className="font-medium mt-4 mb-2">Suggestions</h4>
                          <ul className="space-y-1 text-sm">
                            {aiAnalysis.suggestions.map((suggestion, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <Info className="h-4 w-4 text-primary" />
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Display eBay Market Data if available */}
                {hasAnalysis && aiAnalysis?.ebayData && (
                  <Card className="p-6 border-primary/20">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-lg">eBay Market Data</h3>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Last updated: {new Date(aiAnalysis.ebayData.lastUpdated).toLocaleString()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <span className="text-sm text-muted-foreground">Current Market Price</span>
                            <div className="text-2xl font-semibold">
                              ${aiAnalysis.ebayData.currentPrice.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Average Price</span>
                            <div className="text-2xl font-semibold">
                              ${aiAnalysis.ebayData.averagePrice.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Price Range</span>
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-semibold">
                                ${aiAnalysis.ebayData.lowestPrice.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-xl font-semibold">
                                ${aiAnalysis.ebayData.highestPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <span className="text-sm text-muted-foreground">Items Sold</span>
                            <div className="text-2xl font-semibold">
                              {aiAnalysis.ebayData.soldCount.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Active Listings</span>
                            <div className="text-2xl font-semibold">
                              {aiAnalysis.ebayData.activeListing.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Recommended Price</span>
                            <div className="text-2xl font-semibold text-primary">
                              ${aiAnalysis.ebayData.recommendedPrice.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Form Fields */}
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
                            <Input {...field} placeholder="Enter product name" />
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
                            placeholder="Describe the product's features, specifications, and condition"
                            className="min-h-[100px]"
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            <Input type="number" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
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
              </form>
            </Form>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Add SmartListingModal */}
      {showSmartListing && (
        <SmartListingModal
          open={showSmartListing}
          onClose={() => setShowSmartListing(false)}
          imageFiles={imageFiles}
          onAnalysisComplete={handleAnalysisComplete}
        />
      )}
    </>
  );
}