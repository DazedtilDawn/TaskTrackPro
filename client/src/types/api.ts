// API Response Types
export interface Product {
  id: number;
  name: string;
  price: number;
  quantity: number;
  aiAnalysis?: {
    category?: string;
    suggestedPrice?: number;
  };
  createdAt: string;
}

export interface Order {
  id: number;
  total: number;
  createdAt: string;
  status: string;
}

export interface WatchlistItem {
  id: number;
  productId: number;
  userId: number;
  createdAt: string;
}

// API Response Wrappers
export type ApiResponse<T> = {
  data: T;
  error?: string;
};
