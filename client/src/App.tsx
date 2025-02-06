import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { getFlattenedRoutes, ROUTES } from "./lib/routes";
import { ErrorBoundary } from "@/components/ui/error-boundary";

function Router() {
  const routes = getFlattenedRoutes();

  return (
    <Switch>
      {routes.map(route => {
        const RouteComponent = route.protected ? ProtectedRoute : Route;
        return (
          <RouteComponent
            key={route.path}
            path={route.path}
            component={route.component}
          />
        );
      })}
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;