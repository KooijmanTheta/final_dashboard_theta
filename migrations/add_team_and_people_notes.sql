-- Migration: Add people_id to notes table and create team assessments table
-- Run this migration to enable notes for people and team assessments

-- ============================================
-- 1. Add people_id column to notes table
-- ============================================
ALTER TABLE notes.notes_db ADD COLUMN IF NOT EXISTS people_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notes_people_id ON notes.notes_db(people_id);

-- ============================================
-- 2. Create team assessments table
-- ============================================
-- This table stores analyst assessments for team reviews
-- (Gaps in Team, Key Person Risk, Time Allocation notes)

CREATE TABLE IF NOT EXISTS at_tables.at_team_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id TEXT NOT NULL,
  date_of_review DATE NOT NULL,
  gaps_in_team TEXT,
  key_person_risk TEXT,
  time_allocation_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fund_id, date_of_review)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_assessments_fund_id ON at_tables.at_team_assessments(fund_id);
CREATE INDEX IF NOT EXISTS idx_team_assessments_date ON at_tables.at_team_assessments(date_of_review);

-- ============================================
-- 3. Verify the changes
-- ============================================
-- Check that people_id column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'notes'
  AND table_name = 'notes_db'
  AND column_name = 'people_id';

-- Check that team assessments table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'at_tables'
  AND table_name = 'at_team_assessments';

-- ============================================
-- Done! You can now:
-- - Add notes to people in the People Card
-- - Save analyst assessments on the Team page
-- ============================================
