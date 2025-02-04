import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const analysisTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('SmartListingModal: Cleanup triggered');
    if (analysisTimeout.current) {
      clearTimeout(analysisTimeout.current);
      analysisTimeout.current = null;
    }
    analysisLock.current = false;
    setLoading(false);
    setProgress(0);
    setError(null);
  }, []);

  // Analysis function
  const runAnalysis = useCallback(async () => {
    console.log('SmartListingModal: Starting analysis process', {
      mounted: mounted.current,
      locked: analysisLock.current,
      filesCount: files.length
    });

    if (!mounted.current) {
      console.log('SmartListingModal: Component not mounted, aborting');
      return;
    }

    if (analysisLock.current) {
      console.log('SmartListingModal: Analysis already in progress');
      return;
    }

    try {
      analysisLock.current = true;
      setLoading(true);
      setError(null);
      setProgress(10);

      console.log('SmartListingModal: Calling generateSmartListing');

      // Progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 2000);

      const analysis = await generateSmartListing(files);

      clearInterval(progressInterval);

      console.log('SmartListingModal: Analysis completed successfully');

      if (!mounted.current) {
        console.log('SmartListingModal: Component unmounted during analysis');
        return;
      }

      setProgress(100);
      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully"
      });
    } catch (err) {
      console.error('SmartListingModal: Analysis error:', err);
      if (!mounted.current) return;

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
  }, [files, onAnalysisComplete, onOpenChange, toast]);

  useEffect(() => {
    console.log('SmartListingModal: Modal state changed', { 
      open, 
      filesCount: files.length,
      isLocked: analysisLock.current,
      isLoading: loading 
    });

    if (open && files.length > 0 && !analysisLock.current && !loading) {
      console.log('SmartListingModal: Scheduling analysis');
      analysisTimeout.current = setTimeout(() => {
        console.log('SmartListingModal: Analysis timeout triggered');
        runAnalysis();
      }, 1000);
    }

    return () => {
      mounted.current = false;
      cleanup();
    };
  }, [open, files, runAnalysis, cleanup, loading]);

  useEffect(() => {
    if (open && files.length === 0) {
      console.log('SmartListingModal: No files provided');
      onOpenChange(false);
      toast({
        title: "No images selected",
        description: "Please select at least one image to analyze",
        variant: "destructive",
      });
    }
  }, [open, files.length, onOpenChange, toast]);

  const dialogDescription = loading 
    ? `Analyzing ${files.length} product image${files.length !== 1 ? 's' : ''}`
    : error 
    ? "Analysis encountered an error. Please try again."
    : "AI-powered analysis for optimizing your product listings";

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      console.log('SmartListingModal: Dialog state changing to:', newOpen);
      if (!newOpen) {
        cleanup();
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent 
        className="max-w-2xl"
        aria-describedby="dialog-description"
      >
        <DialogHeader>
          <DialogTitle>Smart Listing Analysis</DialogTitle>
          <DialogDescription id="dialog-description">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {loading && (
            <div 
              className="flex flex-col items-center justify-center py-8" 
              role="status" 
              aria-live="polite"
              aria-busy="true"
            >
              <div className="w-full max-w-xs bg-secondary rounded-full h-2.5 mb-4">
                <div 
                  className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
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
            <div 
              className="text-center space-y-4" 
              role="alert"
              aria-live="assertive"
            >
              <p className="text-destructive whitespace-pre-line">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  console.log('SmartListingModal: Retrying analysis');
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