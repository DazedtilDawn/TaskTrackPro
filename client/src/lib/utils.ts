import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper function to get image URL
export function getImageUrl(imageUrl: string | null): string | undefined {
  if (!imageUrl) return undefined;
  // Remove any duplicate '/uploads/' in the path
  const cleanPath = imageUrl.replace(/^\/uploads\/+/, '');
  return imageUrl.startsWith('http') ? imageUrl : `/uploads/${cleanPath}`;
}