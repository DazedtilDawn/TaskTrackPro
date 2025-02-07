-- Add new columns for cost tracking and supplier information
ALTER TABLE "products" 
ADD COLUMN IF NOT EXISTS "purchase_price" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "supplier" TEXT,
ADD COLUMN IF NOT EXISTS "supplier_url" TEXT,
ADD COLUMN IF NOT EXISTS "purchase_date" TIMESTAMP;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);
CREATE INDEX IF NOT EXISTS idx_products_purchase_date ON products(purchase_date);
