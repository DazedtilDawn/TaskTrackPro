-- Create GiST indexes for JSONB fields to improve query performance
CREATE INDEX IF NOT EXISTS idx_products_ai_analysis_category 
ON products USING gin ((ai_analysis->'category'));

CREATE INDEX IF NOT EXISTS idx_products_ai_analysis_market 
ON products USING gin ((ai_analysis->'marketAnalysis'));

CREATE INDEX IF NOT EXISTS idx_products_ebay_listing_status 
ON products USING gin ((ebay_listing_data->'status'));

CREATE INDEX IF NOT EXISTS idx_products_ebay_listing_prices 
ON products USING gin ((ebay_listing_data->'buyItNowPrice'), (ebay_listing_data->'startPrice'));

-- Add a check constraint to ensure ai_analysis follows the expected structure
ALTER TABLE products ADD CONSTRAINT check_ai_analysis_structure
CHECK (
  (ai_analysis IS NULL) OR (
    jsonb_typeof(ai_analysis->'marketAnalysis') = 'object' AND
    jsonb_typeof(ai_analysis->'seoKeywords') = 'array' AND
    jsonb_typeof(ai_analysis->'suggestions') = 'array'
  )
);

-- Add a check constraint to ensure ebay_listing_data follows the expected structure
ALTER TABLE products ADD CONSTRAINT check_ebay_listing_structure
CHECK (
  (ebay_listing_data IS NULL) OR (
    jsonb_typeof(ebay_listing_data->'listingId') = 'string' AND
    jsonb_typeof(ebay_listing_data->'status') = 'string' AND
    jsonb_typeof(ebay_listing_data->'primaryCategory') = 'object'
  )
);
