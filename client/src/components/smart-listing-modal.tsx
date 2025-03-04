import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, FileImage, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateSmartListing } from "@/lib/gemini";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SmartListingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;  
  images: File[];
  onAnalysisComplete: (analysis: any) => void;
}

export default function SmartListingModal({
  open,
  onOpenChange,  
  images = [],
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

  const runAnalysis = useCallback(async () => {
    if (!isMounted.current || analysisLock.current || !images?.length) return;

    try {
      analysisLock.current = true;
      setLoading(true);
      setError(null);
      setProgress(10);

      progressInterval.current = setInterval(() => {
        if (isMounted.current) {
          setProgress(prev => Math.min(prev + 10, 90));
        }
      }, 2000);

      const analysis = await generateSmartListing(images);
      if (!isMounted.current) return;

      setProgress(100);
      onAnalysisComplete(analysis);
      onOpenChange(false);  

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully"
      });
    } catch (err) {
      console.error('Analysis error:', err);
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
  }, [images, onAnalysisComplete, onOpenChange, toast, cleanup]);  

  useEffect(() => {
    if (!open || !images?.length) {
      cleanup();
      return;
    }

    if (!analysisLock.current) {
      analysisTimeout.current = setTimeout(() => {
        if (isMounted.current) {
          runAnalysis();
        }
      }, 1000);
    }

    return cleanup;
  }, [open, images, runAnalysis, cleanup]);

  useEffect(() => {
    if (open && (!images?.length)) {
      onOpenChange(false);  
      toast({
        title: "No images selected",
        description: "Please select at least one image to analyze",
        variant: "destructive",
      });
    }
  }, [open, images?.length, onOpenChange, toast]);  

  useEffect(() => {
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [cleanup]);

  const getStatusIcon = () => {
    if (error) return <AlertCircle className="h-8 w-8 text-destructive" />;
    if (progress === 100) return <CheckCircle2 className="h-8 w-8 text-primary" />;
    return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
  };

  const getStatusMessage = () => {
    if (progress < 20) return 'Validating images...';
    if (progress < 50) return 'Processing images...';
    if (progress < 80) return 'Analyzing content...';
    return 'Finalizing results...';
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={onOpenChange}  
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            Smart Listing Analysis
          </DialogTitle>
          <DialogDescription>
            {loading 
              ? `Analyzing ${images?.length} product image${images?.length !== 1 ? 's' : ''} with AI`
              : error 
                ? "Analysis encountered an error. Please try again."
                : "AI-powered analysis for optimizing your product listings"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {loading && (
            <div 
              className="relative p-6 bg-card rounded-lg border" 
              role="status" 
              aria-live="polite"
              aria-busy="true"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  {getStatusIcon()}
                  <div>
                    <h4 className="font-semibold">{error ? 'Analysis Error' : 'Processing'}</h4>
                    <p className="text-sm text-muted-foreground">
                      {getStatusMessage()}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Analysis Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5">
                    <div 
                      className={cn(
                        "h-2.5 rounded-full transition-all duration-300",
                        error ? "bg-destructive" : "bg-primary"
                      )}
                      style={{ width: `${progress}%` }}
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>

                {/* Steps indicator */}
                <div className="space-y-3 mt-6">
                  {['Image Validation', 'Processing', 'AI Analysis', 'Results'].map((step, index) => {
                    const stepProgress = (index + 1) * 25;
                    const isActive = progress >= stepProgress - 25;
                    const isCompleted = progress >= stepProgress;

                    return (
                      <div 
                        key={step}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                          isActive ? "bg-secondary/50" : "opacity-50"
                        )}
                      >
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          isCompleted ? "bg-primary" : "bg-secondary"
                        )} />
                        <span className={cn(
                          "text-sm",
                          isActive ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {step}
                        </span>
                        {isCompleted && <ChevronRight className="h-4 w-4 ml-auto text-primary" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {error && !loading && (
            <div 
              className="p-6 border rounded-lg space-y-4 text-center"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <div>
                <h4 className="font-semibold mb-1">Analysis Failed</h4>
                <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
              </div>
              <Button
                className="mt-4"
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