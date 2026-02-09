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
