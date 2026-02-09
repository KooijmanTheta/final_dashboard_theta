'use server';

import sql from '@/lib/db';
import logoMapping from '@/public/logos/_mapping.json';

const logos = logoMapping as Record<string, string>;

// ============================================
// Types
// ============================================

export interface FMMonitoringRow {
  fund_id: string;
  logo_url: string | null;
  fund_status: string;
  last_meeting_date: string | null;
  days_since_meeting: number | null;
  next_meeting_date: string | null;
  days_until_next: number | null;
  quarterly_report_date: string | null;
  primary_contact: string | null;
  investor_portal_url: string | null;
  todo_count: number;
  todo_open_count: number;
  updated_at: string | null;
  relationship_type: 'primary' | 'secondary' | null;
}

export interface FMTodo {
  todo_id: string;
  todo_text: string;
  is_completed: boolean;
  created_at: string;
  created_by: string;
  completed_at: string | null;
}

export interface FMDetail {
  fund_id: string;
  logo_url: string | null;
  location: string | null;
  country: string | null;
  website: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  aum: number | null;
}

export interface FMTeamMember {
  people_id: string;
  role: string | null;
  team: string | null;
  key_member: boolean;
  joining_year: number | null;
  linkedin_profile_url: string | null;
  linkedin_headline: string | null;
  linkedin_location: string | null;
  linkedin_profile_pic_url: string | null;
}

export interface FMVehicle {
  vehicle_id: string;
  full_strategy_name: string | null;
  vintage: number | null;
}

// ============================================
// Table Initialization
// ============================================

let tablesEnsured = false;

async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;

  await sql`CREATE SCHEMA IF NOT EXISTS fund_monitoring`;

  await sql`
    CREATE TABLE IF NOT EXISTS fund_monitoring.fm_tracking (
      fund_id text PRIMARY KEY,
      fund_status text DEFAULT 'Active',
      last_meeting_date date,
      next_meeting_date date,
      quarterly_report_date date,
      primary_contact text,
      investor_portal_url text,
      updated_at timestamptz DEFAULT now(),
      updated_by text
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS fund_monitoring.fm_todos (
      todo_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      fund_id text NOT NULL,
      todo_text text NOT NULL,
      is_completed boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      created_by text,
      completed_at timestamptz,
      sort_order int DEFAULT 0
    )
  `;

  tablesEnsured = true;
}

// ============================================
// Read Operations
// ============================================

export async function getFundManagerMonitoringList(username?: string): Promise<FMMonitoringRow[]> {
  await ensureTables();

  try {
    const user = username || '';

    const result = await sql<FMMonitoringRow[]>`
      WITH user_rels AS (
        SELECT DISTINCT
          i.fund_id,
          MIN(
            CASE
              WHEN LOWER(v.primary_relationship_owner) LIKE LOWER(${user}) || '%' THEN 'primary'
              WHEN LOWER(v.secondary_relationship_owner) LIKE '%' || LOWER(${user}) || '%' THEN 'secondary'
            END
          ) AS relationship_type
        FROM at_tables.at_vehicle_universe_db v
        JOIN at_tables.at_investment_names_db i ON v.vehicle_id = i.vehicle_id
        WHERE ${user} != '' AND (
          LOWER(v.primary_relationship_owner) LIKE LOWER(${user}) || '%'
          OR LOWER(v.secondary_relationship_owner) LIKE '%' || LOWER(${user}) || '%'
        )
        AND i.fund_id IS NOT NULL
        GROUP BY i.fund_id
      )
      SELECT
        f.fund_id,
        f.logo_url,
        COALESCE(t.fund_status, 'Active') as fund_status,
        t.last_meeting_date::text,
        CASE WHEN t.last_meeting_date IS NOT NULL
          THEN (CURRENT_DATE - t.last_meeting_date)::int
          ELSE NULL
        END as days_since_meeting,
        t.next_meeting_date::text,
        CASE WHEN t.next_meeting_date IS NOT NULL
          THEN (t.next_meeting_date - CURRENT_DATE)::int
          ELSE NULL
        END as days_until_next,
        t.quarterly_report_date::text,
        t.primary_contact,
        t.investor_portal_url,
        COALESCE(td.todo_count, 0)::int as todo_count,
        COALESCE(td.todo_open_count, 0)::int as todo_open_count,
        t.updated_at::text,
        ur.relationship_type
      FROM at_tables.at_fund_universe_db f
      LEFT JOIN fund_monitoring.fm_tracking t ON f.fund_id = t.fund_id
      LEFT JOIN (
        SELECT
          fund_id,
          COUNT(*)::int as todo_count,
          COUNT(*) FILTER (WHERE NOT is_completed)::int as todo_open_count
        FROM fund_monitoring.fm_todos
        GROUP BY fund_id
      ) td ON f.fund_id = td.fund_id
      LEFT JOIN user_rels ur ON f.fund_id = ur.fund_id
      ORDER BY
        CASE
          WHEN ur.relationship_type = 'primary' THEN 0
          WHEN ur.relationship_type = 'secondary' THEN 1
          ELSE 2
        END,
        CASE WHEN t.last_meeting_date IS NULL THEN 0 ELSE 1 END,
        (CURRENT_DATE - t.last_meeting_date) DESC NULLS FIRST
    `;

    return result.map((r) => ({ ...r, logo_url: logos[r.fund_id] ?? r.logo_url }));
  } catch (error) {
    console.error('Error fetching FM monitoring list:', error);
    return [];
  }
}

// ============================================
// Upsert Tracking Fields
// ============================================

