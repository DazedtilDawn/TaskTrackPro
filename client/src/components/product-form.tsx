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
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import ImageUpload from "@/components/ui/image-upload";
import SmartListingModal from "@/components/smart-listing-modal";

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

  const onSubmit = async (data: ProductFormData) => {
    try {
      // Convert number values to strings for API
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-6">
          <FormLabel>Product Images</FormLabel>
          <ImageUpload onImagesUploaded={handleImagesUploaded} />
        </div>

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
            disabled={isAnalyzing || imageFiles.length === 0}
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
  );
}