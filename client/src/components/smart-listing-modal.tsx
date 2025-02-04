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
  const analysisInProgress = useRef(false);

  const handleAnalyze = useCallback(async () => {
    if (!files.length || analysisInProgress.current) return;

    try {
      analysisInProgress.current = true;
      setLoading(true);
      setError(null);

      console.log('Starting analysis with files:', files.length);
      const analysis = await generateSmartListing(files);
      console.log('Analysis completed:', analysis);

      if (!analysis) {
        throw new Error('Analysis failed to generate results');
      }

      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed",
      });
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze product');
      toast({
        title: "Analysis failed",
        description: err instanceof Error ? err.message : "Could not analyze product details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      analysisInProgress.current = false;
    }
  }, [files, onAnalysisComplete, onOpenChange, toast]);

  useEffect(() => {
    // Only start analysis if modal is open and we have files
    if (open && files.length > 0 && !loading && !analysisInProgress.current) {
      handleAnalyze();
    }

    // Cleanup function
    return () => {
      if (loading) {
        setLoading(false);
        analysisInProgress.current = false;
      }
    };
  }, [open, files, handleAnalyze, loading]);

  // Close modal if there are no files
  useEffect(() => {
    if (open && files.length === 0) {
      onOpenChange(false);
      toast({
        title: "No images selected",
        description: "Please select at least one image to analyze",
        variant: "destructive",
      });
    }
  }, [open, files.length, onOpenChange, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Smart Listing Analysis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                Analyzing {files.length} product image{files.length !== 1 ? 's' : ''}...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take a few moments
              </p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center space-y-4">
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                onClick={handleAnalyze}
                disabled={analysisInProgress.current}
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