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

interface ProductFormProps {
  product?: SelectProduct;
  onComplete: () => void;
}

export default function ProductForm({ product, onComplete }: ProductFormProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const form = useForm<InsertProduct>({
    defaultValues: product || {
      name: "",
      description: "",
      sku: "",
      price: undefined,
      quantity: 0,
    },
  });

  const onSubmit = async (data: InsertProduct) => {
    try {
      if (product) {
        await apiRequest("PATCH", `/api/products/${product.id}`, data);
      } else {
        await apiRequest("POST", "/api/products", data);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: product ? "Product updated" : "Product created",
        description: data.name,
      });
      onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save product",
        variant: "destructive",
      });
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
                <Textarea {...field} />
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
                <Input {...field} />
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
                  <Input type="number" step="0.01" {...field} />
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
        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={analyzeProductDetails} disabled={isAnalyzing}>
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
      </form>
    </Form>
  );
}
