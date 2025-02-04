import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut } from "lucide-react";
import { useLocation } from "wouter";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  const getPageTitle = () => {
    switch (location) {
      case '/':
        return 'Dashboard';
      case '/inventory':
        return 'Products & Inventory';
      case '/watchlist':
        return 'Price Watchlist';
      case '/orders':
        return 'Order Management';
      case '/analytics':
        return 'Analytics & Insights';
      default:
        // Extract last part of path for dynamic routes
        const pathSegments = location.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
    }
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Logged out successfully",
          description: "See you next time!",
        });
      },
    });
  };

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex items-center justify-between px-6">
      <h1 className="text-xl font-semibold text-primary">{getPageTitle()}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">{user?.username}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}