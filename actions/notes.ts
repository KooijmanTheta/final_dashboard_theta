'use server';

import sql from '@/lib/db';
import { NoteCategory } from '@/lib/note-categories';

// ============================================
// TypeScript Interfaces
// ============================================

export type EntityType = 'section' | 'page' | 'fund_manager' | 'vehicle' | 'project' | 'row' | 'tbv_fund' | 'person';

export interface Note {
  note_id: string;
  entity_type: EntityType;
  entity_code: string | null;
  record_id_fund_manager: string | null;
  record_id_vehicle: string | null;
  record_id_project: string | null;
  tbv_fund: string | null;
  fund_manager_id: string | null;
  vehicle_id: string | null;
  project_id: string | null;
  project_update_id: string | null;  // Links to at_processed_notes.id
  people_id: string | null;  // Links to at_key_people_db.people_id
  row_identifier: Record<string, unknown> | null;
  date_of_review: string;
  category: NoteCategory;
  note_text: string;
  author: string;
  date_created: string;
  date_modified: string;
  is_deleted: boolean;
  version_count?: number;
}

export interface NoteVersion {
  version_id: string;
  note_id: string;
  version_number: number;
  category: NoteCategory;
  note_text: string;
  modified_by: string;
  modified_at: string;
  change_reason: string | null;
}

export interface CreateNoteParams {
  entity_type: EntityType;
  entity_code?: string;
  record_id_fund_manager?: string;
  record_id_vehicle?: string;
  record_id_project?: string;
  tbv_fund?: string;
  fund_manager_id?: string;
  vehicle_id?: string;
  project_id?: string;
  project_update_id?: string;  // Links note to specific project update
  people_id?: string;  // Links note to specific person
  row_identifier?: Record<string, unknown>;
  date_of_review: string;
  category: NoteCategory;
  note_text: string;
  author: string;
}

export interface UpdateNoteParams {
  category?: NoteCategory;
  note_text?: string;
  author: string;
  change_reason?: string;
}

