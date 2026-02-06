-- Migration: Add payment provider support
-- Adds provider column and renames midtrans_response to provider_response

-- Add provider column to transactions table
ALTER TABLE transactions ADD COLUMN provider TEXT DEFAULT 'mock';

-- Update existing records to use 'midtrans' as provider (backwards compatibility)
UPDATE transactions SET provider = 'midtrans' WHERE midtrans_response IS NOT NULL;

-- Note: SQLite doesn't support renaming columns directly
-- The midtrans_response column will be kept for backwards compatibility
-- New records will use provider_response

-- Add provider_response column (new generic column)
ALTER TABLE transactions ADD COLUMN provider_response TEXT;

-- Copy data from midtrans_response to provider_response
UPDATE transactions SET provider_response = midtrans_response WHERE midtrans_response IS NOT NULL;
