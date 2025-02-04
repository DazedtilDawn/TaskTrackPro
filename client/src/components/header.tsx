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
        return 'Inventory Management';
      case '/watchlist':
        return 'Product Watchlist';
      case '/orders':
        return 'Orders';
      case '/analytics':
        return 'Analytics';
      default:
        return 'Inventory Management';
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
    <header className="h-16 border-b border-border flex items-center justify-between px-6">
      <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span>{user?.username}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}