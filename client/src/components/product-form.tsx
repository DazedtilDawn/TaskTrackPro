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
import { Loader2, BarChart2, Tag, TrendingUp, BookMarked, PackageOpen, Sparkles, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Add EbayData interface after ProductFormData
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

// Update aiAnalysis in productFormSchema
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

export default function ProductForm({ product, onComplete, isWatchlistItem = false }: ProductFormProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingEbay, setIsLoadingEbay] = useState(false);
  const [includeEbayData, setIncludeEbayData] = useState(true);
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
      console.log('Submitting form with name:', trimmedName);

      if (!trimmedName) {
        form.setError("name", {
          type: "manual",
          message: "Product name is required"
        });
        return;
      }

      if (isWatchlistItem) {
        // Create a new product first if no existing product is selected
        if (!product) {
          // First create the product
          const formData = new FormData();
          formData.append('name', trimmedName);
          formData.append('description', data.description?.trim() || '');
          const sku = data.sku?.trim();
          if (sku) {
            formData.append('sku', sku);
          }
          formData.append('price', data.price ? String(data.price) : '');
          formData.append('quantity', '0'); // Watchlist items have 0 quantity
          formData.append('condition', data.condition);
          formData.append('brand', data.brand?.trim() || '');
          formData.append('category', data.category?.trim() || '');

          if (data.aiAnalysis) {
            formData.append('aiAnalysis', JSON.stringify(data.aiAnalysis));
          }
          if (data.ebayPrice) {
            formData.append('ebayPrice', String(data.ebayPrice));
          }
          if (imageFiles.length > 0) {
            formData.append('image', imageFiles[0]);
          }

          const response = await apiRequest("POST", "/api/products", formData);
          const newProduct = await response.json();

          // Then add to watchlist using the new product's ID
          await apiRequest("POST", "/api/watchlist", {
            productId: newProduct.id
          }, { headers: { 'Content-Type': 'application/json' } });
        } else {
          // Add existing product to watchlist
          await apiRequest("POST", "/api/watchlist", {
            productId: product.id
          }, { headers: { 'Content-Type': 'application/json' } });
        }

        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
        toast({
          title: "Product added to watchlist",
          description: trimmedName,
        });
      } else {
        const formData = new FormData();
        formData.append('name', trimmedName);
        formData.append('description', data.description?.trim() || '');
        // Only append SKU if it's not empty after trimming
        const sku = data.sku?.trim();
        if (sku) {
          formData.append('sku', sku);
        }
        formData.append('price', data.price ? String(data.price) : '');
        formData.append('quantity', String(data.quantity));
        formData.append('condition', data.condition);
        formData.append('brand', data.brand?.trim() || '');
        formData.append('category', data.category?.trim() || '');

        if (data.aiAnalysis) {
          formData.append('aiAnalysis', JSON.stringify(data.aiAnalysis));
        }
        if (data.ebayPrice) {
          formData.append('ebayPrice', String(data.ebayPrice));
        }
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
      }

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
      // First get AI analysis
      const aiAnalysis = await analyzeProduct({ name, description });
      console.log("[Product Analysis] Initial AI analysis:", aiAnalysis);

      // Then get eBay market data if enabled and authenticated
      let marketAnalysis = null;
      if (includeEbayData && hasEbayAuth) {
        try {
          setIsLoadingEbay(true);
          marketAnalysis = await getEbayMarketAnalysis(name, aiAnalysis);
          console.log("[Product Analysis] eBay market analysis:", marketAnalysis);

          // Combine AI and eBay analysis
          const combinedAnalysis = {
            ...aiAnalysis,
            ebayData: marketAnalysis,
            marketAnalysis: {
              ...aiAnalysis.marketAnalysis,
              priceSuggestion: {
                min: Math.min(aiAnalysis.marketAnalysis.priceSuggestion.min, marketAnalysis.recommendedPrice * 0.9),
                max: Math.max(aiAnalysis.marketAnalysis.priceSuggestion.max, marketAnalysis.recommendedPrice * 1.1)
              }
            }
          };

          form.setValue("aiAnalysis", combinedAnalysis);
          form.setValue("ebayPrice", marketAnalysis.recommendedPrice);

          // Set optimal price based on condition and market data
          const condition = form.getValues("condition");
          const conditionData = conditionOptions.find(opt => opt.value === condition);
          const conditionDiscount = conditionData?.discount ?? 1;

          const adjustedPrice = Math.floor(
            marketAnalysis.aiSuggestedPrice! * conditionDiscount
          );
          form.setValue("price", adjustedPrice);
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
              description: "Could not fetch eBay market data. Using AI analysis only.",
              variant: "destructive",
            });
          }
          // Continue with just AI analysis
          form.setValue("aiAnalysis", aiAnalysis);
        } finally {
          setIsLoadingEbay(false);
        }
      } else {
        // If eBay data not included, just use AI analysis
        form.setValue("aiAnalysis", aiAnalysis);
      }

      toast({
        title: "Analysis complete",
        description: marketAnalysis
          ? "Product details have been analyzed with eBay market data"
          : "Product details have been analyzed",
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

  useEffect(() => {
    // Check eBay auth status when component mounts
    const checkAuth = async () => {
      const isAuthenticated = await checkEbayAuth();
      setHasEbayAuth(isAuthenticated);
      setIncludeEbayData(isAuthenticated); // Only enable by default if authenticated
    };
    checkAuth();
  }, []);

  const handleSmartListingClose = () => {
    setShowSmartListing(false);
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
          <div className="space-y-6">
            <TooltipProvider>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <FormLabel>Product Images</FormLabel>
                        <FormDescription>
                          Upload clear, high-quality images of your product
                        </FormDescription>
                      </div>
                      <div className="space-y-2">
                        {hasEbayAuth !== null && (
                          <div className="flex items-center space-x-2 mb-2">
                            <Switch
                              checked={includeEbayData}
                              onCheckedChange={setIncludeEbayData}
                              disabled={!hasEbayAuth}
                            />
                            <Label className="cursor-pointer">
                              Include eBay Market Data
                            </Label>
                          </div>
                        )}
                        {!hasEbayAuth && (
                          <Alert className="py-2">
                            <AlertDescription className="text-sm">
                              Connect your eBay account to access market pricing data.{' '}
                              <a href="/settings/ebay-auth" className="font-medium underline">
                                Connect Now
                              </a>
                            </AlertDescription>
                          </Alert>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={analyzeProductDetails}
                          disabled={isAnalyzing || isLoadingEbay || !form.getValues("name") || !form.getValues("description")}
                        >
                          {isAnalyzing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isLoadingEbay ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Checking eBay
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Analyze Product
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <ImageUpload onImagesUploaded={handleImagesUploaded} />
                  </div>

                  <Separator />

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
                              <div>
                                <span className="text-sm text-muted-foreground">Market Price Range</span>
                                <div className="flex items-baseline gap-2 mt-1">
                                  <span className="text-2xl font-semibold">${priceRange.min}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="text-2xl font-semibold">${priceRange.max}</span>
                                </div>
                              </div>

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

                              {aiAnalysis.ebayData && (
                                <div className="mt-6 space-y-3 pt-4 border-t">
                                  <div className="flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-primary" />
                                    <h4 className="font-medium">eBay Market Data</h4>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <div>
                                        <div className="text-sm text-muted-foreground">Current Price</div>
                                        <div className="text-lg font-semibold">
                                          ${aiAnalysis.ebayData.currentPrice.toFixed(2)}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-sm text-muted-foreground">Average Price</div>
                                        <div className="text-lg font-semibold">
                                          ${aiAnalysis.ebayData.averagePrice.toFixed(2)}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-sm text-muted-foreground">Price Range</div>
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-lg font-semibold">
                                            ${aiAnalysis.ebayData.lowestPrice.toFixed(2)}
                                          </span>
                                          <span className="text-muted-foreground">-</span>
                                          <span className="text-lg font-semibold">
                                            ${aiAnalysis.ebayData.highestPrice.toFixed(2)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <div>
                                        <div className="text-sm text-muted-foreground">Items Sold</div>
                                        <div className="text-lg font-semibold">
                                          {aiAnalysis.ebayData.soldCount.toLocaleString()}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-sm text-muted-foreground">Active Listings</div>
                                        <div className="text-lg font-semibold">
                                          {aiAnalysis.ebayData.activeListing.toLocaleString()}
                                        </div>
                                      </div>
                                      {aiAnalysis.ebayData.lastUpdated && (
                                        <div>
                                          <div className="text-sm text-muted-foreground">Last Updated</div>
                                          <div className="text-sm">
                                            {new Date(aiAnalysis.ebayData.lastUpdated).toLocaleString()}
                                          </div>
                                        </div>
                                      )}
                                    </div>
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
                              <Input {...field} placeholder="Enter brand name" value={field.value || ''} />
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
                              <Input {...field} placeholder="Product category" value={field.value || ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">Inventory Details</h3>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
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
                            <FormLabel>SKU</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter SKU" value={field.value || ''} />
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
                          <FormLabel>Dimensions (L × W × H inches)</FormLabel>
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
                    onClose={handleSmartListingClose}
                    imageFiles={imageFiles}
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