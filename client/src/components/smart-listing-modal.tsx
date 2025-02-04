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

  const handleAnalyze = useCallback(async () => {
    if (!files.length || analysisInProgress.current) return;

    // Create new AbortController for this analysis
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      analysisInProgress.current = true;
      setLoading(true);
      setError(null);
      setProgress(0);

      // Validate files in a non-blocking way
      await new Promise(resolve => setTimeout(resolve, 0));

      const validationErrors: string[] = [];
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total
      let totalSize = 0;

      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) throw new Error('Analysis cancelled');

        const file = files[i];
        // Check file type
        if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
          validationErrors.push(`File ${i + 1}: Invalid file type. Only JPEG, PNG, and WebP are supported.`);
        }

        // Check individual file size
        if (file.size > 4 * 1024 * 1024) {
          validationErrors.push(`File ${i + 1}: File size exceeds 4MB limit.`);
        }

        totalSize += file.size;

        // Update progress for validation phase
        setProgress((i + 1) * 20 / files.length); // First 20% for validation

        // Yield to main thread periodically
        if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (signal.aborted) throw new Error('Analysis cancelled');

      // Check total size
      if (totalSize > MAX_TOTAL_SIZE) {
        validationErrors.push(`Total file size exceeds 10MB limit.`);
      }

      if (validationErrors.length > 0) {
        throw new Error(`Validation errors:\n${validationErrors.join('\n')}`);
      }

      console.log('Starting analysis with files:', files.length);
      toast({
        title: "Analysis started",
        description: `Analyzing ${files.length} image${files.length > 1 ? 's' : ''}...`,
      });

      // Start analysis with progress updates
      const analysis = await generateSmartListing(files);

      if (signal.aborted) throw new Error('Analysis cancelled');

      console.log('Analysis completed:', analysis);

      if (!analysis) {
        throw new Error('Analysis failed to generate results');
      }

      setProgress(100);
      onAnalysisComplete(analysis);
      onOpenChange(false);

      toast({
        title: "Analysis complete",
        description: "Product details have been analyzed successfully",
      });
    } catch (err) {
      if (signal.aborted) {
        setError('Analysis was cancelled');
        toast({
          title: "Analysis cancelled",
          description: "The analysis process was cancelled",
          variant: "destructive",
        });
      } else {
        console.error('Analysis error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to analyze product';
        setError(errorMessage);

        toast({
          title: "Analysis failed",
          description: errorMessage,
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
      analysisInProgress.current = false;
      abortControllerRef.current = null;
      setProgress(0);
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

  // Add cleanup function
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Button
                variant="outline"
                onClick={handleCancel}
                className="mt-4"
                size="sm"
              >
                Cancel
              </Button>
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