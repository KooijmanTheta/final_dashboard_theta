'use server';

import sql from '@/lib/db';

// ============================================
// TypeScript Interfaces
// ============================================

export interface VehicleUpdate {
  id: string;
  claude_summary: string | null;
  source_document_date: string;
  source_document_type: string | null;
  note_tags: string[] | null;
  source_document_name: string | null;
  entity_type: string | null;
  vehicle_id: string | null;
  fund_id: string | null;
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
 * Fetch vehicle updates for a given vehicle
 * Queries at_tables.at_processed_notes where:
 * - vehicle_id matches (human-readable name) OR
 * - airtable_vehicle_id matches record_id_vehicle_universe OR
 * - airtable_fund_id matches record_id_fund_universe
 *
 * @param limit - Number of updates to fetch. Pass null or undefined for unlimited.
 */
export async function getVehicleUpdates(
  vehicleId: string,
  recordIdVehicleUniverse?: string | null,
  recordIdFundUniverse?: string | null,
  limit?: number | null
): Promise<VehicleUpdate[]> {
  try {
    if (!vehicleId && !recordIdVehicleUniverse && !recordIdFundUniverse) {
      console.log('getVehicleUpdates: No identifiers provided');
      return [];
    }

    // Build WHERE conditions for flexible matching
    // Use dynamic SQL based on whether limit is provided
    const result = limit != null
      ? await sql<{
          id: string;
          claude_summary: string | null;
          source_document_date: string;
          source_document_type: string | null;
          note_tags: string | null;
          source_document_name: string | null;
          entity_type: string | null;
          vehicle_id: string | null;
          fund_id: string | null;
        }[]>`
          SELECT
            id::text,
            claude_summary,
            TO_CHAR(source_document_date, 'YYYY-MM-DD') as source_document_date,
            source_document_type,
            note_tags,
            source_document_name,
            entity_type,
            vehicle_id,
            fund_id
          FROM at_tables.at_processed_notes
          WHERE (
            vehicle_id = ${vehicleId}
            ${recordIdVehicleUniverse ? sql`OR airtable_vehicle_id = ${recordIdVehicleUniverse}` : sql``}
            ${recordIdFundUniverse ? sql`OR airtable_fund_id = ${recordIdFundUniverse}` : sql``}
          )
          ORDER BY source_document_date DESC
          LIMIT ${limit}
        `
      : await sql<{
          id: string;
          claude_summary: string | null;
          source_document_date: string;
          source_document_type: string | null;
          note_tags: string | null;
          source_document_name: string | null;
          entity_type: string | null;
          vehicle_id: string | null;
          fund_id: string | null;
        }[]>`
          SELECT
            id::text,
            claude_summary,
            TO_CHAR(source_document_date, 'YYYY-MM-DD') as source_document_date,
            source_document_type,
            note_tags,
            source_document_name,
            entity_type,
            vehicle_id,
            fund_id
          FROM at_tables.at_processed_notes
          WHERE (
            vehicle_id = ${vehicleId}
            ${recordIdVehicleUniverse ? sql`OR airtable_vehicle_id = ${recordIdVehicleUniverse}` : sql``}
            ${recordIdFundUniverse ? sql`OR airtable_fund_id = ${recordIdFundUniverse}` : sql``}
          )
          ORDER BY source_document_date DESC
        `;

    console.log(`Vehicle updates fetched for "${vehicleId}": ${result.length} updates`);

    // Parse note_tags (handle JSON array or comma-separated string)
    return result.map(row => ({
      ...row,
      note_tags: parseNoteTags(row.note_tags),
    }));
  } catch (error) {
    console.error('Error fetching vehicle updates:', error);
    return [];
  }
}

/**
 * Get a single vehicle update by ID
 */
export async function getVehicleUpdate(updateId: string): Promise<VehicleUpdate | null> {
  try {
    const result = await sql<{
      id: string;
      claude_summary: string | null;
      source_document_date: string;
      source_document_type: string | null;
      note_tags: string | null;
      source_document_name: string | null;
      entity_type: string | null;
      vehicle_id: string | null;
      fund_id: string | null;
    }[]>`
      SELECT
        id::text,
        claude_summary,
        TO_CHAR(source_document_date, 'YYYY-MM-DD') as source_document_date,
        source_document_type,
        note_tags,
        source_document_name,
        entity_type,
        vehicle_id,
        fund_id
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
    console.error('Error fetching vehicle update:', error);
    return null;
  }
}

/**
 * Count vehicle updates for a vehicle
 */
export async function countVehicleUpdates(
  vehicleId: string,
  recordIdVehicleUniverse?: string | null,
  recordIdFundUniverse?: string | null
): Promise<number> {
  try {
    if (!vehicleId && !recordIdVehicleUniverse && !recordIdFundUniverse) return 0;

    const result = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM at_tables.at_processed_notes
      WHERE (
        vehicle_id = ${vehicleId}
        ${recordIdVehicleUniverse ? sql`OR airtable_vehicle_id = ${recordIdVehicleUniverse}` : sql``}
        ${recordIdFundUniverse ? sql`OR airtable_fund_id = ${recordIdFundUniverse}` : sql``}
      )
    `;

    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting vehicle updates:', error);
    return 0;
  }
}
