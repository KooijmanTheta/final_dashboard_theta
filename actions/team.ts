'use server';

import sql from '@/lib/db';

// ============================================
// TypeScript Interfaces
// ============================================

export interface KeyPerson {
  people_id: string;
  fund_id: string;
  role: string | null;
  team: string | null;
  hierarchy_level: number | null;
  key_member: boolean;
  joining_year: number | null;
  leaving_year: number | null;
  linkedin_profile_url: string | null;
  twitter_handle: string | null;
  linkedin_headline: string | null;
  linkedin_summary: string | null;
  linkedin_location: string | null;
  linkedin_profile_pic_url: string | null;
  notes: string | null;
  text_chunks: string | null;
  time_allocation: number | null;
  linkedin_last_scraped: string | null;
}

export interface TeamChange extends KeyPerson {
  change_type: 'departure' | 'addition';
  change_year: number;
}

export interface TeamMetrics {
  total_departures: number;
  total_additions: number;
  net_change: number;
  turnover_rate: number;
  average_team_size: number;
}

// ============================================
// Team Changes Queries
// ============================================

/**
 * Get team members who departed within the review period
 */
export async function getTeamDepartures(
  fundId: string,
  reviewPeriodStart: number,
  reviewPeriodEnd: number
): Promise<TeamChange[]> {
  try {
    const result = await sql<TeamChange[]>`
      SELECT
        people_id,
        fund_id,
        role_str as role,
        team,
        hierarchy_level::int,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        leaving_year::int,
        linkedin_profile_url,
        twitter_handle,
        linkedin_headline,
        linkedin_summary,
        linkedin_location,
        linkedin_profile_pic_url,
        notes,
        text_chunks,
        NULL::float as time_allocation,
        linkedin_last_scraped,
        'departure' as change_type,
        leaving_year::int as change_year
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND leaving_year IS NOT NULL
        AND leaving_year::int >= ${reviewPeriodStart}
        AND leaving_year::int <= ${reviewPeriodEnd}
      ORDER BY leaving_year DESC, hierarchy_level ASC
    `;
    console.log(`Team departures for ${fundId} (${reviewPeriodStart}-${reviewPeriodEnd}):`, result.length);
    return result;
  } catch (error) {
    console.error('Error fetching team departures:', error);
    return [];
  }
}

/**
 * Get team members who joined within the review period
 */
export async function getTeamAdditions(
  fundId: string,
  reviewPeriodStart: number,
  reviewPeriodEnd: number
): Promise<TeamChange[]> {
  try {
    const result = await sql<TeamChange[]>`
      SELECT
        people_id,
        fund_id,
        role_str as role,
        team,
        hierarchy_level::int,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        leaving_year::int,
        linkedin_profile_url,
        twitter_handle,
        linkedin_headline,
        linkedin_summary,
        linkedin_location,
        linkedin_profile_pic_url,
        notes,
        text_chunks,
        NULL::float as time_allocation,
        linkedin_last_scraped,
        'addition' as change_type,
        joining_year::int as change_year
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND joining_year IS NOT NULL
        AND joining_year::int >= ${reviewPeriodStart}
        AND joining_year::int <= ${reviewPeriodEnd}
      ORDER BY joining_year DESC, hierarchy_level ASC
    `;
    console.log(`Team additions for ${fundId} (${reviewPeriodStart}-${reviewPeriodEnd}):`, result.length);
    return result;
  } catch (error) {
    console.error('Error fetching team additions:', error);
    return [];
  }
}

/**
 * Get team metrics for the review period
 */
