import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import type { User } from "express";

export async function refreshEbayToken(user: User) {
  const refreshToken = user.ebayRefreshToken;
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  console.log("[eBay Token Refresh] Starting token refresh for user:", user.id);

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(
        `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
      ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.marketing',
        'https://api.ebay.com/oauth/api_scope/sell.account'
      ].join(' '),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[eBay Token Refresh] Failed to refresh token:", errorText);
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json();
  console.log("[eBay Token Refresh] Received new token data");

  const expiryDate = new Date();
  expiryDate.setSeconds(expiryDate.getSeconds() + tokenData.expires_in);

  // Update the user record in DB
  console.log("[eBay Token Refresh] Updating user token data");
  await db.update(users)
    .set({
      ebayAuthToken: tokenData.access_token,
      ebayTokenExpiry: expiryDate,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { 
    accessToken: tokenData.access_token, 
    expiryDate 
  };
}
