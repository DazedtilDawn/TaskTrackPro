import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImagePlus, X, Upload, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  onImagesUploaded: (files: File[]) => void;
}

export default function ImageUpload({ onImagesUploaded }: ImageUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    // Create preview URLs
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...newPreviews]);
    setFiles(prev => [...prev, ...selectedFiles]);
    onImagesUploaded(selectedFiles);
  }, [onImagesUploaded]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    handleFileChange(selectedFiles);
  }, [handleFileChange]);

  const removeImage = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]); // Clean up the URL
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setFiles(prev => prev.filter((_, i) => i !== index));
    onImagesUploaded(files.filter((_, i) => i !== index));
  }, [files, previews, onImagesUploaded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileChange(droppedFiles);
  }, [handleFileChange]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {previews.map((preview, index) => (
          <Card key={preview} className="relative group overflow-hidden">
            <img
              src={preview}
              alt={`Preview ${index + 1}`}
              className="w-full h-32 object-cover rounded-lg transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removeImage(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </Card>
        ))}

        <div
          className={cn(
            "relative rounded-lg transition-all duration-200",
            isDragging && "ring-2 ring-primary ring-offset-2"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <Card className={cn(
            "flex flex-col items-center justify-center h-32 border-2 border-dashed transition-colors",
            isDragging ? "border-primary bg-primary/5" : "hover:border-primary",
            "cursor-pointer"
          )}>
            <div className="text-center p-4 space-y-2">
              {isDragging ? (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-primary animate-bounce" />
                  <p className="text-sm font-medium text-primary">Drop to Upload</p>
                </>
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Upload Product Images</p>
                    <p className="text-xs text-muted-foreground">
                      Drag & drop or click to browse
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {previews.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          <ImageIcon className="h-4 w-4 inline-block mr-1" />
          {previews.length} image{previews.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}