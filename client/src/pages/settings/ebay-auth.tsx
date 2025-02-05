import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { AlertCircle, CheckCircle2, RefreshCcw } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function EbayAuthSettings() {
  const { toast } = useToast();
  const [location] = useLocation();
  
  const { data: user } = useQuery({
    queryKey: ["/api/user"],
  });

  const isConnected = user?.ebayAuthToken && new Date(user.ebayTokenExpiry) > new Date();

  // Handle status messages from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const message = params.get('message');

    if (status === 'success') {
      toast({
        title: "Success",
        description: "Your eBay account has been connected successfully.",
      });
    } else if (status === 'error') {
      toast({
        title: "Connection Failed",
        description: message || "Failed to connect your eBay account. Please try again.",
        variant: "destructive",
      });
    }
  }, [location, toast]);

  const handleConnect = async () => {
    try {
      const response = await fetch("/api/ebay/auth-url", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Could not get eBay auth URL");
      }
      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error) {
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">eBay Integration Settings</h1>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">eBay Connection Status</h2>
                  {isConnected ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {isConnected ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Your eBay account is connected and active. Token expires: {' '}
                      {new Date(user.ebayTokenExpiry).toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleConnect}
                        className="gap-2"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Reconnect
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connect your eBay account to enable listing products and fetching market data directly from eBay.
                    </p>
                    <Button onClick={handleConnect} className="gap-2">
                      Connect eBay Account
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
