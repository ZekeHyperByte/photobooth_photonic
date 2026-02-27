-- Add version tracking columns to photos table for retake support
-- This enables unlimited retakes with versioned filenames

-- Add version column to track retake count (v1, v2, v3...)
ALTER TABLE photos ADD COLUMN version INTEGER DEFAULT 1;

-- Add is_retake flag to identify retaken photos
ALTER TABLE photos ADD COLUMN is_retake INTEGER DEFAULT 0;

-- Add retake_of_id for tracking parent photo relationship
ALTER TABLE photos ADD COLUMN retake_of_id TEXT;

-- Create index for faster retake lookups
CREATE INDEX IF NOT EXISTS idx_photos_retake_of_id ON photos(retake_of_id);

-- Update existing photos to have version 1
UPDATE photos SET version = 1 WHERE version IS NULL;
