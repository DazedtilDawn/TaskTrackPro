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
  imageFiles: File[];
  onAnalysisComplete?: (analysis: any) => void;
}

// Error handling helper
const handleError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
};

export default function SmartListingModal({
  open,
  onOpenChange,
  imageFiles = [],
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

  // Validate image files
  const validateImages = useCallback((files: File[]) => {
    if (!files.length) {
      throw new Error('No images provided for analysis');
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        throw new Error(`Invalid file type: ${file.type}. Only images are allowed.`);
      }
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(`File ${file.name} is too large. Maximum size is 4MB.`);
      }
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!isMounted.current || analysisLock.current || !imageFiles?.length) return;

    try {
      analysisLock.current = true;
      setLoading(true);
      setError(null);
      setProgress(10);

      // Input validation
      validateImages(imageFiles);

      // Set up progress interval
      progressInterval.current = setInterval(() => {
        if (isMounted.current) {
          setProgress(prev => Math.min(prev + 5, 90));
        }
      }, 1000);

      const analysis = await generateSmartListing(imageFiles);
      if (!isMounted.current) return;

      setProgress(100);
      if (onAnalysisComplete) {
        onAnalysisComplete(analysis);
      }
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully",
      });
    } catch (err) {
      console.error('Analysis error:', err);
      if (isMounted.current) {
        const errorMessage = handleError(err);
        setError(errorMessage);
        toast({
          title: "Analysis failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      cleanup();
    }
  }, [imageFiles, onAnalysisComplete, onOpenChange, toast, cleanup, validateImages]);

  useEffect(() => {
    // Reset state when modal opens/closes
    if (!open) {
      cleanup();
    }

    // Start analysis with delay when modal opens with valid images
    if (open && imageFiles?.length && !analysisLock.current) {
      analysisTimeout.current = setTimeout(() => {
        if (isMounted.current) {
          runAnalysis();
        }
      }, 1000);
    }

    return cleanup;
  }, [open, imageFiles, runAnalysis, cleanup]);

  // Validate images when modal opens
  useEffect(() => {
    if (open && (!imageFiles?.length)) {
      onOpenChange(false);
      toast({
        title: "No images selected",
        description: "Please select at least one image to analyze",
        variant: "destructive",
      });
    }
  }, [open, imageFiles?.length, onOpenChange, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [cleanup]);

  const getStatusIcon = useCallback(() => {
    if (error) return <AlertCircle className="h-8 w-8 text-destructive" />;
    if (progress === 100) return <CheckCircle2 className="h-8 w-8 text-primary" />;
    return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
  }, [error, progress]);

  const getStatusMessage = useCallback(() => {
    if (error) return 'Analysis failed';
    if (progress < 20) return 'Validating images...';
    if (progress < 50) return 'Processing images...';
    if (progress < 80) return 'Analyzing content...';
    return 'Finalizing results...';
  }, [error, progress]);

  return (
    <Dialog 
      open={open} 
      onOpenChange={onOpenChange}
    >
      <DialogContent 
        className="max-w-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="dialog-title" className="flex items-center gap-2">
            <FileImage className="h-5 w-5" aria-hidden="true" />
            Smart Listing Analysis
          </DialogTitle>
          <DialogDescription id="dialog-description">
            {loading 
              ? `Analyzing ${imageFiles?.length} product image${imageFiles?.length !== 1 ? 's' : ''} with AI`
              : error 
                ? "Analysis encountered an error. Please try again."
                : "AI-powered analysis for optimizing your product listings"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6" role="status" aria-live="polite" aria-atomic="true">
          {loading && (
            <div className="relative p-6 bg-card rounded-lg border">
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
                  <Progress
                    value={progress}
                    className="h-2"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  />
                </div>

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
                        role="listitem"
                        aria-current={isActive ? "step" : undefined}
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
                        {isCompleted && (
                          <ChevronRight 
                            className="h-4 w-4 ml-auto text-primary"
                            aria-hidden="true"
                          />
                        )}
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
                aria-label="Retry analysis"
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