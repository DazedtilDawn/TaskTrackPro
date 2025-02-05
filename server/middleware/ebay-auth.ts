import { Request, Response, NextFunction } from "express";

export function checkEbayAuth(req: Request, res: Response, next: NextFunction) {
  // Skip check if user is not authenticated
  if (!req.isAuthenticated()) {
    return next();
  }

  // Check if this is an eBay-related endpoint
  if (req.path.includes("/ebay") || req.path.includes("/generate-ebay-listing")) {
    if (!req.user?.ebayAuthToken || new Date(req.user.ebayTokenExpiry!) < new Date()) {
      return res.status(403).json({
        error: "eBay authentication required",
        details: "Please authenticate with eBay first",
        redirectTo: "/settings/ebay-auth"
      });
    }
  }

  next();
}
