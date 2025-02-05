// client/src/components/product-form.tsx
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type InsertProduct, type SelectProduct } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeProduct } from "@/lib/gemini";
import { getEbayMarketAnalysis, checkEbayAuth } from "@/lib/ebay";
import {
  Loader2, BarChart2, BookMarked, PackageOpen,
  Sparkles, Info, TrendingUp, DollarSign
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// Product form schema
const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(10, "Description must be at least 10 characters").optional().nullable(),
  sku: z.string().optional().nullable(),
  condition: z.enum(["new", "open_box", "used_like_new", "used_good", "used_fair"]).default("used_good"),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be greater than 0").optional().nullable(),
  buyPrice: z.coerce.number().min(0, "Buy price must be greater than 0").optional().nullable(),
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
  { value: "new", label: "New", discount: 1 },
  { value: "open_box", label: "Open Box", discount: 0.85 },
  { value: "used_like_new", label: "Used - Like New", discount: 0.8 },
  { value: "used_good", label: "Used - Good", discount: 0.7 },
  { value: "used_fair", label: "Used - Fair", discount: 0.6 },
];

export default function ProductForm({ product, onComplete, isWatchlistItem = false }: ProductFormProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingEbay, setIsLoadingEbay] = useState(false);
  const [isRefiningPrice, setIsRefiningPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasEbayAuth, setHasEbayAuth] = useState<boolean | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [showSmartListing, setShowSmartListing] = useState(false);
  const [fullAnalysis, setFullAnalysis] = useState(false);

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
      buyPrice: null,
      quantity: isWatchlistItem ? 0 : (product?.quantity ?? 0),
      imageUrl: product?.imageUrl ?? "",
      aiAnalysis: product?.aiAnalysis ?? null,
      ebayPrice: product?.ebayPrice ? Number(product.ebayPrice) : null,
      weight: product?.weight ? Number(product.weight) : null,
      dimensions: product?.dimensions ?? "",
    },
  });

  // Watch buy price and condition to auto-generate recommended price
  const buyPrice = form.watch("buyPrice");
  const condition = form.watch("condition");

  // Check eBay auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await checkEbayAuth();
      setHasEbayAuth(isAuthenticated);
    };
    checkAuth();
  }, []);

  // Auto-generate recommended price when buy price changes
  useEffect(() => {
    if (buyPrice && buyPrice > 0) {
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const baseMarkup = 1.4; // 40% markup
      // For used items, we want to apply a higher markup to account for the condition discount
      const adjustedMarkup = condition !== 'new' ? baseMarkup / (conditionData?.discount || 1) : baseMarkup;
      const recommendedPrice = Math.ceil(buyPrice * adjustedMarkup);
      form.setValue("price", recommendedPrice);
    }
  }, [buyPrice, condition, form]);

  // Update price when eBay data changes
  useEffect(() => {
    const ebayData = form.getValues("aiAnalysis.ebayData");
    if (ebayData?.recommendedPrice) {
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const adjustedPrice = Math.floor(ebayData.recommendedPrice * (conditionData?.discount || 1));
      // Ensure the price is at least 20% higher than buy price
      const minPrice = buyPrice ? Math.ceil(buyPrice * 1.2) : adjustedPrice;
      form.setValue("price", Math.max(adjustedPrice, minPrice));
    }
  }, [condition, buyPrice, form]);

  const handleAnalyze = async () => {
    const name = form.getValues("name");
    const description = form.getValues("description");

    if (!name || !description) {
      form.setError("name", { message: "Product name is required" });
      form.setError("description", { message: "Description is required" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const aiResult = await analyzeProduct({ name, description });
      console.log("[Product Analysis] Initial AI analysis:", aiResult);
      form.setValue("aiAnalysis", aiResult);

      // Set initial price based on AI analysis and condition discount
      if (aiResult.marketAnalysis?.priceSuggestion?.min) {
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

  const handleRefineWithEbay = async () => {
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

      form.setValue("aiAnalysis", combinedAnalysis);
      form.setValue("ebayPrice", marketAnalysis.recommendedPrice);

      // Adjust product price based on condition discount
      const conditionData = conditionOptions.find(opt => opt.value === condition);
      const conditionDiscount = conditionData?.discount ?? 1;
      const adjustedPrice = Math.floor(marketAnalysis.recommendedPrice * conditionDiscount);
      // Ensure the price is at least 20% higher than buy price
      const minPrice = buyPrice ? Math.ceil(buyPrice * 1.2) : adjustedPrice;
      form.setValue("price", Math.max(adjustedPrice, minPrice));

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

  const handleRefinePricing = async () => {
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

  const handleImagesUploaded = (files: File[]) => {
    setImageFiles(files);
    if (files.length > 0) {
      setShowSmartListing(true);
    }
  };

  const runFullAnalysis = async () => {
    try {
      await handleAnalyze();
      if (hasEbayAuth) {
        await handleRefineWithEbay();
        await handleRefinePricing();
      }
      toast({
        title: "Full Analysis Complete",
        description: "All analysis steps have been completed successfully",
      });
    } catch (error) {
      console.error('Full analysis chain failed:', error);
      toast({
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "An error occurred during analysis",
        variant: "destructive",
      });
    }
  };

  const handleAnalysisComplete = async (analysis: any) => {
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

    // If full analysis is enabled and we have eBay auth, continue with the chain
    if (fullAnalysis && hasEbayAuth) {
      await runFullAnalysis();
    }
  };


  return (
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(async (data) => {
              try {
                setIsSubmitting(true);
                const formData = new FormData();

                // Add all form fields to FormData
                Object.entries(data).forEach(([key, value]) => {
                  if (key === 'aiAnalysis' && value) {
                    formData.append(key, JSON.stringify(value));
                  } else if (value !== null && value !== undefined) {
                    formData.append(key, value.toString());
                  }
                });

                // Add isWatchlistItem flag
                formData.append('isWatchlistItem', isWatchlistItem ? 'true' : 'false');

                // Add image file if present
                if (imageFiles.length > 0) {
                  formData.append('image', imageFiles[0]);
                }

                // Submit the form data
                const endpoint = product ? `/api/products/${product.id}` : "/api/products";
                const method = product ? "PATCH" : "POST";

                const response = await fetch(endpoint, {
                  method,
                  body: formData,
                  credentials: 'include'
                });

                if (!response.ok) {
                  throw new Error(`Failed to save product: ${response.statusText}`);
                }

                // Invalidate both products and watchlist queries to ensure UI updates
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
                  queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] })
                ]);

                toast({
                  title: product ? "Product updated" : "Product created",
                  description: data.name.trim(),
                });
                onComplete();
              } catch (error) {
                console.error('Form submission error:', error);
                toast({
                  title: "Error",
                  description: "Failed to save product",
                  variant: "destructive",
                });
              } finally {
                setIsSubmitting(false);
              }
            })} className="space-y-8">
              <div className="space-y-6">
                {/* Image Upload Section */}
                <Card className="p-6">
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
                </Card>

                {/* Basic Information Section */}
                <Card className="p-6">
                  <h3 className="font-medium text-lg mb-4">Basic Information</h3>
                  <div className="space-y-4">
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
                            <FormMessage />
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
                            <FormMessage />
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
                          <FormDescription>
                            Include details about features, specifications, and any notable characteristics
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>

                {/* Pricing Section */}
                <Card className="p-6">
                  <h3 className="font-medium text-lg mb-4">Pricing & Condition</h3>
                  <div className="space-y-4">
                    <div className="grid gap-4 grid-cols-2">
                      <FormField
                        control={form.control}
                        name="buyPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Buy Price</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  className="pl-9"
                                  placeholder="0.00"
                                  value={field.value ?? ''}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Enter your purchase price to calculate recommended selling price
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Sell Price <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  className="pl-9"
                                  placeholder="0.00"
                                  value={field.value ?? ''}
                                />
                              </div>
                            </FormControl>
                            {buyPrice && (
                              <FormDescription>
                                Recommended based on buy price and condition
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

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
                            <FormDescription>
                              Affects the recommended selling price calculation
                            </FormDescription>
                            <FormMessage />
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </Card>

                {/* Additional Details Section */}
                <Card className="p-6">
                  <h3 className="font-medium text-lg mb-4">Additional Details</h3>
                  <div className="space-y-4">
                    <div className="grid gap-4 grid-cols-2">
                      <FormField
                        control={form.control}
                        name="sku"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SKU</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Product SKU" value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 grid-cols-2">
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
                                placeholder="0.0"
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dimensions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dimensions</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="L x W x H (inches)"
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </Card>

                {/* AI Analysis Section */}
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={fullAnalysis ? runFullAnalysis : handleAnalyze}
                      disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
                      className="gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {fullAnalysis ? "Run Full Analysis" : "Analyze Product"}
                        </>
                      )}
                    </Button>

                    {hasEbayAuth && !fullAnalysis && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRefineWithEbay}
                        disabled={isLoadingEbay || !form.getValues("aiAnalysis")}
                        className="gap-2"
                      >
                        {isLoadingEbay ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <BarChart2 className="mr-2 h-4 w-4" />
                            Refine with eBay
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={fullAnalysis}
                      onCheckedChange={setFullAnalysis}
                      id="full-analysis"
                    />
                    <Label htmlFor="full-analysis" className="text-sm">
                      Full Analysis Mode
                    </Label>
                  </div>
                </div>

                {/* Display AI Analysis Results */}
                {form.watch("aiAnalysis") && (
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
                            {form.watch("aiAnalysis.marketAnalysis.demandScore") && (
                              <div>
                                <span className="text-sm text-muted-foreground">Demand Score</span>
                                <div className="text-2xl font-semibold">
                                  {form.watch("aiAnalysis.marketAnalysis.demandScore")}/10
                                </div>
                              </div>
                            )}
                            {form.watch("aiAnalysis.marketAnalysis.competitionLevel") && (
                              <div>
                                <span className="text-sm text-muted-foreground">Competition Level</span>
                                <div className="text-lg font-medium">
                                  {form.watch("aiAnalysis.marketAnalysis.competitionLevel")}
                                </div>
                              </div>
                            )}
                            {form.watch("aiAnalysis.marketAnalysis.priceSuggestion") && (
                              <div>
                                <span className="text-sm text-muted-foreground">Suggested Price Range</span>
                                <div className="text-lg font-medium">
                                  ${form.watch("aiAnalysis.marketAnalysis.priceSuggestion.min").toFixed(2)} -
                                  ${form.watch("aiAnalysis.marketAnalysis.priceSuggestion.max").toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          {form.watch("aiAnalysis.seoKeywords") && (
                            <>
                              <h4 className="font-medium mb-2">SEO Keywords</h4>
                              <div className="flex flex-wrap gap-2">
                                {form.watch("aiAnalysis.seoKeywords").map((keyword: string, index: number) => (
                                  <span
                                    key={index}
                                    className="px-2 py-1 bg-primary/10 rounded-md text-sm"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {form.watch("aiAnalysis.suggestions") && (
                            <>
                              <h4 className="font-medium mt-4 mb-2">Suggestions</h4>
                              <ul className="space-y-1 text-sm">
                                {form.watch("aiAnalysis.suggestions").map((suggestion: string, index: number) => (
                                  <li key={index} className="flex items-center gap-2">
                                    <Info className="h-4 w-4 text-primary" />
                                    {suggestion}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Display eBay Market Data if available */}
                {form.watch("aiAnalysis.ebayData") && (
                  <Card className="p-6 border-primary/20">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-lg">eBay Market Data</h3>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Last updated: {new Date(form.watch("aiAnalysis.ebayData.lastUpdated") || '').toLocaleString()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <span className="text-sm text-muted-foreground">Current Market Price</span>
                            <div className="text-2xl font-semibold">
                              ${form.watch("aiAnalysis.ebayData.currentPrice").toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Average Price</span>
                            <div className="text-2xl font-semibold">
                              ${form.watch("aiAnalysis.ebayData.averagePrice").toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Price Range</span>
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-medium">
                                ${form.watch("aiAnalysis.ebayData.lowestPrice").toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">to</span>
                              <span className="text-lg font-medium">
                                ${form.watch("aiAnalysis.ebayData.highestPrice").toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <span className="text-sm text-muted-foreground">Recommended Price</span>
                            <div className="text-2xl font-semibold text-primary">
                              ${form.watch("aiAnalysis.ebayData.recommendedPrice").toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Market Activity</span>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span>Sold Items</span>
                                <span className="font-medium">{form.watch("aiAnalysis.ebayData.soldCount")}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Active Listings</span>
                                <span className="font-medium">{form.watch("aiAnalysis.ebayData.activeListing")}</span>
                              </div>
                            </div>
                          </div>
                          {!fullAnalysis && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRefinePricing}
                              disabled={isRefiningPrice}
                              className="w-full mt-2"
                            >
                              {isRefiningPrice ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Refining...
                                </>
                              ) : (
                                <>
                                  <TrendingUp className="h-4 w-4 mr-2" />
                                  Refine Pricing
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              <div className="flex justify-between pt-6">
                <Button type="button" variant="ghost" onClick={onComplete}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[120px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>{product ? "Update" : "Create"} Product</>
                  )}
                </Button>
              </div>
            </form>
          </Form>

          {showSmartListing && (
            <SmartListingModal
              open={showSmartListing}
              onClose={() => setShowSmartListing(false)}
              imageFiles={imageFiles}
              onAnalysisComplete={handleAnalysisComplete}
            />
          )}
        </div>
      </ScrollArea>
    </DialogContent>
  );
}