-- Notes System Migration Script
-- Run this script against your PostgreSQL database to create the notes schema

-- ============================================
-- Step 1: Create the notes schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS notes;

-- ============================================
-- Step 2: Create note_entities table
-- Defines all entities that can have notes attached
-- ============================================
CREATE TABLE IF NOT EXISTS notes.note_entities (
  entity_id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,  -- 'section', 'page', 'fund_manager', 'vehicle', 'project', 'row', 'tbv_fund'
  entity_code VARCHAR(100) NOT NULL, -- e.g., 'general', 'overview', 'historical_changes'
  display_name VARCHAR(255) NOT NULL,
  parent_entity_id INT REFERENCES notes.note_entities(entity_id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(entity_type, entity_code)
);

-- ============================================
-- Step 3: Create notes_db table
-- Main notes storage with stable identifier linking
-- ============================================
CREATE TABLE IF NOT EXISTS notes.notes_db (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity linking (use record_ids for stability)
  entity_type VARCHAR(50) NOT NULL,           -- 'section', 'page', 'fund_manager', 'vehicle', 'project', 'row', 'tbv_fund'
  entity_code VARCHAR(100),                   -- For sections/pages: 'general', 'overview', etc.

  -- Airtable record_ids (stable identifiers)
  record_id_fund_manager VARCHAR(50),         -- recXXXXXXXXXXXXXX format
  record_id_vehicle VARCHAR(50),              -- recXXXXXXXXXXXXXX format
  record_id_project VARCHAR(50),              -- recXXXXXXXXXXXXXX format
  tbv_fund VARCHAR(20),                       -- 'TBV1', 'TBV2', etc.

  -- Context identifiers (for display/filtering, may change)
  fund_manager_id VARCHAR(255),
  vehicle_id VARCHAR(255),
  project_id VARCHAR(255),

  -- Row-level linking (for Historical Changes, etc.)
  row_identifier JSONB,                       -- { "period": "2024", "period_type": "Yearly" }

  -- Review context
  date_of_review DATE NOT NULL,

  -- Note content
  category VARCHAR(50) NOT NULL,              -- One of 10 categories
  note_text TEXT NOT NULL,

  -- Metadata
  author VARCHAR(255) NOT NULL,
  date_created TIMESTAMP DEFAULT NOW(),
  date_modified TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by VARCHAR(255),

  -- Category constraint
  CONSTRAINT valid_category CHECK (category IN (
    'action_item', 'observation', 'conclusion', 'risk_flag', 'follow_up',
    'question', 'positive_signal', 'update', 'reference', 'internal'
  ))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes.notes_db(entity_type, entity_code);
CREATE INDEX IF NOT EXISTS idx_notes_record_project ON notes.notes_db(record_id_project);
CREATE INDEX IF NOT EXISTS idx_notes_record_vehicle ON notes.notes_db(record_id_vehicle);
CREATE INDEX IF NOT EXISTS idx_notes_record_manager ON notes.notes_db(record_id_fund_manager);
CREATE INDEX IF NOT EXISTS idx_notes_date_review ON notes.notes_db(date_of_review);
CREATE INDEX IF NOT EXISTS idx_notes_not_deleted ON notes.notes_db(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_notes_tbv_fund ON notes.notes_db(tbv_fund);
CREATE INDEX IF NOT EXISTS idx_notes_vehicle_id ON notes.notes_db(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes.notes_db(project_id);

-- ============================================
-- Step 4: Create note_versions table
-- Version history for all note edits
-- ============================================
CREATE TABLE IF NOT EXISTS notes.note_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes.notes_db(note_id) ON DELETE CASCADE,
  version_number INT NOT NULL,

  -- Snapshot of note at this version
  category VARCHAR(50) NOT NULL,
  note_text TEXT NOT NULL,

  -- Change metadata
  modified_by VARCHAR(255) NOT NULL,
  modified_at TIMESTAMP DEFAULT NOW(),
  change_reason VARCHAR(255),                 -- Optional: why the edit was made

  UNIQUE(note_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_note ON notes.note_versions(note_id);

-- ============================================
-- Step 5: Create record_id_mapping table
-- Maps current business IDs to stable Airtable record_ids
-- ============================================
CREATE TABLE IF NOT EXISTS notes.record_id_mapping (
  mapping_id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,           -- 'fund_manager', 'vehicle', 'project'
  record_id VARCHAR(50) NOT NULL,             -- Airtable recXXXXXXXXXXXXXX
  current_business_id VARCHAR(255) NOT NULL,  -- Current vehicle_id, project_id, etc.
  display_name VARCHAR(255),
  last_updated TIMESTAMP DEFAULT NOW(),

  UNIQUE(entity_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_mapping_business ON notes.record_id_mapping(entity_type, current_business_id);
CREATE INDEX IF NOT EXISTS idx_mapping_record_id ON notes.record_id_mapping(record_id);

-- ============================================
-- Step 6: Populate initial note_entities
-- ============================================
INSERT INTO notes.note_entities (entity_type, entity_code, display_name) VALUES
  -- Page-level entities
  ('page', 'fund_monitoring', 'Fund Monitoring'),
  ('page', 'homepage', 'Homepage'),
  ('page', 'idd', 'Investment Due Diligence'),
  ('page', 'odd', 'Operational Due Diligence'),

  -- Section-level entities (Fund Monitoring sub-pages)
  ('section', 'general', 'General'),
  ('section', 'overview', 'Overview'),
  ('section', 'historical_changes', 'Historical Changes'),

  -- Special entity types (these are populated dynamically)
  ('fund_manager', '_dynamic', 'Fund Manager (Dynamic)'),
  ('vehicle', '_dynamic', 'Vehicle (Dynamic)'),
  ('project', '_dynamic', 'Project (Dynamic)'),
  ('tbv_fund', '_dynamic', 'TBV Fund (Dynamic)'),
  ('row', '_dynamic', 'Row (Dynamic)')
ON CONFLICT (entity_type, entity_code) DO NOTHING;

-- ============================================
-- Step 7: Populate record_id_mapping from existing Airtable tables
-- NOTE: PLACEHOLDER - Run these after adding record_id columns to at_tables
-- ============================================

-- TODO: Populate project mappings (after adding record_id_project to at_project_universe_db)
-- INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
-- SELECT 'project', record_id_project, project_id, project_id
-- FROM at_tables.at_project_universe_db
-- WHERE record_id_project IS NOT NULL
--   AND record_id_project != ''
-- ON CONFLICT (entity_type, record_id) DO UPDATE SET
--   current_business_id = EXCLUDED.current_business_id,
--   display_name = EXCLUDED.display_name,
--   last_updated = NOW();

-- TODO: Populate vehicle mappings (after adding record_id_vehicle to at_vehicle_universe_db)
-- INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
-- SELECT 'vehicle', record_id_vehicle, vehicle_id, vehicle_id
-- FROM at_tables.at_vehicle_universe_db
-- WHERE record_id_vehicle IS NOT NULL
--   AND record_id_vehicle != ''
-- ON CONFLICT (entity_type, record_id) DO UPDATE SET
--   current_business_id = EXCLUDED.current_business_id,
--   display_name = EXCLUDED.display_name,
--   last_updated = NOW();

-- TODO: Populate fund manager mappings (after adding record_id to at_fund_universe_db)
-- INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
-- SELECT 'fund_manager', record_id, fund_id, fund_id
-- FROM at_tables.at_fund_universe_db
-- WHERE record_id IS NOT NULL
--   AND record_id != ''
-- ON CONFLICT (entity_type, record_id) DO UPDATE SET
--   current_business_id = EXCLUDED.current_business_id,
--   display_name = EXCLUDED.display_name,
--   last_updated = NOW();

-- ============================================
-- Step 8: Create helper functions
-- ============================================

-- Function to get record_id for a project_id
CREATE OR REPLACE FUNCTION notes.get_record_id_for_project(p_project_id VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN (
    SELECT record_id
    FROM notes.record_id_mapping
    WHERE entity_type = 'project'
      AND current_business_id = p_project_id
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get record_id for a vehicle_id
CREATE OR REPLACE FUNCTION notes.get_record_id_for_vehicle(p_vehicle_id VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN (
    SELECT record_id
    FROM notes.record_id_mapping
    WHERE entity_type = 'vehicle'
      AND current_business_id = p_vehicle_id
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Function to refresh all record_id mappings
-- TODO: Update this function after adding record_id columns to at_tables
CREATE OR REPLACE FUNCTION notes.refresh_record_id_mappings()
RETURNS void AS $$
BEGIN
  -- Placeholder: Add refresh logic after record_id columns exist
  -- Example for projects:
  -- INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
  -- SELECT 'project', record_id_project, project_id, project_id
  -- FROM at_tables.at_project_universe_db
  -- WHERE record_id_project IS NOT NULL
  --   AND record_id_project != ''
  -- ON CONFLICT (entity_type, record_id) DO UPDATE SET
  --   current_business_id = EXCLUDED.current_business_id,
  --   display_name = EXCLUDED.display_name,
  --   last_updated = NOW();
  NULL; -- Placeholder
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Migration complete!
-- ============================================
