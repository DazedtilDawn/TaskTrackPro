import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateSmartListing } from "@/lib/gemini";

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
  const mounted = useRef(false);

  const handleAnalyze = useCallback(async () => {
    if (!files.length) return;

    try {
      console.log('Starting image analysis...');
      setLoading(true);
      setError(null);

      const analysis = await generateSmartListing(files);

      if (!mounted.current) return;

      console.log('Analysis completed:', analysis);
      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed",
      });
    } catch (err) {
      console.error('Analysis error:', err);
      if (!mounted.current) return;

      setError(err instanceof Error ? err.message : 'Failed to analyze');
      toast({
        title: "Analysis failed",
        description: "Could not analyze product details",
        variant: "destructive",
      });
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [files, onAnalysisComplete, onOpenChange, toast]);

  useEffect(() => {
    mounted.current = true;

    if (open && files.length > 0) {
      handleAnalyze();
    }

    return () => {
      mounted.current = false;
    };
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
              <p className="text-xs text-muted-foreground mt-2">
                This may take a few moments as we generate detailed product insights
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