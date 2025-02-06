import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Function to get CSRF token
async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/csrf-token', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch CSRF token');
  }
  const data = await response.json();
  return data.csrfToken;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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

  // Add CSRF token for state-changing requests
  if (method !== 'GET') {
    const csrfToken = await getCsrfToken();
    headers['CSRF-Token'] = csrfToken;
  }

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

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});