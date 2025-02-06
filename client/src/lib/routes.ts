// Centralized route configuration
export const ROUTES = {
  dashboard: {
    path: "/",
    title: "Dashboard"
  },
  inventory: {
    path: "/inventory",
    title: "Products & Inventory"
  },
  watchlist: {
    path: "/watchlist",
    title: "Price Watchlist"
  },
  orders: {
    path: "/orders",
    title: "Order Management"
  },
  analytics: {
    path: "/analytics",
    title: "Analytics & Insights"
  },
  settings: {
    ebayAuth: {
      path: "/settings/ebay-auth",
      title: "eBay Settings"
    }
  },
  auth: {
    path: "/auth",
    title: "Authentication"
  }
} as const;

// Helper types for route paths and metadata
type RouteConfig = {
  path: string;
  title: string;
};

type NestedRoutes = {
  [K: string]: RouteConfig | NestedRoutes;
};

// Extract all possible route paths from the ROUTES object
type ExtractRoutePaths<T> = T extends { path: string }
  ? T["path"]
  : T extends object
  ? ExtractRoutePaths<T[keyof T]>
  : never;

export type RoutePath = ExtractRoutePaths<typeof ROUTES>;

// Helper function to get route title by path
export function getRouteTitle(path: string): string {
  // Remove trailing slash if present
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

  // Helper function to search nested routes
  const findRouteTitle = (routes: NestedRoutes): string | undefined => {
    for (const key in routes) {
      const route = routes[key];
      if (typeof route === 'object') {
        if ('path' in route && route.path === normalizedPath) {
          return route.title;
        } else {
          const nestedResult = findRouteTitle(route as NestedRoutes);
          if (nestedResult) return nestedResult;
        }
      }
    }
    return undefined;
  };

  const title = findRouteTitle(ROUTES);
  if (title) return title;

  // Fallback: Format the last segment of the path
  const lastSegment = normalizedPath.split('/').pop() || '';
  return lastSegment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to get path from route config
export function getRoutePath(route: keyof typeof ROUTES): string {
  const config = ROUTES[route];
  if ('path' in config) {
    return config.path;
  }
  throw new Error(`Invalid route: ${route}`);
}

// Helper function to generate route paths with parameters
export function generatePath(route: keyof typeof ROUTES, params?: Record<string, string>): string {
  const path = getRoutePath(route);
  if (!params) return path;

  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(`:${key}`, value),
    path
  );
}