import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImagePlus, X } from "lucide-react";

interface ImageUploadProps {
  onImagesUploaded: (files: File[]) => void;
}

export default function ImageUpload({ onImagesUploaded }: ImageUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    // Create preview URLs
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...newPreviews]);
    setFiles(prev => [...prev, ...selectedFiles]);
    onImagesUploaded(selectedFiles);
  }, [onImagesUploaded]);

  const removeImage = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]); // Clean up the URL
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setFiles(prev => prev.filter((_, i) => i !== index));
    onImagesUploaded(files.filter((_, i) => i !== index));
  }, [files, previews, onImagesUploaded]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {previews.map((preview, index) => (
          <Card key={preview} className="relative group">
            <img
              src={preview}
              alt={`Preview ${index + 1}`}
              className="w-full h-32 object-cover rounded-lg"
            />
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
        <label className="cursor-pointer">
          <Card className="flex items-center justify-center h-32 border-2 border-dashed hover:border-primary transition-colors">
            <div className="text-center p-4">
              <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload Images</p>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </Card>
        </label>
      </div>
    </div>
  );
}
