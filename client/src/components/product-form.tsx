import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { type SelectProduct } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeProduct } from "@/lib/gemini";
import { getEbayMarketAnalysis, checkEbayAuth } from "@/lib/ebay";
import {
  Loader2,
  BarChart2,
  PackageOpen,
  Sparkles,
  Info,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ImageUpload from "@/components/ui/image-upload";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import SmartListingModal from "@/components/smart-listing-modal";

const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .optional(),
  sku: z.string().optional(),
  condition: z
    .enum(["new", "open_box", "used_like_new", "used_good", "used_fair"])
    .default("used_good"),
  brand: z.string().optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be greater than 0").optional(),
  quantity: z.coerce.number().min(0, "Quantity must be 0 or greater").default(0),
  imageUrl: z.string().optional(),
  aiAnalysis: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      marketAnalysis: z.object({
        demandScore: z.number(),
        competitionLevel: z.string(),
        priceSuggestion: z.object({
          min: z.number(),
          max: z.number(),
        }),
      }),
      seoKeywords: z.array(z.string()),
      suggestions: z.array(z.string()),
      ebayData: z
        .object({
          currentPrice: z.number(),
          averagePrice: z.number(),
          lowestPrice: z.number(),
          highestPrice: z.number(),
          soldCount: z.number(),
          activeListing: z.number(),
          recommendedPrice: z.number(),
          lastUpdated: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  ebayPrice: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  dimensions: z.string().optional(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  product?: SelectProduct;
  onComplete: () => void;
  isWatchlistItem?: boolean;
  open?: boolean; 
}

const conditionOptions = [
  { value: "new", label: "New" },
  { value: "open_box", label: "Open Box", discount: 0.85 },
  { value: "used_like_new", label: "Used - Like New", discount: 0.8 },
  { value: "used_good", label: "Used - Good", discount: 0.7 },
  { value: "used_fair", label: "Used - Fair", discount: 0.6 },
];

type FormStep = "basic" | "analysis" | "details" | "review";

interface StepIndicatorProps {
  currentStep: FormStep;
  steps: Array<{ id: FormStep; label: string }>;
}

const StepIndicator = ({ currentStep, steps }: StepIndicatorProps) => (
  <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
    <div className="flex flex-wrap gap-4 md:gap-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
              currentStep === step.id
                ? "bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/30"
                : "bg-muted text-muted-foreground"
            )}
          >
            {index + 1}
          </div>
          <span className="ml-2 text-sm font-medium hidden md:inline">
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <div className="hidden md:block w-16 h-px bg-muted mx-2" />
          )}
        </div>
      ))}
    </div>
    <div className="md:hidden mt-2 text-sm text-muted-foreground">
      Step {steps.findIndex(s => s.id === currentStep) + 1} of {steps.length}: {steps.find(s => s.id === currentStep)?.label}
    </div>
  </div>
);

