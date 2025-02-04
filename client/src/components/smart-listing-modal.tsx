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
  const isMounted = useRef(true);
  const analysisLock = useRef<boolean>(false);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const analysisTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function for timers and state
  const cleanup = useCallback(() => {
    console.log('SmartListingModal: Running cleanup');
    if (analysisTimeout.current) {
      clearTimeout(analysisTimeout.current);
      analysisTimeout.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    analysisLock.current = false;
    if (isMounted.current) {
      setLoading(false);
      setProgress(0);
      setError(null);
    }
  }, []);

  // Analysis function
  const runAnalysis = useCallback(async () => {
    console.log('SmartListingModal: Starting analysis', {
      mounted: isMounted.current,
      locked: analysisLock.current,
      filesCount: files.length
    });

    if (!isMounted.current) {
      console.log('SmartListingModal: Component unmounted, skipping analysis');
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

      // Setup progress updates
      progressInterval.current = setInterval(() => {
        if (isMounted.current) {
          setProgress(prev => Math.min(prev + 10, 90));
        }
      }, 2000);

      const analysis = await generateSmartListing(files);

      if (!isMounted.current) {
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
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Analysis failed');
        toast({
          title: "Analysis failed",
          description: err instanceof Error ? err.message : 'Could not analyze product details',
          variant: "destructive",
        });
      }
    } finally {
      cleanup();
    }
  }, [files, onAnalysisComplete, onOpenChange, toast, cleanup]);

  // Handle modal open/close and initial analysis - simplified dependencies
  useEffect(() => {
    if (!open || files.length === 0) return;

    console.log('SmartListingModal: Effect triggered', {
      open,
      filesCount: files.length,
      isLocked: analysisLock.current
    });

    if (!analysisLock.current) {
      console.log('SmartListingModal: Scheduling analysis');
      analysisTimeout.current = setTimeout(() => {
        if (isMounted.current) {
          runAnalysis();
        }
      }, 1000);
    }

    return () => {
      console.log('SmartListingModal: Effect cleanup');
      cleanup();
    };
  }, [open, files, runAnalysis, cleanup]); // Removed loading from dependencies

  // Handle empty files case
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('SmartListingModal: Component unmounting');
      isMounted.current = false;
      cleanup();
    };
  }, [cleanup]);

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        console.log('SmartListingModal: Dialog state changing to:', newOpen);
        if (!newOpen) {
          cleanup();
        }
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Smart Listing Analysis</DialogTitle>
          <DialogDescription>
            {loading 
              ? `Analyzing ${files.length} product image${files.length !== 1 ? 's' : ''}`
              : error 
                ? "Analysis encountered an error. Please try again."
                : "AI-powered analysis for optimizing your product listings"}
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