export interface GetNotesParams {
  entity_type?: EntityType;
  entity_code?: string;
  record_id_project?: string;
  record_id_vehicle?: string;
  record_id_fund_manager?: string;
  vehicle_id?: string;
  project_id?: string;
  people_id?: string;
  tbv_fund?: string;
  date_of_review?: string;
  include_previous_reviews?: boolean;
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new note
 */
export async function createNote(params: CreateNoteParams): Promise<Note | null> {
  try {
    const result = await sql<Note[]>`
      INSERT INTO notes.notes_db (
        entity_type,
        entity_code,
        record_id_fund_manager,
        record_id_vehicle,
        record_id_project,
        tbv_fund,
        fund_manager_id,
        vehicle_id,
        project_id,
        project_update_id,
        people_id,
        row_identifier,
        date_of_review,
        category,
        note_text,
        author
      ) VALUES (
        ${params.entity_type},
        ${params.entity_code || null},
        ${params.record_id_fund_manager || null},
        ${params.record_id_vehicle || null},
        ${params.record_id_project || null},
        ${params.tbv_fund || null},
        ${params.fund_manager_id || null},
        ${params.vehicle_id || null},
        ${params.project_id || null},
        ${params.project_update_id || null},
        ${params.people_id || null},
        ${params.row_identifier ? JSON.stringify(params.row_identifier) : null}::jsonb,
        ${params.date_of_review}::date,
        ${params.category},
        ${params.note_text},
        ${params.author}
      )
      RETURNING
        note_id::text,
        entity_type,
        entity_code,
        record_id_fund_manager,
        record_id_vehicle,
        record_id_project,
        tbv_fund,
        fund_manager_id,
        vehicle_id,
        project_id,
        project_update_id,
        people_id,
        row_identifier,
        date_of_review::text,
        category,
        note_text,
        author,
        date_created::text,
        date_modified::text,
        is_deleted
    `;

    console.log('Note created:', result[0]?.note_id);
    if (!result[0]) {
      throw new Error('Failed to create note - no result returned');
    }
    return result[0];
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
}

/**
 * Update an existing note (creates version history)
 */
export async function updateNote(noteId: string, params: UpdateNoteParams): Promise<Note | null> {
  try {
    // First, create a version snapshot of the current note
    await sql`
      INSERT INTO notes.note_versions (note_id, version_number, category, note_text, modified_by, change_reason)
      SELECT
        note_id,
        COALESCE((SELECT MAX(version_number) FROM notes.note_versions WHERE note_id = ${noteId}::uuid), 0) + 1,
        category,
        note_text,
        ${params.author},
        ${params.change_reason || null}
      FROM notes.notes_db
      WHERE note_id = ${noteId}::uuid
    `;

    // Update the note
    const result = await sql<Note[]>`
      UPDATE notes.notes_db SET
        category = COALESCE(${params.category || null}, category),
        note_text = COALESCE(${params.note_text || null}, note_text),
        date_modified = NOW()
      WHERE note_id = ${noteId}::uuid
        AND is_deleted = FALSE
      RETURNING
        note_id::text,
        entity_type,
        entity_code,
        record_id_fund_manager,
        record_id_vehicle,
        record_id_project,
        tbv_fund,
        fund_manager_id,
        vehicle_id,
        project_id,
        project_update_id,
        row_identifier,
        date_of_review::text,
        category,
        note_text,
        author,
        date_created::text,
        date_modified::text,
        is_deleted
    `;

    console.log('Note updated:', noteId);
    return result[0] || null;
  } catch (error) {
    console.error('Error updating note:', error);
    return null;
  }
}

/**
 * Soft delete a note
 */
export async function deleteNote(noteId: string, deletedBy: string): Promise<boolean> {
  try {
    await sql`
      UPDATE notes.notes_db SET
        is_deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = ${deletedBy}
      WHERE note_id = ${noteId}::uuid
    `;

    console.log('Note deleted:', noteId);
    return true;
  } catch (error) {
    console.error('Error deleting note:', error);
    return false;
  }
}

/**
 * Restore a soft-deleted note
 */
export async function restoreNote(noteId: string): Promise<Note | null> {
  try {
    const result = await sql<Note[]>`
      UPDATE notes.notes_db SET
        is_deleted = FALSE,
        deleted_at = NULL,
        deleted_by = NULL
      WHERE note_id = ${noteId}::uuid
      RETURNING
        note_id::text,
        entity_type,
        entity_code,
        record_id_fund_manager,
        record_id_vehicle,
        record_id_project,
        tbv_fund,
        fund_manager_id,
        vehicle_id,
        project_id,
        project_update_id,
        row_identifier,
        date_of_review::text,
        category,
        note_text,
        author,
        date_created::text,
        date_modified::text,
        is_deleted
    `;

    console.log('Note restored:', noteId);
    return result[0] || null;
  } catch (error) {
    console.error('Error restoring note:', error);
    return null;
  }
}

// ============================================
// Read Operations
// ============================================

/**
 * Get a single note by ID
 */
export async function getNote(noteId: string): Promise<Note | null> {
  try {
    const result = await sql<(Note & { version_count: number })[]>`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE n.note_id = ${noteId}::uuid
    `;

    return result[0] || null;
  } catch (error) {
    console.error('Error getting note:', error);
    return null;
  }
}

/**
 * Get notes for an entity with flexible filtering
 */
export async function getNotesForEntity(params: GetNotesParams): Promise<Note[]> {
  try {
    // Build dynamic query based on provided params
    const conditions: string[] = ['is_deleted = FALSE'];

    if (params.entity_type) {
      conditions.push(`entity_type = '${params.entity_type}'`);
    }
    if (params.entity_code) {
      conditions.push(`entity_code = '${params.entity_code}'`);
    }
    if (params.record_id_project) {
      conditions.push(`record_id_project = '${params.record_id_project}'`);
    }
    if (params.record_id_vehicle) {
      conditions.push(`record_id_vehicle = '${params.record_id_vehicle}'`);
    }
    if (params.record_id_fund_manager) {
      conditions.push(`record_id_fund_manager = '${params.record_id_fund_manager}'`);
    }
    if (params.vehicle_id) {
      conditions.push(`vehicle_id = '${params.vehicle_id}'`);
    }
    if (params.project_id) {
      conditions.push(`project_id = '${params.project_id}'`);
    }
    if (params.tbv_fund) {
      conditions.push(`tbv_fund = '${params.tbv_fund}'`);
    }
    if (params.date_of_review && !params.include_previous_reviews) {
      conditions.push(`date_of_review = '${params.date_of_review}'::date`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `);

    console.log(`Notes fetched: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for entity:', error);
    return [];
  }
}

/**
 * Get notes for a project by record_id (stable) or project_id (fallback)
 */
export async function getNotesForProject(
  projectIdentifier: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    // First try to find by record_id_project, then by project_id
    let whereClause = `
      (record_id_project = $1 OR project_id = $1)
      AND is_deleted = FALSE
    `;

    const queryParams: (string | boolean)[] = [projectIdentifier];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`Notes for project ${projectIdentifier}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for project:', error);
    return [];
  }
}

/**
 * Get notes for a vehicle by record_id (stable) or vehicle_id (fallback)
 */
export async function getNotesForVehicle(
  vehicleIdentifier: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    let whereClause = `
      (record_id_vehicle = $1 OR vehicle_id = $1)
      AND is_deleted = FALSE
    `;

    const queryParams: (string | boolean)[] = [vehicleIdentifier];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`Notes for vehicle ${vehicleIdentifier}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for vehicle:', error);
    return [];
  }
}

/**
 * Get notes for a section (e.g., 'general', 'overview', 'historical_changes')
 */
export async function getNotesForSection(
  sectionCode: string,
  vehicleId: string,
  dateOfReview: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    const result = includePreviousReviews
      ? await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.entity_type = 'section'
            AND n.entity_code = ${sectionCode}
            AND n.vehicle_id = ${vehicleId}
            AND n.is_deleted = FALSE
          ORDER BY n.date_of_review DESC, n.date_created DESC
        `
      : await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.entity_type = 'section'
            AND n.entity_code = ${sectionCode}
            AND n.vehicle_id = ${vehicleId}
            AND n.date_of_review = ${dateOfReview}::date
            AND n.is_deleted = FALSE
          ORDER BY n.date_created DESC
        `;

    console.log(`Notes for section ${sectionCode}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for section:', error);
    return [];
  }
}

/**
 * Get notes for a section scoped by fund_manager_id (for team-level notes)
 * Used when notes should be shared across all vehicles of the same fund manager
 */
export async function getNotesForSectionByFund(
  sectionCode: string,
  fundManagerId: string,
  dateOfReview: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    const result = includePreviousReviews
      ? await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.entity_type = 'section'
            AND n.entity_code = ${sectionCode}
            AND n.fund_manager_id = ${fundManagerId}
            AND n.is_deleted = FALSE
          ORDER BY n.date_of_review DESC, n.date_created DESC
        `
      : await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.entity_type = 'section'
            AND n.entity_code = ${sectionCode}
            AND n.fund_manager_id = ${fundManagerId}
            AND n.date_of_review = ${dateOfReview}::date
            AND n.is_deleted = FALSE
          ORDER BY n.date_created DESC
        `;

    console.log(`Notes for section ${sectionCode} (fund ${fundManagerId}): ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for section by fund:', error);
    return [];
  }
}

/**
 * Get notes for a TBV fund
 */
export async function getNotesForTbvFund(
  tbvFund: string,
  vehicleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    const result = includePreviousReviews || !dateOfReview
      ? await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.tbv_fund = ${tbvFund}
            AND n.vehicle_id = ${vehicleId}
            AND n.is_deleted = FALSE
          ORDER BY n.date_of_review DESC, n.date_created DESC
        `
      : await sql<(Note & { version_count: number })[]>`
          SELECT
            n.note_id::text,
            n.entity_type,
            n.entity_code,
            n.record_id_fund_manager,
            n.record_id_vehicle,
            n.record_id_project,
            n.tbv_fund,
            n.fund_manager_id,
            n.vehicle_id,
            n.project_id,
            n.project_update_id,
            n.row_identifier,
            n.date_of_review::text,
            n.category,
            n.note_text,
            n.author,
            n.date_created::text,
            n.date_modified::text,
            n.is_deleted,
            COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
          FROM notes.notes_db n
          WHERE n.tbv_fund = ${tbvFund}
            AND n.vehicle_id = ${vehicleId}
            AND n.date_of_review = ${dateOfReview}::date
            AND n.is_deleted = FALSE
          ORDER BY n.date_created DESC
        `;

    console.log(`Notes for TBV fund ${tbvFund}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for TBV fund:', error);
    return [];
  }
}

// ============================================
// Version History Operations
// ============================================

/**
 * Get version history for a note
 */
export async function getNoteVersions(noteId: string): Promise<NoteVersion[]> {
  try {
    const result = await sql<NoteVersion[]>`
      SELECT
        version_id::text,
        note_id::text,
        version_number,
        category,
        note_text,
        modified_by,
        modified_at::text,
        change_reason
      FROM notes.note_versions
      WHERE note_id = ${noteId}::uuid
      ORDER BY version_number DESC
    `;

    console.log(`Versions for note ${noteId}: ${result.length} versions`);
    return result;
  } catch (error) {
    console.error('Error getting note versions:', error);
    return [];
  }
}

/**
 * Revert a note to a previous version
 */
export async function revertToVersion(
  noteId: string,
  versionId: string,
  revertedBy: string
): Promise<Note | null> {
  try {
    // Get the version to revert to
    const versionResult = await sql<NoteVersion[]>`
      SELECT category, note_text
      FROM notes.note_versions
      WHERE version_id = ${versionId}::uuid
        AND note_id = ${noteId}::uuid
    `;

    if (versionResult.length === 0) {
      console.error('Version not found:', versionId);
      return null;
    }

    const version = versionResult[0];

    // Update the note with the version's content
    return await updateNote(noteId, {
      category: version.category,
      note_text: version.note_text,
      author: revertedBy,
      change_reason: `Reverted to version ${versionId}`,
    });
  } catch (error) {
    console.error('Error reverting to version:', error);
    return null;
  }
}

// ============================================
// Mapping Operations
// ============================================

/**
 * Get record_id for a project_id
 */
export async function getRecordIdForProject(projectId: string): Promise<string | null> {
  try {
    // First check our mapping table
    const mappingResult = await sql<{ record_id: string }[]>`
      SELECT record_id
      FROM notes.record_id_mapping
      WHERE entity_type = 'project'
        AND current_business_id = ${projectId}
      LIMIT 1
    `;

    if (mappingResult.length > 0) {
      return mappingResult[0].record_id;
    }

    // Fallback: check the source table directly
    const sourceResult = await sql<{ record_id_project: string }[]>`
      SELECT record_id_project
      FROM at_tables.at_project_universe_db
      WHERE project_id = ${projectId}
        AND record_id_project IS NOT NULL
      LIMIT 1
    `;

    if (sourceResult.length > 0) {
      // Cache the mapping for future use
      const recordId = sourceResult[0].record_id_project;
      await sql`
        INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
        VALUES ('project', ${recordId}, ${projectId}, ${projectId})
        ON CONFLICT (entity_type, record_id) DO UPDATE SET
          current_business_id = EXCLUDED.current_business_id,
          last_updated = NOW()
      `;
      return recordId;
    }

    return null;
  } catch (error) {
    console.error('Error getting record_id for project:', error);
    return null;
  }
}

/**
 * Get record_id for a vehicle_id
 */
export async function getRecordIdForVehicle(vehicleId: string): Promise<string | null> {
  try {
    const mappingResult = await sql<{ record_id: string }[]>`
      SELECT record_id
      FROM notes.record_id_mapping
      WHERE entity_type = 'vehicle'
        AND current_business_id = ${vehicleId}
      LIMIT 1
    `;

    if (mappingResult.length > 0) {
      return mappingResult[0].record_id;
    }

    // Note: If at_vehicle_universe_db has a record_id column, add fallback here
    return null;
  } catch (error) {
    console.error('Error getting record_id for vehicle:', error);
    return null;
  }
}

/**
 * Refresh all record_id mappings from source tables
 */
export async function refreshRecordIdMappings(): Promise<{ projects: number; vehicles: number }> {
  try {
    // Refresh project mappings
    const projectResult = await sql<{ count: string }[]>`
      INSERT INTO notes.record_id_mapping (entity_type, record_id, current_business_id, display_name)
      SELECT 'project', record_id_project, project_id, project_id
      FROM at_tables.at_project_universe_db
      WHERE record_id_project IS NOT NULL
        AND record_id_project != ''
      ON CONFLICT (entity_type, record_id) DO UPDATE SET
        current_business_id = EXCLUDED.current_business_id,
        display_name = EXCLUDED.display_name,
        last_updated = NOW()
      RETURNING 1
    `;

    const projectCount = projectResult.length;

    // Note: Add vehicle mapping refresh if record_id_vehicle column exists
    const vehicleCount = 0;

    console.log(`Mappings refreshed: ${projectCount} projects, ${vehicleCount} vehicles`);
    return { projects: projectCount, vehicles: vehicleCount };
  } catch (error) {
    console.error('Error refreshing record_id mappings:', error);
    return { projects: 0, vehicles: 0 };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get all unique review dates for notes
 */
export async function getNotesReviewDates(
  vehicleId?: string,
  projectId?: string
): Promise<string[]> {
  try {
    let query = `
      SELECT DISTINCT date_of_review::text
      FROM notes.notes_db
      WHERE is_deleted = FALSE
    `;

    if (vehicleId) {
      query += ` AND vehicle_id = '${vehicleId}'`;
    }
    if (projectId) {
      query += ` AND (project_id = '${projectId}' OR record_id_project = '${projectId}')`;
    }

    query += ` ORDER BY date_of_review DESC`;

    const result = await sql.unsafe<{ date_of_review: string }[]>(query);
    return result.map(r => r.date_of_review);
  } catch (error) {
    console.error('Error getting notes review dates:', error);
    return [];
  }
}

/**
 * Count notes by category for a given entity
 */
export async function countNotesByCategory(params: GetNotesParams): Promise<Record<string, number>> {
  try {
    const notes = await getNotesForEntity(params);
    const counts: Record<string, number> = {};

    for (const note of notes) {
      counts[note.category] = (counts[note.category] || 0) + 1;
    }

    return counts;
  } catch (error) {
    console.error('Error counting notes by category:', error);
    return {};
  }
}

// ============================================
// Project Update Notes Operations
// ============================================

/**
 * Get notes for a specific project update
 * Used for the per-update notes thread in Project Updates timeline
 */
export async function getNotesForProjectUpdate(
  projectUpdateId: string
): Promise<Note[]> {
  try {
    if (!projectUpdateId) {
      return [];
    }

    const result = await sql<(Note & { version_count: number })[]>`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE n.project_update_id = ${projectUpdateId}
        AND n.is_deleted = FALSE
      ORDER BY n.date_created DESC
    `;

    console.log(`Notes for project update ${projectUpdateId}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for project update:', error);
    return [];
  }
}

/**
 * Get general notes for a project (excluding update-specific notes)
 * Used for the "General Notes" section in Project Card
 */
export async function getGeneralNotesForProject(
  projectIdentifier: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    if (!projectIdentifier) {
      return [];
    }

    // Build query with project_update_id IS NULL filter
    let whereClause = `
      (record_id_project = $1 OR project_id = $1)
      AND is_deleted = FALSE
      AND project_update_id IS NULL
    `;

    const queryParams: (string | boolean)[] = [projectIdentifier];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`General notes for project ${projectIdentifier}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting general notes for project:', error);
    return [];
  }
}

/**
 * Count notes for a specific project update
 */
export async function countNotesForProjectUpdate(
  projectUpdateId: string
): Promise<number> {
  try {
    if (!projectUpdateId) return 0;

    const result = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM notes.notes_db
      WHERE project_update_id = ${projectUpdateId}
        AND is_deleted = FALSE
    `;

    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting notes for project update:', error);
    return 0;
  }
}

/**
 * Get general notes for a vehicle (excluding update-specific notes)
 * Used for the "General Notes" section in Vehicle Card
 */
export async function getGeneralNotesForVehicle(
  vehicleIdentifier: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    if (!vehicleIdentifier) {
      return [];
    }

    // Build query with project_update_id IS NULL filter (also handles vehicle_update_id when added)
    let whereClause = `
      (record_id_vehicle = $1 OR vehicle_id = $1)
      AND is_deleted = FALSE
      AND project_update_id IS NULL
    `;

    const queryParams: (string | boolean)[] = [vehicleIdentifier];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`General notes for vehicle ${vehicleIdentifier}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting general notes for vehicle:', error);
    return [];
  }
}

/**
 * Get notes for a specific vehicle update
 * Used in the per-update notes thread in Vehicle Updates timeline
 */
export async function getNotesForVehicleUpdate(
  vehicleUpdateId: string
): Promise<Note[]> {
  try {
    if (!vehicleUpdateId) {
      return [];
    }

    // Use project_update_id field to link notes to vehicle updates
    // (vehicle updates and project updates share the same at_processed_notes table)
    const result = await sql<(Note & { version_count: number })[]>`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE n.project_update_id = ${vehicleUpdateId}
        AND n.is_deleted = FALSE
      ORDER BY n.date_created ASC
    `;

    console.log(`Notes for vehicle update ${vehicleUpdateId}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for vehicle update:', error);
    return [];
  }
}

// ============================================
// Person Notes Operations
// ============================================

/**
 * Get notes for a person by people_id
 */
export async function getNotesForPerson(
  peopleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    if (!peopleId) {
      return [];
    }

    let whereClause = `
      people_id = $1
      AND is_deleted = FALSE
    `;

    const queryParams: (string | boolean)[] = [peopleId];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.people_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`Notes for person ${peopleId}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting notes for person:', error);
    return [];
  }
}

/**
 * Get general notes for a person (excluding update-specific notes)
 * Used for the "General Notes" section in People Card
 */
export async function getGeneralNotesForPerson(
  peopleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true
): Promise<Note[]> {
  try {
    if (!peopleId) {
      return [];
    }

    let whereClause = `
      people_id = $1
      AND is_deleted = FALSE
      AND project_update_id IS NULL
    `;

    const queryParams: (string | boolean)[] = [peopleId];

    if (dateOfReview && !includePreviousReviews) {
      whereClause += ` AND date_of_review = $2::date`;
      queryParams.push(dateOfReview);
    }

    const result = await sql.unsafe<(Note & { version_count: number })[]>(`
      SELECT
        n.note_id::text,
        n.entity_type,
        n.entity_code,
        n.record_id_fund_manager,
        n.record_id_vehicle,
        n.record_id_project,
        n.tbv_fund,
        n.fund_manager_id,
        n.vehicle_id,
        n.project_id,
        n.project_update_id,
        n.people_id,
        n.row_identifier,
        n.date_of_review::text,
        n.category,
        n.note_text,
        n.author,
        n.date_created::text,
        n.date_modified::text,
        n.is_deleted,
        COALESCE((SELECT COUNT(*) FROM notes.note_versions WHERE note_id = n.note_id), 0)::int as version_count
      FROM notes.notes_db n
      WHERE ${whereClause}
      ORDER BY n.date_of_review DESC, n.date_created DESC
    `, queryParams);

    console.log(`General notes for person ${peopleId}: ${result.length} notes`);
    return result;
  } catch (error) {
    console.error('Error getting general notes for person:', error);
    return [];
  }
}

/**
 * Count notes for a person
 */
export async function countNotesForPerson(
  peopleId: string
): Promise<number> {
  try {
    if (!peopleId) return 0;

    const result = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM notes.notes_db
      WHERE people_id = ${peopleId}
        AND is_deleted = FALSE
    `;

    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting notes for person:', error);
    return 0;
  }
}