const ALLOWED_FIELDS = [
  'fund_status',
  'last_meeting_date',
  'next_meeting_date',
  'quarterly_report_date',
  'primary_contact',
  'investor_portal_url',
] as const;

type TrackingField = typeof ALLOWED_FIELDS[number];

export async function upsertFMTracking(params: {
  fund_id: string;
  field: TrackingField;
  value: string;
  updatedBy: string;
}): Promise<void> {
  await ensureTables();

  // Validate field name against allowlist
  if (!ALLOWED_FIELDS.includes(params.field)) {
    throw new Error(`Invalid field: ${params.field}`);
  }

  try {
    // For date fields, handle empty string as NULL
    const isDateField = ['last_meeting_date', 'next_meeting_date', 'quarterly_report_date'].includes(params.field);
    const value = params.value === '' ? null : params.value;

    if (isDateField) {
      await sql.unsafe(
        `INSERT INTO fund_monitoring.fm_tracking (fund_id, ${params.field}, updated_at, updated_by)
         VALUES ($1, $2::date, now(), $3)
         ON CONFLICT (fund_id) DO UPDATE SET
           ${params.field} = $2::date,
           updated_at = now(),
           updated_by = $3`,
        [params.fund_id, value, params.updatedBy]
      );
    } else {
      await sql.unsafe(
        `INSERT INTO fund_monitoring.fm_tracking (fund_id, ${params.field}, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (fund_id) DO UPDATE SET
           ${params.field} = $2,
           updated_at = now(),
           updated_by = $3`,
        [params.fund_id, value, params.updatedBy]
      );
    }
  } catch (error) {
    console.error('Error upserting FM tracking:', error);
    throw error;
  }
}

// ============================================
// TODO Operations
// ============================================

export async function getFMTodos(fundId: string): Promise<FMTodo[]> {
  await ensureTables();

  try {
    const result = await sql<FMTodo[]>`
      SELECT
        todo_id::text,
        todo_text,
        is_completed,
        created_at::text,
        COALESCE(created_by, '') as created_by,
        completed_at::text
      FROM fund_monitoring.fm_todos
      WHERE fund_id = ${fundId}
      ORDER BY is_completed ASC, sort_order ASC, created_at ASC
    `;

    return result;
  } catch (error) {
    console.error('Error fetching FM todos:', error);
    return [];
  }
}

export async function addFMTodo(params: {
  fund_id: string;
  todo_text: string;
  created_by: string;
}): Promise<FMTodo | null> {
  await ensureTables();

  try {
    const result = await sql<FMTodo[]>`
      INSERT INTO fund_monitoring.fm_todos (fund_id, todo_text, created_by)
      VALUES (${params.fund_id}, ${params.todo_text}, ${params.created_by})
      RETURNING
        todo_id::text,
        todo_text,
        is_completed,
        created_at::text,
        COALESCE(created_by, '') as created_by,
        completed_at::text
    `;

    return result[0] || null;
  } catch (error) {
    console.error('Error adding FM todo:', error);
    return null;
  }
}

export async function toggleFMTodo(todoId: string, completed: boolean): Promise<void> {
  await ensureTables();

  try {
    await sql`
      UPDATE fund_monitoring.fm_todos
      SET
        is_completed = ${completed},
        completed_at = ${completed ? sql`now()` : sql`NULL`}
      WHERE todo_id = ${todoId}::uuid
    `;
  } catch (error) {
    console.error('Error toggling FM todo:', error);
    throw error;
  }
}

export async function deleteFMTodo(todoId: string): Promise<void> {
  await ensureTables();

  try {
    await sql`
      DELETE FROM fund_monitoring.fm_todos
      WHERE todo_id = ${todoId}::uuid
    `;
  } catch (error) {
    console.error('Error deleting FM todo:', error);
    throw error;
  }
}

// ============================================
// Detail Operations (for sidebar)
// ============================================

export async function getFundManagerDetail(fundId: string): Promise<FMDetail | null> {
  try {
    const result = await sql<FMDetail[]>`
      SELECT
        fund_id,
        logo_url,
        location,
        country,
        fund_website as website,
        twitter_handle,
        linkedin_url,
        total_per_manager as aum
      FROM at_tables.at_fund_universe_db
      WHERE fund_id = ${fundId}
      LIMIT 1
    `;
    const row = result[0] || null;
    if (row) row.logo_url = logos[row.fund_id] ?? row.logo_url;
    return row;
  } catch (error) {
    console.error('Error fetching FM detail:', error);
    return null;
  }
}

export async function getFundManagerTeam(fundId: string): Promise<FMTeamMember[]> {
  try {
    const result = await sql<FMTeamMember[]>`
      SELECT
        people_id,
        role_str as role,
        team,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        linkedin_profile_url,
        linkedin_headline,
        linkedin_location,
        linkedin_profile_pic_url
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
    return result;
  } catch (error) {
    console.error('Error fetching FM team:', error);
    return [];
  }
}

export async function getFundManagerVehicles(fundId: string): Promise<FMVehicle[]> {
  try {
    const result = await sql<FMVehicle[]>`
      SELECT DISTINCT
        v.vehicle_id,
        v.full_strategy_name,
        v.vintage
      FROM at_tables.at_investment_names_db i
      JOIN at_tables.at_vehicle_universe_db v ON i.vehicle_id = v.vehicle_id
      WHERE i.fund_id = ${fundId}
      ORDER BY v.vintage DESC NULLS LAST
    `;
    return result;
  } catch (error) {
    console.error('Error fetching FM vehicles:', error);
    return [];
  }
}
