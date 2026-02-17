'use server';

import sql from '@/lib/db';

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

export interface DataQualityStats {
  totalProjects: number;
  avgCompleteness: number;
  fullyEnriched: number;
  needsAttention: number;
  fieldFillRates: {
    coingecko_id: number;
    project_stack: number;
    project_tag: number;
    project_sub_tag: number;
    website: number;
    description: number;
  };
}

export interface DataQualityProject {
  project_id: string;
  completeness: number;
  filledCount: number;
  cost: number;
  coingecko_id: string | null;
  project_stack: string | null;
  project_tag: string | null;
  project_sub_tag: string | null;
  website: string | null;
  description: string | null;
  project_logo_url: string | null;
}

export async function getDataQualityStats(
  vehicleId?: string,
  portfolioDate?: string
): Promise<DataQualityStats> {
  try {
    const vehicleFilter = vehicleId
      ? sql`WHERE p.project_id IN (SELECT DISTINCT project_id FROM at_tables.at_ownership_db_v2 WHERE vehicle_id = ${vehicleId})`
      : sql``;

    const result = await sql<{
      total_projects: number;
      avg_completeness: number;
      fully_enriched: number;
      needs_attention: number;
      fill_coingecko_id: number;
      fill_project_stack: number;
      fill_project_tag: number;
      fill_project_sub_tag: number;
      fill_website: number;
      fill_description: number;
    }[]>`
      SELECT
        COUNT(*)::int as total_projects,
        AVG(
          (
            CASE WHEN p.coingecko_id IS NOT NULL AND p.coingecko_id != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_stack IS NOT NULL AND p.project_stack != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_tag IS NOT NULL AND p.project_tag != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_sub_tag IS NOT NULL AND p.project_sub_tag != '' THEN 1 ELSE 0 END +
            CASE WHEN p.website IS NOT NULL AND p.website != '' THEN 1 ELSE 0 END +
            CASE WHEN p.description IS NOT NULL AND p.description != '' THEN 1 ELSE 0 END
          ) * 100.0 / 6
        ) as avg_completeness,
        COUNT(CASE WHEN
          (p.coingecko_id IS NOT NULL AND p.coingecko_id != '') AND
          (p.project_stack IS NOT NULL AND p.project_stack != '') AND
          (p.project_tag IS NOT NULL AND p.project_tag != '') AND
          (p.project_sub_tag IS NOT NULL AND p.project_sub_tag != '') AND
          (p.website IS NOT NULL AND p.website != '') AND
          (p.description IS NOT NULL AND p.description != '')
          THEN 1 END)::int as fully_enriched,
        COUNT(CASE WHEN
          (
            CASE WHEN p.coingecko_id IS NOT NULL AND p.coingecko_id != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_stack IS NOT NULL AND p.project_stack != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_tag IS NOT NULL AND p.project_tag != '' THEN 1 ELSE 0 END +
            CASE WHEN p.project_sub_tag IS NOT NULL AND p.project_sub_tag != '' THEN 1 ELSE 0 END +
            CASE WHEN p.website IS NOT NULL AND p.website != '' THEN 1 ELSE 0 END +
            CASE WHEN p.description IS NOT NULL AND p.description != '' THEN 1 ELSE 0 END
          ) < 3 THEN 1 END)::int as needs_attention,
        COUNT(CASE WHEN p.coingecko_id IS NOT NULL AND p.coingecko_id != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_coingecko_id,
        COUNT(CASE WHEN p.project_stack IS NOT NULL AND p.project_stack != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_project_stack,
        COUNT(CASE WHEN p.project_tag IS NOT NULL AND p.project_tag != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_project_tag,
        COUNT(CASE WHEN p.project_sub_tag IS NOT NULL AND p.project_sub_tag != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_project_sub_tag,
        COUNT(CASE WHEN p.website IS NOT NULL AND p.website != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_website,
        COUNT(CASE WHEN p.description IS NOT NULL AND p.description != '' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as fill_description
      FROM at_tables.at_project_universe_db p
      ${vehicleFilter}
    `;

    const row = result[0];
    if (!row) {
      return {
        totalProjects: 0,
        avgCompleteness: 0,
        fullyEnriched: 0,
        needsAttention: 0,
        fieldFillRates: { coingecko_id: 0, project_stack: 0, project_tag: 0, project_sub_tag: 0, website: 0, description: 0 },
      };
    }

    return {
      totalProjects: toNumber(row.total_projects),
      avgCompleteness: toNumber(row.avg_completeness),
      fullyEnriched: toNumber(row.fully_enriched),
      needsAttention: toNumber(row.needs_attention),
      fieldFillRates: {
        coingecko_id: toNumber(row.fill_coingecko_id),
        project_stack: toNumber(row.fill_project_stack),
        project_tag: toNumber(row.fill_project_tag),
        project_sub_tag: toNumber(row.fill_project_sub_tag),
        website: toNumber(row.fill_website),
        description: toNumber(row.fill_description),
      },
    };
  } catch (error) {
    console.error('Error fetching data quality stats:', error);
    return {
      totalProjects: 0,
      avgCompleteness: 0,
      fullyEnriched: 0,
      needsAttention: 0,
      fieldFillRates: { coingecko_id: 0, project_stack: 0, project_tag: 0, project_sub_tag: 0, website: 0, description: 0 },
    };
  }
}

