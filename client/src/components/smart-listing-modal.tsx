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
  const analysisInProgress = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    analysisInProgress.current = false;
    setLoading(false);
    setProgress(0);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!files.length || analysisInProgress.current) {
      return;
    }

    try {
      // Cleanup any existing analysis
      cleanupAnalysis();

      // Set up new analysis state
      analysisInProgress.current = true;
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setLoading(true);
      setError(null);
      setProgress(0);

      // Validate files
      const validationErrors: string[] = [];
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
      let totalSize = 0;

      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) return;

        const file = files[i];
        if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
          validationErrors.push(`File ${i + 1}: Invalid file type. Only JPEG, PNG, and WebP are supported.`);
        }
        if (file.size > 4 * 1024 * 1024) {
          validationErrors.push(`File ${i + 1}: File size exceeds 4MB limit.`);
        }
        totalSize += file.size;
        setProgress((i + 1) * 20 / files.length);
      }

      if (totalSize > MAX_TOTAL_SIZE) {
        validationErrors.push(`Total file size exceeds 10MB limit.`);
      }

      if (validationErrors.length > 0) {
        throw new Error(`Validation errors:\n${validationErrors.join('\n')}`);
      }

      if (signal.aborted) return;

      toast({
        title: "Analysis started",
        description: `Analyzing ${files.length} image${files.length > 1 ? 's' : ''}...`,
      });

      const analysis = await generateSmartListing(files);

      if (signal.aborted) return;

      setProgress(100);
      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully",
      });
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        setError('Analysis was cancelled');
      } else {
        console.error('Analysis error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to analyze';
        setError(errorMessage);

        toast({
          title: "Analysis failed",
          description: errorMessage,
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      cleanupAnalysis();
    }
  }, [files, onAnalysisComplete, onOpenChange, toast, cleanupAnalysis]);

  // Start analysis when modal opens
  useEffect(() => {
    if (open && files.length > 0 && !loading && !analysisInProgress.current) {
      // Add delay before starting analysis to prevent rapid retries
      analysisTimeoutRef.current = setTimeout(handleAnalyze, 500);
    }

    return cleanupAnalysis;
  }, [open, files, handleAnalyze, loading, cleanupAnalysis]);

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
        cleanupAnalysis();
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