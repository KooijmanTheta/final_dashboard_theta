'use server';

import sql from '@/lib/db';

// ============================================
// TypeScript Interfaces
// ============================================

export interface ProjectUpdate {
  id: string;
  claude_summary: string | null;
  source_document_date: string;
  note_tags: string[] | null;
  source_document_name: string | null;
  airtable_project_id: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse note_tags from various formats (JSON array or comma-separated string)
 */
function parseNoteTags(tags: string | null): string[] | null {
  if (!tags) return null;

  try {
    // Try JSON parse first
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    // Fall back to comma-separated
    return tags.split(',').map(t => t.trim()).filter(Boolean);
  }
}

// ============================================
// Server Actions
// ============================================

/**
 * Fetch project updates for a given project
 * Queries at_tables.at_processed_notes where project_id matches
 * Links via project_id (human-readable name like "Polymarket (dba: Blockratize)")
 */
export async function getProjectUpdates(
  projectId: string
): Promise<ProjectUpdate[]> {
  try {
    if (!projectId) {
      console.log('getProjectUpdates: No projectId provided');
      return [];
    }

    // Query using project_id column (the human-readable project name)
    const result = await sql<{
      id: string;
      claude_summary: string | null;
      source_document_date: string;
      note_tags: string | null;
      source_document_name: string | null;
      airtable_project_id: string;
    }[]>`
      SELECT
        id::text,
        claude_summary,
        TO_CHAR(source_document_date, 'YYYY-MM-DD') as source_document_date,
        note_tags,
        source_document_name,
        airtable_project_id
      FROM at_tables.at_processed_notes
      WHERE project_id = ${projectId}
      ORDER BY source_document_date DESC
    `;

    console.log(`Project updates fetched for "${projectId}": ${result.length} updates`);

    // Parse note_tags (handle JSON array or comma-separated string)
    return result.map(row => ({
      ...row,
      note_tags: parseNoteTags(row.note_tags),
    }));
  } catch (error) {
    console.error('Error fetching project updates:', error);
    return [];
  }
}

/**
 * Get a single project update by ID
 */
export async function getProjectUpdate(updateId: string): Promise<ProjectUpdate | null> {
  try {
    const result = await sql<{
      id: string;
      claude_summary: string | null;
      source_document_date: string;
      note_tags: string | null;
      source_document_name: string | null;
      airtable_project_id: string;
    }[]>`
      SELECT
        id::text,
        claude_summary,
        TO_CHAR(source_document_date, 'YYYY-MM-DD') as source_document_date,
        note_tags,
        source_document_name,
        airtable_project_id
      FROM at_tables.at_processed_notes
      WHERE id = ${updateId}::int
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return {
      ...result[0],
      note_tags: parseNoteTags(result[0].note_tags),
    };
  } catch (error) {
    console.error('Error fetching project update:', error);
    return null;
  }
}

/**
 * Count project updates for a project
 */
export async function countProjectUpdates(projectId: string): Promise<number> {
  try {
    if (!projectId) return 0;

    const result = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM at_tables.at_processed_notes
      WHERE project_id = ${projectId}
    `;

    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting project updates:', error);
    return 0;
  }
}
