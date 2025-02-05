import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Try to extract error message from response JSON first
    let errorMessage;
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorData.error;
    } catch {
      // If JSON parsing fails, fallback to text or statusText
      errorMessage = await res.text() || res.statusText;
    }

    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isFormData = data instanceof FormData;
  const headers: Record<string, string> = {};

  // Only set Content-Type for JSON data, let browser handle it for FormData
  if (data && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // Always include credentials for CORS
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    // Handle 401 based on specified behavior
    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw new Error("Unauthorized access. Please log in.");
    }

    await throwIfResNotOk(res);

    // For 204 No Content, return null instead of trying to parse JSON
    if (res.status === 204) {
      return null;
    }

    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Disable automatic refetching
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Prevent unnecessary re-fetches
      staleTime: Infinity,
      // Disable automatic retries
      retry: false,
      // Add better error handling
      useErrorBoundary: true,
    },
    mutations: {
      // Disable automatic retries for mutations
      retry: false,
      // Add better error handling
      useErrorBoundary: true,
    },
  },
});