export default function ProductForm({
  product,
  onComplete,
  isWatchlistItem = false,
  open = false, 
}: ProductFormProps) {
  const [currentStep, setCurrentStep] = useState<FormStep>("basic");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingEbay, setIsLoadingEbay] = useState(false);
  const [isRefiningPrice, setIsRefiningPrice] = useState(false);
  const [hasEbayAuth, setHasEbayAuth] = useState<boolean | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [showSmartListing, setShowSmartListing] = useState(false);
  const [runAllAnalysis, setRunAllAnalysis] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const steps = [
    { id: "basic" as FormStep, label: "Basic Info & Images" },
    { id: "analysis" as FormStep, label: "AI Analysis" },
    { id: "details" as FormStep, label: "Additional Details" },
    { id: "review" as FormStep, label: "Review & Submit" },
  ];

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      sku: product?.sku ?? "",
      condition: (product?.condition as any) ?? "used_good",
      brand: product?.brand ?? "",
      category: product?.category ?? "",
      price: product?.price ? Number(product.price) : undefined,
      quantity: isWatchlistItem ? 0 : product?.quantity ?? 0,
      imageUrl: product?.imageUrl ?? "",
      aiAnalysis: product?.aiAnalysis ?? undefined,
      ebayPrice: product?.ebayPrice ? Number(product.ebayPrice) : undefined,
      weight: product?.weight ? Number(product.weight) : undefined,
      dimensions: product?.dimensions ?? "",
    },
  });

  const aiAnalysis = form.watch("aiAnalysis");
  const hasAnalysis = Boolean(aiAnalysis);

  useEffect(() => {
    (async () => {
      const isAuthenticated = await checkEbayAuth();
      setHasEbayAuth(isAuthenticated);
    })();
    const saved = localStorage.getItem("runAllAnalysis");
    if (saved !== null) {
      setRunAllAnalysis(JSON.parse(saved));
    }
  }, []);

  const handleRunAllAnalysisToggle = (checked: boolean) => {
    setRunAllAnalysis(checked);
    localStorage.setItem("runAllAnalysis", JSON.stringify(checked));
  };

  const analyzeProductAI = async () => {
    const name = form.getValues("name");
    const description = form.getValues("description");
    if (!name || !description) {
      toast({
        title: "Missing details",
        description: "Please provide a product name and description",
        variant: "destructive",
      });
      return;
    }
    setIsAnalyzing(true);
    try {
      const tempId = Date.now();
      const aiResult = await analyzeProduct({ 
        id: tempId, 
        name, 
        description,
        condition: form.getValues("condition") 
      });

      console.log("[Product Analysis] AI analysis:", aiResult);
      form.setValue("aiAnalysis", aiResult);

      if (aiResult.marketAnalysis?.priceSuggestion?.min) {
        const conditionVal = form.getValues("condition");
        const conditionData = conditionOptions.find((opt) => opt.value === conditionVal);
        const discount = conditionData?.discount ?? 1;
        const adjustedPrice = Math.floor(aiResult.marketAnalysis.priceSuggestion.min * discount);
        form.setValue("price", adjustedPrice);
      }

      toast({
        title: "Analysis Complete",
        description: "AI analysis has been completed successfully.",
      });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Could not analyze product details. Please try again.",
        variant: "destructive",
      });

      setIsAnalyzing(false);
      return false;
    } finally {
      setIsAnalyzing(false);
    }
    return true;
  };

  const refineWithEbay = async () => {
    const name = form.getValues("name");
    const currentAnalysis = form.getValues("aiAnalysis");
    if (!name || !currentAnalysis) {
      toast({
        title: "Missing details",
        description: "Please run the AI analysis first",
        variant: "destructive",
      });
      return;
    }
    setIsLoadingEbay(true);
    try {
      const marketAnalysis = await getEbayMarketAnalysis(name, currentAnalysis);
      console.log("[Product Analysis] eBay data:", marketAnalysis);
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
          lastUpdated: new Date().toISOString(),
        },
        marketAnalysis: {
          ...currentAnalysis.marketAnalysis,
          priceSuggestion: {
            min: Math.min(
              currentAnalysis.marketAnalysis.priceSuggestion.min,
              marketAnalysis.recommendedPrice * 0.9
            ),
            max: Math.max(
              currentAnalysis.marketAnalysis.priceSuggestion.max,
              marketAnalysis.recommendedPrice * 1.1
            ),
          },
        },
      };
      form.setValue("aiAnalysis", combinedAnalysis);
      form.setValue("ebayPrice", marketAnalysis.recommendedPrice);
      const conditionVal = form.getValues("condition");
      const conditionData = conditionOptions.find((opt) => opt.value === conditionVal);
      const discount = conditionData?.discount ?? 1;
      const adjustedPrice = Math.floor(marketAnalysis.recommendedPrice * discount);
      form.setValue("price", adjustedPrice);
      toast({
        title: "eBay Analysis Complete",
        description: "eBay data have been integrated into your listing.",
      });
    } catch (error) {
      console.error("eBay analysis error:", error);
      toast({
        title: "eBay Analysis Failed",
        description: "Could not fetch eBay market data",
        variant: "destructive",
      });
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
      const buyPrice = form.getValues("ebayPrice") || currentPrice;
      const conditionVal = form.getValues("condition");
      const categoryVal = form.getValues("category") || "";
      const payload: any = {
        buyPrice,
        currentPrice,
        condition: conditionVal,
        category: categoryVal,
      };
      if (product?.id) {
        payload.productId = product.id;
      }
      const response = await apiRequest("POST", "/api/generate-sale-price", payload);
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      form.setValue("price", result.recommendedSalePrice);
      toast({
        title: "Price Refined",
        description: "The recommended sale price has been updated",
      });
    } catch (error) {
      console.error("Pricing refinement error:", error);
      toast({
        title: "Refinement Failed",
        description: "Could not refine the sale price",
        variant: "destructive",
      });
    } finally {
      setIsRefiningPrice(false);
    }
  };

  const handleImagesUploaded = async (files: File[]) => {
    setImageFiles(files);
    if (files.length > 0 && runAllAnalysis) {
      setShowSmartListing(true);
    }
  };

  const handleAnalysisComplete = async (analysis: any) => {
    form.setValue("aiAnalysis", analysis);
    if (analysis.title) form.setValue("name", analysis.title);
    if (analysis.description) form.setValue("description", analysis.description);
    if (analysis.category) form.setValue("category", analysis.category);

    if (analysis.marketAnalysis?.priceSuggestion?.min) {
      const conditionVal = form.getValues("condition");
      const conditionData = conditionOptions.find((opt) => opt.value === conditionVal);
      const discount = conditionData?.discount ?? 1;
      const adjustedPrice = Math.floor(analysis.marketAnalysis.priceSuggestion.min * discount);
      form.setValue("price", adjustedPrice);
    }

    setShowSmartListing(false);

    if (runAllAnalysis && hasEbayAuth) {
      await refineWithEbay();
    }

    setCurrentStep("details");

    toast({
      title: "Analysis Complete",
      description: "Product details have been extracted and analyzed",
    });
  };

  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", data.name.trim());
      ["description", "sku", "brand", "category", "dimensions"].forEach((field) => {
        if (data[field]) formData.append(field, data[field].trim());
      });
      ["price", "quantity", "weight", "ebayPrice"].forEach((field) => {
        const value = data[field];
        if (value !== null && value !== undefined && !Number.isNaN(Number(value))) {
          formData.append(field, value.toString());
        }
      });
      formData.append("condition", data.condition || "used_good");
      if (data.aiAnalysis)
        formData.append("aiAnalysis", JSON.stringify(data.aiAnalysis));
      imageFiles.forEach((file) => formData.append("image", file));

      const endpoint = product ? `/api/products/${product.id}` : "/api/products";
      const method = product ? "PATCH" : "POST";
      const response = await apiRequest(method, endpoint, formData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      const result = await response.json();

      if (isWatchlistItem) {
        const watchlistResponse = await apiRequest("POST", "/api/watchlist", {
          productId: result.id,
        });
        if (!watchlistResponse.ok) {
          const watchlistError = await watchlistResponse.json();
          throw new Error(watchlistError.error || "Failed to add to watchlist");
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
        ]);
        toast({
          title: "Product Added to Watchlist",
          description: data.name.trim(),
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        toast({
          title: product ? "Product Updated" : "Product Created",
          description: data.name.trim(),
        });
      }
      onComplete();
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save product",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canAdvance = () => {
    switch (currentStep) {
      case "basic":
        return form.getValues("name") && form.getValues("description");
      case "analysis":
        return true;
      case "details":
        return form.getValues("price") !== undefined;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    const currentIndex = steps.findIndex((s) => s.id === currentStep);
    if (currentIndex < steps.length - 1) {
      if (currentStep === "basic" && runAllAnalysis && !form.getValues("aiAnalysis")) {
        if (imageFiles.length === 0) {
          setCurrentStep(steps[currentIndex + 1].id);
        }
        return;
      }
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    const currentIndex = steps.findIndex((s) => s.id === currentStep);
    if (currentIndex > 0) setCurrentStep(steps[currentIndex - 1].id);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "basic":
        return (
          <div className="space-y-8">
            <div>
              <FormLabel>Product Images</FormLabel>
              <FormDescription className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Upload clear, high-quality images for better AI analysis
              </FormDescription>
              <div className="mt-4">
                <ImageUpload onImagesUploaded={handleImagesUploaded} />
                {imageFiles.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                    {imageFiles.map((file, idx) => {
                      const previewUrl = URL.createObjectURL(file);
                      return (
                        <div key={idx} className="relative group aspect-square">
                          <img
                            src={previewUrl}
                            alt={`Preview ${idx + 1}`}
                            className="object-cover w-full h-full rounded-lg border"
                            onLoad={() => URL.revokeObjectURL(previewUrl)}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm">Image {idx + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Alert className="bg-muted/50">
              <AlertDescription className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={runAllAnalysis}
                    onChange={(e) => handleRunAllAnalysisToggle(e.target.checked)}
                    className="h-4 w-4 rounded border-muted-foreground"
                    id="runAllAnalysis"
                  />
                  <label htmlFor="runAllAnalysis" className="text-sm font-medium cursor-pointer">
                    Auto-run AI and eBay analysis
                  </label>
                </div>
                <span className="text-xs text-muted-foreground">
                  (Recommended)
                </span>
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Product Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter a clear, descriptive name" />
                    </FormControl>
                  </FormItem>
                )}
              />
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
                        placeholder="Describe features, condition, and any notable details"
                        className="min-h-[120px]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        );
      case "analysis":
        return (
          <div className="space-y-8 px-4">
            <div className="mb-4 flex flex-wrap gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={analyzeProductAI}
                disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
                className="flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Analyze Product
              </Button>
              {hasEbayAuth && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={refineWithEbay}
                  disabled={isLoadingEbay || !form.getValues("aiAnalysis")}
                  className="flex items-center gap-2"
                >
                  {isLoadingEbay ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart2 className="h-4 w-4" />
                  )}
                  Refine with eBay
                </Button>
              )}
              {form.getValues("aiAnalysis")?.ebayData && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={refinePricingWithAI}
                  disabled={isRefiningPrice}
                  className="flex items-center gap-2"
                >
                  {isRefiningPrice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  Refine Pricing
                </Button>
              )}
            </div>
            {hasAnalysis && (
              <Card className="p-6 border border-indigo-200 shadow-sm">
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-lg">AI Analysis Results</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">Market Analysis</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm text-gray-500">Demand Score</span>
                          <div className="text-2xl font-semibold">
                            {form.getValues("aiAnalysis")?.marketAnalysis?.demandScore ?? 0}/10
                          </div>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500">Competition Level</span>
                          <div className="text-lg font-medium">
                            {form.getValues("aiAnalysis")?.marketAnalysis?.competitionLevel ?? "Unknown"}
                          </div>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500">Suggested Price Range</span>
                          <div className="text-lg font-medium">
                            ${form.getValues("aiAnalysis")?.marketAnalysis?.priceSuggestion?.min?.toFixed(2) ?? "0.00"} -
                            ${form.getValues("aiAnalysis")?.marketAnalysis?.priceSuggestion?.max?.toFixed(2) ?? "0.00"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">SEO Keywords</h4>
                      <div className="flex flex-wrap gap-2">
                        {(form.getValues("aiAnalysis")?.seoKeywords || []).map((keyword: string, idx: number) => (
                          <span key={idx} className="px-2 py-1 bg-indigo-100 rounded-md text-sm">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            {hasAnalysis && aiAnalysis?.ebayData && (
              <Card className="p-6 border border-indigo-200 shadow-sm">
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="h-5 w-5 text-indigo-600" />
                      <h3 className="font-semibold text-lg">eBay Market Data</h3>
                    </div>
                    <div className="text-sm text-gray-500">
                      Last updated: {form.getValues("aiAnalysis")?.ebayData?.lastUpdated
                        ? new Date(form.getValues("aiAnalysis")?.ebayData?.lastUpdated).toLocaleString()
                        : "No update time available"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <span className="text-sm text-gray-500">Current Price</span>
                        <div className="text-2xl font-semibold">
                          ${(form.getValues("aiAnalysis")?.ebayData?.currentPrice ?? 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Average Price</span>
                        <div className="text-2xl font-semibold">
                          ${(form.getValues("aiAnalysis")?.ebayData?.averagePrice ?? 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Price Range</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-semibold">
                            ${(form.getValues("aiAnalysis")?.ebayData?.lowestPrice ?? 0).toFixed(2)}
                          </span>
                          <span className="text-gray-500">-</span>
                          <span className="text-xl font-semibold">
                            ${(form.getValues("aiAnalysis")?.ebayData?.highestPrice ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <span className="text-sm text-gray-500">Items Sold</span>
                        <div className="text-2xl font-semibold">
                          {(form.getValues("aiAnalysis")?.ebayData?.soldCount ?? 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Active Listings</span>
                        <div className="text-2xl font-semibold">
                          {(form.getValues("aiAnalysis")?.ebayData?.activeListing ?? 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Recommended Price</span>
                        <div className="text-2xl font-semibold text-indigo-600">
                          ${(form.getValues("aiAnalysis")?.ebayData?.recommendedPrice ?? 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        );
      case "details":
        return (
          <div className="space-y-8 px-4">
            <div className="grid grid-cols-2 gap-6">
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <PackageOpen className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
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
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : undefined;
                          field.onChange(val);
                        }}
                        placeholder="0.00"
                        className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter SKU" className="border-gray-300" />
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
                      <Input {...field} placeholder="Enter brand name" className="border-gray-300" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
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
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : undefined;
                          field.onChange(val);
                        }}
                        className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                      />
                    </FormControl>
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
                        className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        );
      case "review":
        return (
          <div className="space-y-8 px4">
            <h3 className="text-xl font-semibold">Review Your Product</h3>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="text-lg font-medium">{form.getValues("name")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-lg font-medium">{form.getValues("description")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Price</p>
                <p className="text-lg font-medium">${form.getValues("price")?.toFixed(2)}</p>
              </div>
              {form.getValues("aiAnalysis") && (
                <div>
                  <p className="text-sm text-gray-500">AI Analysis</p>
                  <div className="text-lg font-medium">
                    <p>Category: {form.getValues("aiAnalysis.category")}</p>
                    <p>Demand Score: {form.getValues("aiAnalysis.marketAnalysis.demandScore")}/10</p>
                    <p>Competition: {form.getValues("aiAnalysis.marketAnalysis.competitionLevel")}</p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Images</p>
                <p className="text-lg font-medium">{imageFiles.length} images selected</p>
              </div>
            </div>
            <div className="flex flex-col space-y-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setCurrentStep("basic")}
                className="text-blue-600 hover:underline flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Edit Basic Info
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep("analysis")}
                className="text-blue-600 hover:underline flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Edit Analysis
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep("details")}
                className="text-blue-600 hover:underline flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Edit Details
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onComplete}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {product ? "Edit Product" : isWatchlistItem ? "Add to Watchlist" : "Add Product"}
          </DialogTitle>
          <DialogDescription>
            Fill in the product details below to {product ? "update" : "create"} your listing
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <StepIndicator currentStep={currentStep} steps={steps} />

                {currentStep === "basic" && (
                  <div className="space-y-8">
                    <div>
                      <FormLabel>Product Images</FormLabel>
                      <FormDescription className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Upload clear, high-quality images for better AI analysis
                      </FormDescription>
                      <div className="mt-4">
                        <ImageUpload onImagesUploaded={handleImagesUploaded} />
                        {imageFiles.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                            {imageFiles.map((file, idx) => {
                              const previewUrl = URL.createObjectURL(file);
                              return (
                                <div key={idx} className="relative group aspect-square">
                                  <img
                                    src={previewUrl}
                                    alt={`Preview ${idx + 1}`}
                                    className="object-cover w-full h-full rounded-lg border"
                                    onLoad={() => URL.revokeObjectURL(previewUrl)}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                    <span className="text-white text-sm">Image {idx + 1}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <Alert className="bg-muted/50">
                      <AlertDescription className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={runAllAnalysis}
                            onChange={(e) => handleRunAllAnalysisToggle(e.target.checked)}
                            className="h-4 w-4 rounded border-muted-foreground"
                            id="runAllAnalysis"
                          />
                          <label htmlFor="runAllAnalysis" className="text-sm font-medium cursor-pointer">
                            Auto-run AI and eBay analysis
                          </label>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          (Recommended)
                        </span>
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Product Name <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter a clear, descriptive name" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
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
                                placeholder="Describe features, condition, and any notable details"
                                className="min-h-[120px]"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === "analysis" && (
                  <div className="space-y-8 px-4">
                    <div className="mb-4 flex flex-wrap gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={analyzeProductAI}
                        disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
                        className="flex items-center gap-2"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Analyze Product
                      </Button>
                      {hasEbayAuth && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={refineWithEbay}
                          disabled={isLoadingEbay || !form.getValues("aiAnalysis")}
                          className="flex items-center gap-2"
                        >
                          {isLoadingEbay ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BarChart2 className="h-4 w-4" />
                          )}
                          Refine with eBay
                        </Button>
                      )}
                      {form.getValues("aiAnalysis")?.ebayData && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={refinePricingWithAI}
                          disabled={isRefiningPrice}
                          className="flex items-center gap-2"
                        >
                          {isRefiningPrice ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TrendingUp className="h-4 w-4" />
                          )}
                          Refine Pricing
                        </Button>
                      )}
                    </div>
                    {hasAnalysis && (
                      <Card className="p-6 border border-indigo-200 shadow-sm">
                        <div className="space-y-6">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-indigo-600" />
                            <h3 className="font-semibold text-lg">AI Analysis Results</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-medium mb-2">Market Analysis</h4>
                              <div className="space-y-2">
                                <div>
                                  <span className="text-sm text-gray-500">Demand Score</span>
                                  <div className="text-2xl font-semibold">
                                    {form.getValues("aiAnalysis")?.marketAnalysis?.demandScore ?? 0}/10
                                  </div>
                                </div>
                                <div>
                                  <span className="text-sm text-gray-500">Competition Level</span>
                                  <div className="text-lg font-medium">
                                    {form.getValues("aiAnalysis")?.marketAnalysis?.competitionLevel ?? "Unknown"}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-sm text-gray-500">Suggested Price Range</span>
                                  <div className="text-lg font-medium">
                                    ${form.getValues("aiAnalysis")?.marketAnalysis?.priceSuggestion?.min?.toFixed(2) ?? "0.00"} -
                                    ${form.getValues("aiAnalysis")?.marketAnalysis?.priceSuggestion?.max?.toFixed(2) ?? "0.00"}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">SEO Keywords</h4>
                              <div className="flex flex-wrap gap-2">
                                {(form.getValues("aiAnalysis")?.seoKeywords || []).map((keyword: string, idx: number) => (
                                  <span key={idx} className="px-2 py-1 bg-indigo-100 rounded-md text-sm">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                    {hasAnalysis && aiAnalysis?.ebayData && (
                      <Card className="p-6 border border-indigo-200 shadow-sm">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between border-b pb-4">
                            <div className="flex items-center gap-2">
                              <BarChart2 className="h-5 w-5 text-indigo-600" />
                              <h3 className="font-semibold text-lg">eBay Market Data</h3>
                            </div>
                            <div className="text-sm text-gray-500">
                              Last updated: {form.getValues("aiAnalysis")?.ebayData?.lastUpdated
                                ? new Date(form.getValues("aiAnalysis")?.ebayData?.lastUpdated).toLocaleString()
                                : "No update time available"}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div>
                                <span className="text-sm text-gray-500">Current Price</span>
                                <div className="text-2xl font-semibold">
                                  ${(form.getValues("aiAnalysis")?.ebayData?.currentPrice ?? 0).toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">Average Price</span>
                                <div className="text-2xl font-semibold">
                                  ${(form.getValues("aiAnalysis")?.ebayData?.averagePrice ?? 0).toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">Price Range</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xl font-semibold">
                                    ${(form.getValues("aiAnalysis")?.ebayData?.lowestPrice ?? 0).toFixed(2)}
                                  </span>
                                  <span className="text-gray-500">-</span>
                                  <span className="text-xl font-semibold">
                                    ${(form.getValues("aiAnalysis")?.ebayData?.highestPrice ?? 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <span className="text-sm text-gray-500">Items Sold</span>
                                <div className="text-2xl font-semibold">
                                  {(form.getValues("aiAnalysis")?.ebayData?.soldCount ?? 0).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">Active Listings</span>
                                <div className="text-2xl font-semibold">
                                  {(form.getValues("aiAnalysis")?.ebayData?.activeListing ?? 0).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">Recommended Price</span>
                                <div className="text-2xl font-semibold text-indigo-600">
                                  ${(form.getValues("aiAnalysis")?.ebayData?.recommendedPrice ?? 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {currentStep === "details" && (
                  <div className="space-y-8 px-4">
                    <div className="grid grid-cols-2 gap-6">
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
                              <SelectTrigger>
                                <SelectValue placeholder="Select condition" />
                              </SelectTrigger>
                              <SelectContent>
                                {conditionOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex items-center gap-2">
                                      <PackageOpen className="h-4 w-4" />
                                      {option.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
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
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : undefined;
                                  field.onChange(val);
                                }}
                                placeholder="0.00"
                                className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="sku"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SKU</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter SKU" className="border-gray-300" />
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
                              <Input {...field} placeholder="Enter brand name" className="border-gray-300" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
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
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : undefined;
                                  field.onChange(val);
                                }}
                                className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                              />
                            </FormControl>
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
                                className="border-gray-300 focus:border-indigo-600 focus:ring focus:ring-indigo-200"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === "review" && (
                  <ScrollArea className="h-[500px] pr-6">
                    <div className="space-y-8 px4">
                      <h3 className="text-xl font-semibold">Review Your Product</h3>
                      <div className="space-y-6">
                        <div>
                          <p className="text-sm text-gray-500">Name</p>
                          <p className="text-lg font-medium">{form.getValues("name")}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Description</p>
                          <p className="text-lg font-medium">{form.getValues("description")}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Price</p>
                          <p className="text-lg font-medium">${form.getValues("price")?.toFixed(2)}</p>
                        </div>
                        {form.getValues("aiAnalysis") && (
                          <div>
                            <p className="text-sm text-gray-500">AI Analysis</p>
                            <div className="text-lg font-medium">
                              <p>Category: {form.getValues("aiAnalysis.category")}</p>
                              <p>Demand Score: {form.getValues("aiAnalysis.marketAnalysis.demandScore")}/10</p>
                              <p>Competition: {form.getValues("aiAnalysis.marketAnalysis.competitionLevel")}</p>
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-gray-500">Images</p>
                          <p className="text-lg font-medium">{imageFiles.length} images selected</p>
                        </div>
                      </div>
                      <div className="flex flex-col space-y-2 pt-4 border-t">
                        <button
                          type="button"
                          onClick={() => setCurrentStep("basic")}
                          className="text-blue-600 hover:underline flex items-center gap-2"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Edit Basic Info
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep("analysis")}
                          className="text-blue-600 hover:underline flex items-center gap-2"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Edit Analysis
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep("details")}
                          className="text-blue-600 hover:underline flex items-center gap-2"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Edit Details
                        </button>
                      </div>
                    </div>
                  </ScrollArea>
                )}

                <div className="flex justify-between pt-6 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={currentStep === "basic"}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onComplete()}
                    >
                      Cancel
                    </Button>
                    {currentStep === "review" ? (
                      <Button 
                        type="submit"
                        disabled={isSubmitting}
                        className="flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Product'
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleNext}
                        disabled={!canAdvance()}
                        className="flex items-center gap-2"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <SmartListingModal
                  open={showSmartListing}
                  onOpenChange={setShowSmartListing}
                  images={imageFiles}
                  onAnalysisComplete={handleAnalysisComplete}
                />
              </form>
            </Form>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}