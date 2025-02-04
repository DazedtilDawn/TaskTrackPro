import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type InsertProduct, type SelectProduct } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeProduct } from "@/lib/gemini";
import { getEbayPrice } from "@/lib/ebay";
import { useState } from "react";
import { Loader2, BarChart2, Tag, TrendingUp, BookMarked } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import ImageUpload from "@/components/ui/image-upload";
import SmartListingModal from "@/components/smart-listing-modal";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Schema for form validation
const productFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  price: z.coerce.number().min(0).optional().nullable(),
  quantity: z.coerce.number().min(0).default(0),
  imageUrl: z.string().optional().nullable(),
  aiAnalysis: z.any().optional().nullable(),
  ebayPrice: z.coerce.number().optional().nullable(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  product?: SelectProduct;
  onComplete: () => void;
}

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
      price: product?.price ? Number(product.price) : null,
      quantity: product?.quantity ?? 0,
      imageUrl: product?.imageUrl ?? "",
      aiAnalysis: product?.aiAnalysis ?? null,
      ebayPrice: product?.ebayPrice ? Number(product.ebayPrice) : null,
    },
  });

  const aiAnalysis = form.watch("aiAnalysis");
  const currentPrice = form.watch("price") || 0;
  const hasAnalysis = aiAnalysis && Object.keys(aiAnalysis).length > 0;

  const isUnderpriced = hasAnalysis && currentPrice < (aiAnalysis?.marketAnalysis?.priceSuggestion?.min ?? 0);
  const isOverpriced = hasAnalysis && currentPrice > (aiAnalysis?.marketAnalysis?.priceSuggestion?.max ?? 0);
  const isPricedRight = hasAnalysis && !isUnderpriced && !isOverpriced;

  const onSubmit = async (data: ProductFormData) => {
    try {
      const formData = new FormData();

      // Add all form fields
      formData.append('name', data.name);
      formData.append('description', data.description || '');
      formData.append('sku', data.sku || '');
      formData.append('price', data.price ? String(data.price) : '');
      formData.append('quantity', String(data.quantity));
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
        description: data.name,
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
    form.setValue("aiAnalysis", analysis);

    // Pre-fill form fields based on AI analysis
    if (analysis.title) {
      form.setValue("name", analysis.title);
    }
    if (analysis.description) {
      form.setValue("description", analysis.description);
    }
    if (analysis.marketAnalysis?.priceSuggestion?.min) {
      form.setValue("price", analysis.marketAnalysis.priceSuggestion.min);
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
      <ScrollArea className="max-h-[80vh]">
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="mb-6">
                <FormLabel>Product Images</FormLabel>
                <ImageUpload onImagesUploaded={handleImagesUploaded} />
              </div>

              {hasAnalysis && (
                <Card className={cn(
                  "p-6 mb-6 border-2",
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
                              <span className="text-2xl font-semibold">${aiAnalysis.marketAnalysis.priceSuggestion.min}</span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-2xl font-semibold">${aiAnalysis.marketAnalysis.priceSuggestion.max}</span>
                            </div>
                          </div>

                          {/* Recommended Buy/Sell Prices */}
                          <div className="p-3 bg-secondary/20 rounded-lg space-y-3">
                            <div>
                              <span className="text-sm font-medium">Recommended Buy Price</span>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-xl font-semibold text-green-600">
                                  ${Math.floor(aiAnalysis.marketAnalysis.priceSuggestion.min * 0.7)}
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
                                  ${Math.ceil(aiAnalysis.marketAnalysis.priceSuggestion.max * 1.15)}
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
                                  {Math.round(((aiAnalysis.marketAnalysis.priceSuggestion.max * 1.15) / 
                                    (aiAnalysis.marketAnalysis.priceSuggestion.min * 0.7) - 1) * 100)}%
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

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ''} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
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
                            isPricedRight && "border-green-500 focus-visible:ring-green-500"
                          )}
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
                        <Input
                          type="number"
                          {...field}
                          value={field.value}
                          onChange={e => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={analyzeProductDetails}
                  disabled={isAnalyzing || !form.getValues("name") || !form.getValues("description")}
                >
                  {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Analyze Product
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={onComplete}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {product ? "Update" : "Create"} Product
                  </Button>
                </div>
              </div>

              <SmartListingModal
                open={showSmartListing}
                onOpenChange={setShowSmartListing}
                files={imageFiles}
                onAnalysisComplete={handleAnalysisComplete}
              />
            </form>
          </Form>
        </div>
      </ScrollArea>
    </DialogContent>
  );
}