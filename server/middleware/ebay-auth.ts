import { Request, Response, NextFunction } from "express";

export function checkEbayAuth(req: Request, res: Response, next: NextFunction) {
  console.log(`[eBay Auth] Checking auth for path: ${req.path}`);
  console.log(`[eBay Auth] User authenticated:`, req.isAuthenticated());

  // Skip check if user is not authenticated
  if (!req.isAuthenticated()) {
    console.log(`[eBay Auth] User not authenticated, returning 401`);
    return res.status(401).json({ error: "Authentication required" });
  }

  // If this is the auth URL endpoint, skip the token check
  if (req.path === "/api/ebay/auth-url") {
    console.log("[eBay Auth] Skipping token check for auth URL endpoint");
    return next();
  }

  // Check if this is an eBay-related endpoint
  if (req.path.includes("/ebay") || req.path.includes("/generate-ebay-listing")) {
    console.log(`[eBay Auth] eBay-related endpoint detected`);
    console.log(`[eBay Auth] User eBay token:`, req.user?.ebayAuthToken ? 'Present' : 'Missing');
    console.log(`[eBay Auth] Token expiry:`, req.user?.ebayTokenExpiry);

    // Skip token check for callback endpoint
    if (req.path === "/api/ebay/callback") {
      console.log("[eBay Auth] Skipping token check for callback endpoint");
      return next();
    }

    if (!req.user?.ebayAuthToken || new Date(req.user.ebayTokenExpiry!) < new Date()) {
      console.log(`[eBay Auth] Invalid or expired eBay token, returning 403`);
      return res.status(403).json({
        error: "eBay authentication required",
        details: "Please authenticate with eBay first",
        redirectTo: "/settings/ebay-auth"
      });
    }
    console.log(`[eBay Auth] Valid eBay token found, proceeding`);
  } else {
    console.log(`[eBay Auth] Non-eBay endpoint, skipping check`);
  }

  next();
}