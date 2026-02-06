-- Migration: Add project_update_id to notes_db for per-update notes
-- This migration adds support for linking notes to specific project updates
-- from at_tables.at_processed_notes

-- ============================================
-- Step 1: Add nullable project_update_id column to notes_db
-- References at_processed_notes.id (stored as TEXT to match IDs)
-- ============================================
ALTER TABLE notes.notes_db
ADD COLUMN IF NOT EXISTS project_update_id VARCHAR(50) DEFAULT NULL;

-- ============================================
-- Step 2: Create index for efficient per-update queries
-- Supports queries WHERE project_update_id = X
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notes_project_update_id
ON notes.notes_db(project_update_id)
WHERE project_update_id IS NOT NULL;

-- ============================================
-- Step 3: Create partial index for general notes (backward compatibility)
-- Supports queries WHERE project_update_id IS NULL
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notes_project_general
ON notes.notes_db(project_id, record_id_project)
WHERE project_update_id IS NULL AND is_deleted = FALSE;

-- ============================================
-- Step 4: Add comment for documentation
-- ============================================
COMMENT ON COLUMN notes.notes_db.project_update_id IS
'References at_tables.at_processed_notes.id. NULL indicates a general project note (not tied to a specific update).';

-- ============================================
-- Migration complete!
--
-- Backward compatibility notes:
-- - All existing notes have project_update_id = NULL (general notes)
-- - getNotesForProject() continues to work unchanged
-- - New getGeneralNotesForProject() filters WHERE project_update_id IS NULL
-- - New getNotesForProjectUpdate() filters WHERE project_update_id = X
-- ============================================