export async function getTeamMetrics(
  fundId: string,
  reviewPeriodStart: number,
  reviewPeriodEnd: number
): Promise<TeamMetrics> {
  try {
    // Get departures count
    const departuresResult = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND leaving_year IS NOT NULL
        AND leaving_year::int >= ${reviewPeriodStart}
        AND leaving_year::int <= ${reviewPeriodEnd}
    `;
    const totalDepartures = parseInt(departuresResult[0]?.count || '0', 10);

    // Get additions count
    const additionsResult = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND joining_year IS NOT NULL
        AND joining_year::int >= ${reviewPeriodStart}
        AND joining_year::int <= ${reviewPeriodEnd}
    `;
    const totalAdditions = parseInt(additionsResult[0]?.count || '0', 10);

    // Calculate average team size at midpoint of review period
    // (active members = joined before midpoint AND (not left OR left after midpoint))
    const midpointYear = Math.floor((reviewPeriodStart + reviewPeriodEnd) / 2);
    const teamSizeResult = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND (joining_year IS NULL OR joining_year::int <= ${midpointYear})
        AND (leaving_year IS NULL OR leaving_year::int > ${midpointYear})
    `;
    const averageTeamSize = parseInt(teamSizeResult[0]?.count || '0', 10);

    // Calculate turnover rate
    const turnoverRate = averageTeamSize > 0
      ? (totalDepartures / averageTeamSize) * 100
      : 0;

    const metrics: TeamMetrics = {
      total_departures: totalDepartures,
      total_additions: totalAdditions,
      net_change: totalAdditions - totalDepartures,
      turnover_rate: Math.round(turnoverRate * 10) / 10,
      average_team_size: averageTeamSize,
    };

    console.log('Team metrics:', metrics);
    return metrics;
  } catch (error) {
    console.error('Error fetching team metrics:', error);
    return {
      total_departures: 0,
      total_additions: 0,
      net_change: 0,
      turnover_rate: 0,
      average_team_size: 0,
    };
  }
}

// ============================================
// Team Members Queries
// ============================================

/**
 * Get active team members by team type
 */
async function getTeamByType(fundId: string, teamType: string): Promise<KeyPerson[]> {
  try {
    const result = await sql<KeyPerson[]>`
      SELECT
        people_id,
        fund_id,
        role_str as role,
        team,
        hierarchy_level::int,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        leaving_year::int,
        linkedin_profile_url,
        twitter_handle,
        linkedin_headline,
        linkedin_summary,
        linkedin_location,
        linkedin_profile_pic_url,
        notes,
        text_chunks,
        NULL::float as time_allocation,
        linkedin_last_scraped
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND team = ${teamType}
        AND leaving_year IS NULL
      ORDER BY hierarchy_level ASC, people_id ASC
    `;
    console.log(`${teamType} for ${fundId}:`, result.length);
    return result;
  } catch (error) {
    console.error(`Error fetching ${teamType}:`, error);
    return [];
  }
}

export async function getLeadershipTeam(fundId: string): Promise<KeyPerson[]> {
  return getTeamByType(fundId, 'Leadership Team');
}

export async function getInvestmentTeam(fundId: string): Promise<KeyPerson[]> {
  return getTeamByType(fundId, 'Investment Team');
}

export async function getOperationsTeam(fundId: string): Promise<KeyPerson[]> {
  return getTeamByType(fundId, 'Operations Team');
}

/**
 * Get all active team members for a fund
 */
export async function getAllActiveTeamMembers(fundId: string): Promise<KeyPerson[]> {
  try {
    const result = await sql<KeyPerson[]>`
      SELECT
        people_id,
        fund_id,
        role_str as role,
        team,
        hierarchy_level::int,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        leaving_year::int,
        linkedin_profile_url,
        twitter_handle,
        linkedin_headline,
        linkedin_summary,
        linkedin_location,
        linkedin_profile_pic_url,
        notes,
        text_chunks,
        NULL::float as time_allocation,
        linkedin_last_scraped
      FROM at_tables.at_key_people_db
      WHERE fund_id = ${fundId}
        AND leaving_year IS NULL
      ORDER BY
        CASE team
          WHEN 'Leadership Team' THEN 1
          WHEN 'Investment Team' THEN 2
          WHEN 'Operations Team' THEN 3
          ELSE 4
        END,
        hierarchy_level ASC,
        people_id ASC
    `;
    console.log(`All active team members for ${fundId}:`, result.length);
    return result;
  } catch (error) {
    console.error('Error fetching all active team members:', error);
    return [];
  }
}

// ============================================
// Manual Team Change Actions
// ============================================

/**
 * Add a team departure or addition manually.
 * Checks if the person exists first, then updates or inserts accordingly.
 */
export async function addTeamChange(
  fundId: string,
  peopleId: string,
  changeType: 'departure' | 'addition',
  year: number,
  role?: string,
  team?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!peopleId.trim()) {
      return { success: false, error: 'Name is required' };
    }

    const name = peopleId.trim();

    // Check if person already exists
    const existing = await sql<{ people_id: string }[]>`
      SELECT people_id FROM at_tables.at_key_people_db
      WHERE people_id = ${name}
      LIMIT 1
    `;

    if (existing.length > 0) {
      // Update existing row
      if (changeType === 'departure') {
        await sql`
          UPDATE at_tables.at_key_people_db
          SET leaving_year = ${year},
              role_str = COALESCE(${role || null}, role_str),
              team = COALESCE(${team || null}, team)
          WHERE people_id = ${name}
        `;
      } else {
        await sql`
          UPDATE at_tables.at_key_people_db
          SET joining_year = ${year},
              role_str = COALESCE(${role || null}, role_str),
              team = COALESCE(${team || null}, team)
          WHERE people_id = ${name}
        `;
      }
    } else {
      // Insert new row
      if (changeType === 'departure') {
        await sql`
          INSERT INTO at_tables.at_key_people_db (people_id, fund_id, role_str, team, leaving_year)
          VALUES (${name}, ${fundId}, ${role || null}, ${team || null}, ${year})
        `;
      } else {
        await sql`
          INSERT INTO at_tables.at_key_people_db (people_id, fund_id, role_str, team, joining_year)
          VALUES (${name}, ${fundId}, ${role || null}, ${team || null}, ${year})
        `;
      }
    }

    console.log(`[Team] Added ${changeType}: ${name} (${year}) for ${fundId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error adding team ${changeType}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Remove a team change by clearing the relevant year field.
 * For departures: sets leaving_year = NULL. For additions: sets joining_year = NULL.
 */
export async function removeTeamChange(
  peopleId: string,
  changeType: 'departure' | 'addition',
): Promise<{ success: boolean; error?: string }> {
  try {
    if (changeType === 'departure') {
      await sql`
        UPDATE at_tables.at_key_people_db
        SET leaving_year = NULL
        WHERE people_id = ${peopleId}
      `;
    } else {
      await sql`
        UPDATE at_tables.at_key_people_db
        SET joining_year = NULL
        WHERE people_id = ${peopleId}
      `;
    }

    console.log(`[Team] Removed ${changeType} for ${peopleId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error removing team ${changeType}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Record a role change: updates role_str and appends a note to the employee's notes field.
 */
export async function recordRoleChange(
  peopleId: string,
  newRole: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!peopleId.trim() || !newRole.trim()) {
      return { success: false, error: 'Employee and new role are required' };
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const noteEntry = `[${timestamp}] Role changed to "${newRole.trim()}"${note.trim() ? ': ' + note.trim() : ''}`;

    await sql`
      UPDATE at_tables.at_key_people_db
      SET
        role_str = ${newRole.trim()},
        notes = CASE
          WHEN notes IS NOT NULL AND notes != ''
          THEN notes || E'\n' || ${noteEntry}
          ELSE ${noteEntry}
        END
      WHERE people_id = ${peopleId.trim()}
    `;

    console.log(`[Team] Role change: ${peopleId} → "${newRole}"`);
    return { success: true };
  } catch (error) {
    console.error('Error recording role change:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Search
// ============================================

/**
 * Search people by name across all funds (for the additions combobox)
 */
export async function searchPeople(
  query: string,
): Promise<Array<{ people_id: string; role: string | null; team: string | null; fund_id: string }>> {
  try {
    if (!query.trim() || query.trim().length < 2) return [];

    const result = await sql<Array<{ people_id: string; role: string | null; team: string | null; fund_id: string }>>`
      SELECT DISTINCT people_id, role_str as role, team, fund_id
      FROM at_tables.at_key_people_db
      WHERE people_id ILIKE ${'%' + query.trim() + '%'}
      ORDER BY people_id ASC
      LIMIT 15
    `;
    return [...result];
  } catch (error) {
    console.error('Error searching people:', error);
    return [];
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get fund_id from vehicle_id via at_investment_names_db
 */
export async function getFundIdFromVehicle(vehicleId: string): Promise<string | null> {
  try {
    const result = await sql<{ fund_id: string }[]>`
      SELECT fund_id
      FROM at_tables.at_investment_names_db
      WHERE vehicle_id = ${vehicleId}
      LIMIT 1
    `;
    return result[0]?.fund_id || null;
  } catch (error) {
    console.error('Error getting fund_id from vehicle:', error);
    return null;
  }
}
