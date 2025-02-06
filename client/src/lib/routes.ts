// Centralized route configuration
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Watchlist from "@/pages/watchlist";
import Orders from "@/pages/orders";
import Analytics from "@/pages/analytics";
import EbayAuthSettings from "@/pages/settings/ebay-auth";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";

type RouteConfig = {
  path: string;
  title: string;
  component: () => JSX.Element;
  protected?: boolean;
};

type NestedRoutes = {
  [K: string]: RouteConfig | NestedRoutes;
};

// Centralized route configuration
export const ROUTES = {
  dashboard: {
    path: "/",
    title: "Dashboard",
    component: Dashboard,
    protected: true
  },
  inventory: {
    path: "/inventory",
    title: "Products & Inventory",
    component: Inventory,
    protected: true
  },
  watchlist: {
    path: "/watchlist",
    title: "Price Watchlist",
    component: Watchlist,
    protected: true
  },
  orders: {
    path: "/orders",
    title: "Order Management",
    component: Orders,
    protected: true
  },
  analytics: {
    path: "/analytics",
    title: "Analytics & Insights",
    component: Analytics,
    protected: true
  },
  settings: {
    ebayAuth: {
      path: "/settings/ebay-auth",
      title: "eBay Settings",
      component: EbayAuthSettings,
      protected: true
    }
  },
  auth: {
    path: "/auth",
    title: "Authentication",
    component: AuthPage,
    protected: false
  },
  notFound: {
    path: "*",
    title: "Page Not Found",
    component: NotFound,
    protected: false
  }
} as const;

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

// Helper function to flatten nested routes
export function getFlattenedRoutes(routes: NestedRoutes = ROUTES): RouteConfig[] {
  const flattened: RouteConfig[] = [];

  const flatten = (routes: NestedRoutes) => {
    for (const key in routes) {
      const route = routes[key];
      if ('path' in route && 'component' in route) {
        flattened.push(route as RouteConfig);
      } else {
        flatten(route as NestedRoutes);
      }
    }
  };

  flatten(routes);
  return flattened;
}