export interface DataQualityProjectsResult {
  projects: DataQualityProject[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getDataQualityProjects(params: {
  vehicleId?: string;
  portfolioDate?: string;
  search?: string;
  missingField?: string;
  sortBy?: 'completeness' | 'project_id' | 'cost';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<DataQualityProjectsResult> {
  try {
    const { vehicleId, search, missingField, sortBy = 'completeness', sortDir = 'asc', page = 1, pageSize = 50 } = params;

    // Build cost CTE — scoped to vehicle when filtered, all vehicles when global
    const costCte = vehicleId
      ? sql`
        cost_data AS (
          SELECT project_id, COALESCE(SUM(delta_cost), 0) as cost
          FROM at_tables.at_ownership_db_v2
          WHERE vehicle_id = ${vehicleId}
            AND COALESCE(outcome_type, '') != 'Cash'
            AND project_id != 'Other Assets'
          GROUP BY project_id
        )`
      : sql`
        cost_data AS (
          SELECT project_id, COALESCE(SUM(delta_cost), 0) as cost
          FROM at_tables.at_ownership_db_v2
          WHERE COALESCE(outcome_type, '') != 'Cash'
            AND project_id != 'Other Assets'
          GROUP BY project_id
        )`;

    const conditions: ReturnType<typeof sql>[] = [];

    if (vehicleId) {
      conditions.push(
        sql`p.project_id IN (SELECT DISTINCT project_id FROM at_tables.at_ownership_db_v2 WHERE vehicle_id = ${vehicleId})`
      );
    }

    if (search) {
      conditions.push(sql`p.project_id ILIKE ${'%' + search + '%'}`);
    }

    if (missingField && ['coingecko_id', 'project_stack', 'project_tag', 'project_sub_tag', 'website', 'description'].includes(missingField)) {
      conditions.push(
        sql`(p.${sql.unsafe(missingField)} IS NULL OR p.${sql.unsafe(missingField)} = '')`
      );
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${conditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`)}`
      : sql``;

    let orderClause;
    if (sortBy === 'cost') {
      orderClause = sortDir === 'desc'
        ? sql`ORDER BY COALESCE(c.cost, 0) DESC, p.project_id ASC`
        : sql`ORDER BY COALESCE(c.cost, 0) ASC, p.project_id ASC`;
    } else if (sortBy === 'project_id') {
      orderClause = sortDir === 'desc'
        ? sql`ORDER BY p.project_id DESC`
        : sql`ORDER BY p.project_id ASC`;
    } else {
      orderClause = sortDir === 'desc'
        ? sql`ORDER BY filled_count DESC, p.project_id ASC`
        : sql`ORDER BY filled_count ASC, p.project_id ASC`;
    }

    const offset = (page - 1) * pageSize;

    // Count total matching rows
    const countResult = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM at_tables.at_project_universe_db p
      ${whereClause}
    `;
    const totalCount = toNumber(countResult[0]?.count);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const result = await sql<{
      project_id: string;
      filled_count: number;
      cost: number;
      coingecko_id: string | null;
      project_stack: string | null;
      project_tag: string | null;
      project_sub_tag: string | null;
      website: string | null;
      description: string | null;
      project_logo_url: string | null;
    }[]>`
      WITH ${costCte}
      SELECT
        p.project_id,
        (
          CASE WHEN p.coingecko_id IS NOT NULL AND p.coingecko_id != '' THEN 1 ELSE 0 END +
          CASE WHEN p.project_stack IS NOT NULL AND p.project_stack != '' THEN 1 ELSE 0 END +
          CASE WHEN p.project_tag IS NOT NULL AND p.project_tag != '' THEN 1 ELSE 0 END +
          CASE WHEN p.project_sub_tag IS NOT NULL AND p.project_sub_tag != '' THEN 1 ELSE 0 END +
          CASE WHEN p.website IS NOT NULL AND p.website != '' THEN 1 ELSE 0 END +
          CASE WHEN p.description IS NOT NULL AND p.description != '' THEN 1 ELSE 0 END
        )::int as filled_count,
        COALESCE(c.cost, 0) as cost,
        p.coingecko_id,
        p.project_stack,
        p.project_tag,
        p.project_sub_tag,
        p.website,
        p.description,
        p.project_logo_url
      FROM at_tables.at_project_universe_db p
      LEFT JOIN cost_data c ON c.project_id = p.project_id
      ${whereClause}
      ${orderClause}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return {
      projects: result.map(row => ({
        project_id: row.project_id,
        completeness: Math.round((toNumber(row.filled_count) / 6) * 100),
        filledCount: toNumber(row.filled_count),
        cost: toNumber(row.cost),
        coingecko_id: row.coingecko_id || null,
        project_stack: row.project_stack || null,
        project_tag: row.project_tag || null,
        project_sub_tag: row.project_sub_tag || null,
        website: row.website || null,
        description: row.description || null,
        project_logo_url: row.project_logo_url || null,
      })),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error('Error fetching data quality projects:', error);
    return { projects: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 1 };
  }
}

// ============================================================================
// Position-Level Data Quality
// ============================================================================

export interface PositionQualityRow {
  ownership_id: string;
  project_id: string | null;
  has_outcome_type: boolean;
  has_established_type: boolean;
  has_rounds_id: boolean;
  has_entry_valuation: boolean;
  filled_count: number;
}

export interface VehiclePositionSummary {
  vehicle_id: string;
  tbv_fund: string;
  total: number;
  complete: number;
  missing_outcome: number;
  missing_established: number;
  missing_rounds: number;
  missing_valuation: number;
}

export interface PositionQualityStats {
  total: number;
  fullyComplete: number;
  needsAttention: number;
  fieldRates: {
    outcome_type: number;
    established_type: number;
    rounds_id: number;
    entry_valuation: number;
  };
}

/** Get per-vehicle summary + global stats */
export async function getPositionQualitySummary(): Promise<{
  vehicles: VehiclePositionSummary[];
  stats: PositionQualityStats;
}> {
  try {
    const rows = await sql<{
      vehicle_id: string;
      tbv_fund: string | null;
      total: number;
      complete: number;
      missing_outcome: number;
      missing_established: number;
      missing_rounds: number;
      missing_valuation: number;
    }[]>`
      SELECT
        o.vehicle_id,
        MIN(c.tbv_fund) as tbv_fund,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE
          (o.outcome_type IS NOT NULL AND o.outcome_type != '') AND
          (o.established_type IS NOT NULL AND o.established_type != '') AND
          (o.rounds_id IS NOT NULL AND o.rounds_id != '') AND
          (o.entry_valuation_token IS NOT NULL OR o.entry_valuation_equity IS NOT NULL)
        )::int as complete,
        COUNT(*) FILTER (WHERE o.outcome_type IS NULL OR o.outcome_type = '')::int as missing_outcome,
        COUNT(*) FILTER (WHERE o.established_type IS NULL OR o.established_type = '')::int as missing_established,
        COUNT(*) FILTER (WHERE o.rounds_id IS NULL OR o.rounds_id = '')::int as missing_rounds,
        COUNT(*) FILTER (WHERE o.entry_valuation_token IS NULL AND o.entry_valuation_equity IS NULL)::int as missing_valuation
      FROM at_tables.at_ownership_db_v2 o
      JOIN at_tables.at_closing_db c ON c.closing_id = o.vehicle_id
      WHERE o.vehicle_id IS NOT NULL AND o.vehicle_id != ''
        AND c.tbv_fund IS NOT NULL AND c.tbv_fund != '' AND c.tbv_fund != 'TBV0'
      GROUP BY o.vehicle_id
      ORDER BY MIN(c.tbv_fund), o.vehicle_id
    `;

    const vehicles: VehiclePositionSummary[] = rows.map(r => ({
      vehicle_id: r.vehicle_id,
      tbv_fund: r.tbv_fund || 'Unknown',
      total: toNumber(r.total),
      complete: toNumber(r.complete),
      missing_outcome: toNumber(r.missing_outcome),
      missing_established: toNumber(r.missing_established),
      missing_rounds: toNumber(r.missing_rounds),
      missing_valuation: toNumber(r.missing_valuation),
    }));

    const total = vehicles.reduce((s, v) => s + v.total, 0);
    const fullyComplete = vehicles.reduce((s, v) => s + v.complete, 0);
    const missingOutcome = vehicles.reduce((s, v) => s + v.missing_outcome, 0);
    const missingEstablished = vehicles.reduce((s, v) => s + v.missing_established, 0);
    const missingRounds = vehicles.reduce((s, v) => s + v.missing_rounds, 0);
    const missingValuation = vehicles.reduce((s, v) => s + v.missing_valuation, 0);

    return {
      vehicles,
      stats: {
        total,
        fullyComplete,
        needsAttention: total - fullyComplete,
        fieldRates: {
          outcome_type: total > 0 ? Math.round((1 - missingOutcome / total) * 1000) / 10 : 0,
          established_type: total > 0 ? Math.round((1 - missingEstablished / total) * 1000) / 10 : 0,
          rounds_id: total > 0 ? Math.round((1 - missingRounds / total) * 1000) / 10 : 0,
          entry_valuation: total > 0 ? Math.round((1 - missingValuation / total) * 1000) / 10 : 0,
        },
      },
    };
  } catch (error) {
    console.error('Error fetching position quality summary:', error);
    return {
      vehicles: [],
      stats: { total: 0, fullyComplete: 0, needsAttention: 0, fieldRates: { outcome_type: 0, established_type: 0, rounds_id: 0, entry_valuation: 0 } },
    };
  }
}

/** Get individual positions for a specific vehicle */
export async function getPositionsByVehicle(vehicleId: string): Promise<PositionQualityRow[]> {
  try {
    const rows = await sql<{
      ownership_id: string;
      project_id: string | null;
      has_outcome_type: boolean;
      has_established_type: boolean;
      has_rounds_id: boolean;
      has_entry_valuation: boolean;
      filled_count: number;
    }[]>`
      SELECT
        o.ownership_id,
        o.project_id,
        (o.outcome_type IS NOT NULL AND o.outcome_type != '') as has_outcome_type,
        (o.established_type IS NOT NULL AND o.established_type != '') as has_established_type,
        (o.rounds_id IS NOT NULL AND o.rounds_id != '') as has_rounds_id,
        (o.entry_valuation_token IS NOT NULL OR o.entry_valuation_equity IS NOT NULL) as has_entry_valuation,
        (
          CASE WHEN o.outcome_type IS NOT NULL AND o.outcome_type != '' THEN 1 ELSE 0 END +
          CASE WHEN o.established_type IS NOT NULL AND o.established_type != '' THEN 1 ELSE 0 END +
          CASE WHEN o.rounds_id IS NOT NULL AND o.rounds_id != '' THEN 1 ELSE 0 END +
          CASE WHEN o.entry_valuation_token IS NOT NULL OR o.entry_valuation_equity IS NOT NULL THEN 1 ELSE 0 END
        )::int as filled_count
      FROM at_tables.at_ownership_db_v2 o
      WHERE o.vehicle_id = ${vehicleId}
      ORDER BY filled_count ASC, o.ownership_id ASC
    `;

    return rows.map(r => ({
      ownership_id: r.ownership_id,
      project_id: r.project_id || null,
      has_outcome_type: r.has_outcome_type,
      has_established_type: r.has_established_type,
      has_rounds_id: r.has_rounds_id,
      has_entry_valuation: r.has_entry_valuation,
      filled_count: toNumber(r.filled_count),
    }));
  } catch (error) {
    console.error('Error fetching positions for vehicle:', error);
    return [];
  }
}
