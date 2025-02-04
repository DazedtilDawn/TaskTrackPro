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
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  // Refs for managing analysis state
  const mounted = useRef(true);
  const analysisLock = useRef<boolean>(false);
  const abortController = useRef<AbortController | null>(null);
  const analysisTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (analysisTimeout.current) {
      clearTimeout(analysisTimeout.current);
      analysisTimeout.current = null;
    }
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    analysisLock.current = false;
  }, []);

  // Analysis function
  const runAnalysis = useCallback(async () => {
    // Prevent concurrent analysis
    if (analysisLock.current || !mounted.current) return;

    try {
      cleanup();
      analysisLock.current = true;
      abortController.current = new AbortController();

      setLoading(true);
      setError(null);
      setProgress(0);

      const analysis = await generateSmartListing(files);

      if (!mounted.current) return;

      setProgress(100);
      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully"
      });
    } catch (err) {
      if (!mounted.current) return;

      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');

      toast({
        title: "Analysis failed",
        description: err instanceof Error ? err.message : 'Could not analyze product details',
        variant: "destructive",
      });
    } finally {
      if (mounted.current) {
        setLoading(false);
        setProgress(0);
      }
      analysisLock.current = false;
    }
  }, [files, onAnalysisComplete, onOpenChange, toast, cleanup]);

  // Effect to start analysis
  useEffect(() => {
    if (open && files.length > 0 && !analysisLock.current) {
      analysisTimeout.current = setTimeout(runAnalysis, 1000);
    }

    return () => {
      mounted.current = false;
      cleanup();
    };
  }, [open, files, runAnalysis, cleanup]);

  // Handle no files case
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
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        cleanup();
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Smart Listing Analysis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-full max-w-xs bg-secondary rounded-full h-2.5 mb-4">
                <div 
                  className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                Analyzing {files.length} product image{files.length !== 1 ? 's' : ''}...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {progress < 20 ? 'Validating images...' :
                 progress < 50 ? 'Processing images...' :
                 progress < 80 ? 'Analyzing content...' :
                 'Finalizing results...'}
              </p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center space-y-4">
              <p className="text-destructive whitespace-pre-line">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  if (!analysisLock.current) {
                    runAnalysis();
                  }
                }}
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