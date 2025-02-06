// Centralized route configuration
export const ROUTES = {
  dashboard: "/",
  inventory: "/inventory",
  watchlist: "/watchlist",
  orders: "/orders",
  analytics: "/analytics",
  settings: {
    ebayAuth: "/settings/ebay-auth"
  },
  auth: "/auth"
} as const;

// Type helper for route paths
export type RoutePath = typeof ROUTES[keyof typeof ROUTES] | typeof ROUTES.settings[keyof typeof ROUTES.settings];

// Helper function to generate route paths with parameters
export function generatePath(path: RoutePath, params?: Record<string, string>): string {
  if (!params) return path;
  
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(`:${key}`, value),
    path
  );
}
