import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Zod schemas for JSONB validation
export const marketAnalysisSchema = z.object({
  demandScore: z.number().min(0).max(10),
  competitionLevel: z.enum(['Low', 'Medium', 'High']),
  priceSuggestion: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
  }),
});

export const aiAnalysisSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  marketAnalysis: marketAnalysisSchema,
  seoKeywords: z.array(z.string()),
  suggestions: z.array(z.string()),
  ebayData: z.object({
    currentPrice: z.number().positive(),
    averagePrice: z.number().positive(),
    lowestPrice: z.number().positive(),
    highestPrice: z.number().positive(),
    soldCount: z.number().min(0),
    activeListing: z.number().min(0),
    recommendedPrice: z.number().positive(),
    lastUpdated: z.string().datetime().optional(),
  }).optional(),
});

export const ebayListingDataSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  description: z.string(),
  startPrice: z.number().positive(),
  buyItNowPrice: z.number().positive().optional(),
  quantity: z.number().min(0),
  condition: z.enum(['New', 'Open Box', 'Used - Like New', 'Used - Good', 'Used - Fair']),
  primaryCategory: z.object({
    categoryId: z.string(),
    categoryName: z.string(),
  }),
  listingDuration: z.string(),
  returnPolicy: z.object({
    returnsAccepted: z.boolean(),
    returnPeriod: z.string().optional(),
    returnShippingCostPaidBy: z.string().optional(),
  }),
  shippingDetails: z.object({
    shippingType: z.string(),
    shippingService: z.string(),
    shippingCost: z.number().min(0),
  }),
  status: z.enum(['Active', 'Ended', 'Completed', 'Cancelled']),
  lastUpdated: z.string().datetime(),
});

// Existing table definitions
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ebayAuthToken: text("ebay_auth_token"),
  ebayRefreshToken: text("ebay_refresh_token"),
  ebayTokenExpiry: timestamp("ebay_token_expiry"),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku").unique(),
  price: decimal("price", { precision: 10, scale: 2 }),
  quantity: integer("quantity").default(0).notNull(),
  imageUrl: text("image_url"),
  aiAnalysis: jsonb("ai_analysis"),
  ebayPrice: decimal("ebay_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sold: boolean("sold").default(false).notNull(),
  condition: text("condition").default("used_good").notNull(),
  brand: text("brand"),
  category: text("category"),
  weight: decimal("weight", { precision: 10, scale: 2 }),
  dimensions: text("dimensions"),
  ebayListingId: text("ebay_listing_id"),
  ebayListingStatus: text("ebay_listing_status"),
  ebayListingUrl: text("ebay_listing_url"),
  ebayListingData: jsonb("ebay_listing_data"),
  ebayLastSync: timestamp("ebay_last_sync"),
  ebayCategoryId: text("ebay_category_id"),
  listedAt: timestamp("listed_at"),
  soldAt: timestamp("sold_at"),
});

export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userProductUnique: unique().on(table.userId, table.productId)
}));

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status").default("pending").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ebayOrderId: text("ebay_order_id"),
  ebayOrderData: jsonb("ebay_order_data"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ebayCategories = pgTable("ebay_categories", {
  id: serial("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  level: integer("level").notNull(),
  parentId: text("parent_id"),
  leafCategory: boolean("leaf_category").default(false).notNull(),
  lastUpdate: timestamp("last_update").defaultNow().notNull(),
});

// Relations configuration
export const productsRelations = relations(products, ({ one }) => ({
  user: one(users, {
    fields: [products.userId],
    references: [users.id],
  }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(users, {
    fields: [watchlist.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [watchlist.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

// Export schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertProductSchema = createInsertSchema(products, {
  aiAnalysis: aiAnalysisSchema,
  ebayListingData: ebayListingDataSchema,
});
export const selectProductSchema = createSelectSchema(products, {
  aiAnalysis: aiAnalysisSchema,
  ebayListingData: ebayListingDataSchema,
});
export const insertWatchlistSchema = createInsertSchema(watchlist);
export const selectWatchlistSchema = createSelectSchema(watchlist);
export const insertOrderSchema = createInsertSchema(orders);
export const selectOrderSchema = createSelectSchema(orders);
export const insertEbayCategorySchema = createInsertSchema(ebayCategories);
export const selectEbayCategorySchema = createSelectSchema(ebayCategories);

// Add login credentials schema
export const loginCredentialsSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must not exceed 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  password: z.string()
    .min(4, "Password must be at least 4 characters")
    .max(100, "Password must not exceed 100 characters")
});

export type LoginCredentials = z.infer<typeof loginCredentialsSchema>;