import React from "react";
import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "./button";
import { ROUTES } from "@/lib/routes";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to your error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false })} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  const [_, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center space-y-2">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            {error?.message || "An unexpected error occurred"}
          </p>
        </div>
        
        <div className="flex flex-col space-y-2">
          <Button 
            onClick={() => {
              onReset();
              window.location.reload();
            }}
            variant="outline"
            className="w-full"
          >
            Try again
          </Button>
          
          <Button
            onClick={() => {
              onReset();
              setLocation(ROUTES.dashboard.path);
            }}
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>

        {error && (
          <pre className="mt-4 p-4 bg-muted rounded-lg text-xs overflow-auto max-h-48">
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
