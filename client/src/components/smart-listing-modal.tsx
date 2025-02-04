import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SmartListingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  onAnalysisComplete: (analysis: any) => void;
}

export default function SmartListingModal({
  open,
  onOpenChange,
  files,
  onAnalysisComplete,
}: SmartListingModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAnalyze = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement AI analysis here using Gemini API
      // This will be implemented in the next step
      const mockAnalysis = {
        title: "Sample Product",
        description: "A detailed description will be generated",
        category: "Test Category",
        suggestedPrice: 99.99,
        marketAnalysis: {
          demandScore: 85,
          competitionLevel: "medium",
          priceSuggestion: {
            min: 89.99,
            max: 109.99
          }
        },
        seoKeywords: ["test", "sample", "product"],
        suggestions: [
          "Add more product images",
          "Include detailed specifications",
          "Highlight unique features"
        ]
      };

      onAnalysisComplete(mockAnalysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed",
      });
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze');
      toast({
        title: "Analysis failed",
        description: "Could not analyze product details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [files, onAnalysisComplete, onOpenChange, toast]);

  useEffect(() => {
    if (open && files.length > 0) {
      handleAnalyze();
    }
  }, [open, files, handleAnalyze]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Analyzing Product Images</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                Analyzing your product images...
              </p>
            </div>
          )}
          {error && (
            <div className="text-center text-destructive">
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={handleAnalyze}
                className="mt-4"
                disabled={loading}
              >
                Retry Analysis
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
