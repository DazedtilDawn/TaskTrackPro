import { Request, Response, NextFunction } from "express";

// Constants for token refresh
const TOKEN_REFRESH_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export function checkEbayAuth(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.path;
  console.log(`[eBay Auth] Checking auth for path: ${requestPath}`);
  console.log(`[eBay Auth] User authenticated:`, req.isAuthenticated());

  // Skip check if user is not authenticated
  if (!req.isAuthenticated()) {
    console.log(`[eBay Auth] User not authenticated, returning 401`);
    return res.status(401).json({ 
      error: "Authentication required",
      details: "Please log in to access this resource"
    });
  }

  // If this is the auth URL endpoint, skip the token check
  if (requestPath === "/api/ebay/auth-url") {
    console.log("[eBay Auth] Skipping token check for auth URL endpoint");
    return next();
  }

  // Check if this is an eBay-related endpoint
  if (requestPath.includes("/ebay") || requestPath.includes("/generate-ebay-listing")) {
    console.log(`[eBay Auth] eBay-related endpoint detected`);

    // Log token state
    const tokenPresent = !!req.user?.ebayAuthToken;
    const tokenExpiry = req.user?.ebayTokenExpiry ? new Date(req.user.ebayTokenExpiry) : null;
    const currentTime = new Date();

    console.log(`[eBay Auth] Token status:`, {
      present: tokenPresent ? 'Yes' : 'No',
      expiry: tokenExpiry?.toISOString(),
      isExpired: tokenExpiry ? tokenExpiry < currentTime : true,
      timeUntilExpiry: tokenExpiry ? tokenExpiry.getTime() - currentTime.getTime() : 'N/A'
    });

    // Skip token check for callback endpoint
    if (requestPath === "/api/ebay/callback") {
      console.log("[eBay Auth] Skipping token check for callback endpoint");
      return next();
    }

    // Check token presence and validity
    if (!tokenPresent || !tokenExpiry) {
      console.log(`[eBay Auth] Missing eBay token or expiry, returning 403`);
      return res.status(403).json({
        error: "eBay authentication required",
        details: "Missing eBay authentication token",
        redirectTo: "/settings/ebay-auth"
      });
    }

    // Check if token is expired or near expiration
    const timeUntilExpiry = tokenExpiry.getTime() - currentTime.getTime();

    if (timeUntilExpiry <= 0) {
      console.log(`[eBay Auth] Token expired, returning 403`);
      return res.status(403).json({
        error: "eBay authentication required",
        details: "eBay token has expired",
        redirectTo: "/settings/ebay-auth"
      });
    }

    // If token is close to expiration (within refresh window)
    if (timeUntilExpiry <= TOKEN_REFRESH_WINDOW) {
      console.log(`[eBay Auth] Token near expiry (${Math.floor(timeUntilExpiry / 3600000)} hours remaining)`);
      // We could implement token refresh here in the future
      // For now, we'll just log it and let the request proceed
    }

    console.log(`[eBay Auth] Valid eBay token found, proceeding`);
  } else {
    console.log(`[eBay Auth] Non-eBay endpoint, skipping check`);
  }

  next();
}