import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { ROUTES } from "@/lib/routes";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading, error } = useAuth();

  // Handle loading state before route matching
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading your account...</p>
      </div>
    );
  }

  // Handle authentication errors
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <p className="text-sm text-destructive">Authentication error. Please try again.</p>
        <Redirect to={ROUTES.auth.path} />
      </div>
    );
  }

  // If not authenticated, redirect immediately
  if (!user) {
    return <Redirect to={ROUTES.auth.path} />;
  }

  // Only render the route if authenticated
  return (
    <Route path={path}>
      {() => <Component />}
    </Route>
  );
}