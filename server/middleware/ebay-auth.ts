import { Request, Response, NextFunction } from "express";
import { refreshEbayToken } from "../lib/ebay";

export async function checkEbayAuth(req: Request, res: Response, next: NextFunction) {
  console.log(`[eBay Auth] Checking auth for path: ${req.path}`);
  console.log(`[eBay Auth] User authenticated:`, req.isAuthenticated());
  console.log(`[eBay Auth] Query params:`, req.query);

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

  // Skip token check for callback endpoint
  if (req.path === "/api/ebay/callback") {
    console.log("[eBay Auth] Skipping token check for callback endpoint");
    return next();
  }

  // Check if this is an eBay-related endpoint
  if (req.path.includes("/ebay") || req.path.includes("/generate-ebay-listing")) {
    console.log(`[eBay Auth] eBay-related endpoint detected`);
    console.log(`[eBay Auth] User eBay token:`, req.user?.ebayAuthToken ? 'Present' : 'Missing');
    console.log(`[eBay Auth] Token expiry:`, req.user?.ebayTokenExpiry);

    // If no token exists or token is expired, try to refresh
    if (!req.user?.ebayAuthToken || new Date(req.user.ebayTokenExpiry!) < new Date()) {
      console.log(`[eBay Auth] Token missing or expired, attempting refresh`);

      // Only attempt refresh if we have a refresh token
      if (req.user?.ebayRefreshToken) {
        try {
          console.log("[eBay Auth] Token refresh started");
          const { accessToken, expiryDate } = await refreshEbayToken(req.user);

          // Update session with new token data
          req.user.ebayAuthToken = accessToken;
          req.user.ebayTokenExpiry = expiryDate;

          console.log("[eBay Auth] Token refresh successful");
          return next();
        } catch (error) {
          console.error("[eBay Auth] Token refresh failed:", error);
          return res.status(403).json({
            error: "eBay authentication required",
            details: "Please authenticate with eBay first",
            redirectTo: "/settings/ebay-auth"
          });
        }
      } else {
        console.log("[eBay Auth] No refresh token available");
        return res.status(403).json({
          error: "eBay authentication required",
          details: "Please authenticate with eBay first",
          redirectTo: "/settings/ebay-auth"
        });
      }
    }

    console.log(`[eBay Auth] Valid eBay token found, proceeding`);
  }

  next();
}