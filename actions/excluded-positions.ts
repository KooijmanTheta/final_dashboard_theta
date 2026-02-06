'use server';

import sql from '@/lib/db';

// ============================================
// TypeScript Interfaces
// ============================================

export interface ExcludedPositionCategory {
  category: string;
  project_count: number;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
}

export interface ExcludedPositionDetail {
  project_id: string;
  description: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
}

// ============================================
// Excluded Positions Queries
// ============================================

/**
 * Get excluded positions aggregated by category
 * Categories: Other Assets, Cash & Cash Equivalents, NAV Adjustment, Flows
 */
export async function getExcludedPositions(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<ExcludedPositionCategory[]> {
  if (!vehicleId || !portfolioDate) {
    return [];
  }

  try {
    // Use date range if provided, otherwise use cumulative up to portfolioDate
    const costDateFilter = dateReportedStart && dateReportedEnd
      ? sql`o.date_reported >= ${dateReportedStart}::date AND o.date_reported <= ${dateReportedEnd}::date`
      : sql`o.date_reported <= ${portfolioDate}::date`;

    const result = await sql<ExcludedPositionCategory[]>`
      WITH excluded_cost AS (
        -- Cost data from at_ownership_db_v2 for excluded positions
        SELECT
          CASE
            WHEN o.project_id = 'Other Assets' THEN 'Other Assets'
            WHEN o.outcome_type = 'Cash' THEN 'Cash & Cash Equivalents'
            ELSE 'Unknown'
          END as category,
          o.project_id,
          COALESCE(SUM(o.delta_cost), 0) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND ${costDateFilter}
          AND (o.outcome_type = 'Cash' OR o.project_id = 'Other Assets')
        GROUP BY
          CASE
            WHEN o.project_id = 'Other Assets' THEN 'Other Assets'
            WHEN o.outcome_type = 'Cash' THEN 'Cash & Cash Equivalents'
            ELSE 'Unknown'
          END,
          o.project_id
      ),
      excluded_mv AS (
        -- Market value data from fund_mv_db for excluded positions
        SELECT
          CASE
            WHEN m.project_id = 'Other Assets' THEN 'Other Assets'
            WHEN m.asset_class = 'NAV Adjustment' THEN 'NAV Adjustment'
            WHEN m.asset_class = 'Flows' THEN 'Flows'
            WHEN m.asset_class = 'Cash' THEN 'Cash & Cash Equivalents'
            ELSE 'Unknown'
          END as category,
          m.project_id,
          COALESCE(SUM(m.unrealized_market_value), 0) as unrealized_mv,
          COALESCE(SUM(m.realized_market_value), 0) as realized_mv
        FROM tbv_db.fund_mv_db m
        WHERE m.vehicle_id = ${vehicleId}
          AND m.portfolio_date = ${portfolioDate}::date
          AND (m.asset_class IN ('Flows', 'NAV Adjustment', 'Cash') OR m.project_id = 'Other Assets')
        GROUP BY
          CASE
            WHEN m.project_id = 'Other Assets' THEN 'Other Assets'
            WHEN m.asset_class = 'NAV Adjustment' THEN 'NAV Adjustment'
            WHEN m.asset_class = 'Flows' THEN 'Flows'
            WHEN m.asset_class = 'Cash' THEN 'Cash & Cash Equivalents'
            ELSE 'Unknown'
          END,
          m.project_id
      ),
      combined AS (
        -- Combine cost and MV data
        SELECT
          COALESCE(c.category, m.category) as category,
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_mv, 0) as unrealized_mv,
          COALESCE(m.realized_mv, 0) as realized_mv
        FROM excluded_cost c
        FULL OUTER JOIN excluded_mv m
          ON c.category = m.category AND c.project_id = m.project_id
      ),
      aggregated AS (
        SELECT
          category,
          COUNT(DISTINCT project_id)::int as project_count,
          COALESCE(SUM(cost), 0) as cost,
          COALESCE(SUM(unrealized_mv), 0) as unrealized_mv,
          COALESCE(SUM(realized_mv), 0) as realized_mv,
          COALESCE(SUM(unrealized_mv), 0) + COALESCE(SUM(realized_mv), 0) as total_mv
        FROM combined
        WHERE category IS NOT NULL AND category != 'Unknown'
        GROUP BY category
      )
      SELECT
        category,
        project_count,
        cost,
        unrealized_mv,
        realized_mv,
        total_mv
      FROM aggregated
      ORDER BY
        CASE category
          WHEN 'Other Assets' THEN 1
          WHEN 'Cash & Cash Equivalents' THEN 2
          WHEN 'NAV Adjustment' THEN 3
          WHEN 'Flows' THEN 4
          ELSE 5
        END
    `;

    return result;
  } catch (error) {
    console.error('Error fetching excluded positions:', error);
    return [];
  }
}

/**
 * Get individual excluded position details for a specific category
 * Used for expandable rows in SOI page
 */
export async function getExcludedPositionDetails(
  vehicleId: string,
  portfolioDate: string,
  category: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<ExcludedPositionDetail[]> {
  if (!vehicleId || !portfolioDate || !category) {
    return [];
  }

  try {
    // Use date range if provided, otherwise use cumulative up to portfolioDate
    const costDateFilter = dateReportedStart && dateReportedEnd
      ? sql`o.date_reported >= ${dateReportedStart}::date AND o.date_reported <= ${dateReportedEnd}::date`
      : sql`o.date_reported <= ${portfolioDate}::date`;

    // Build category-specific filters
    let costCategoryFilter;
    let mvCategoryFilter;

    switch (category) {
      case 'Other Assets':
        costCategoryFilter = sql`o.project_id = 'Other Assets'`;
        mvCategoryFilter = sql`m.project_id = 'Other Assets'`;
        break;
      case 'Cash & Cash Equivalents':
        costCategoryFilter = sql`o.outcome_type = 'Cash' AND o.project_id != 'Other Assets'`;
        mvCategoryFilter = sql`m.asset_class = 'Cash' AND m.project_id != 'Other Assets'`;
        break;
      case 'NAV Adjustment':
        costCategoryFilter = sql`FALSE`; // No cost data for NAV Adjustment
        mvCategoryFilter = sql`m.asset_class = 'NAV Adjustment' AND m.project_id != 'Other Assets'`;
        break;
      case 'Flows':
        costCategoryFilter = sql`FALSE`; // No cost data for Flows
        mvCategoryFilter = sql`m.asset_class = 'Flows' AND m.project_id != 'Other Assets'`;
        break;
      default:
        return [];
    }

    const result = await sql<ExcludedPositionDetail[]>`
      WITH cost_data AS (
        SELECT
          o.project_id,
          COALESCE(o.project_id, 'Unknown') as description,
          COALESCE(SUM(o.delta_cost), 0) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND ${costDateFilter}
          AND ${costCategoryFilter}
        GROUP BY o.project_id
      ),
      mv_data AS (
        SELECT
          m.project_id,
          COALESCE(m.project_id, 'Unknown') as description,
          COALESCE(SUM(m.unrealized_market_value), 0) as unrealized_mv,
          COALESCE(SUM(m.realized_market_value), 0) as realized_mv
        FROM tbv_db.fund_mv_db m
        WHERE m.vehicle_id = ${vehicleId}
          AND m.portfolio_date = ${portfolioDate}::date
          AND ${mvCategoryFilter}
        GROUP BY m.project_id
      ),
      combined AS (
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.description, m.description) as description,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_mv, 0) as unrealized_mv,
          COALESCE(m.realized_mv, 0) as realized_mv,
          COALESCE(m.unrealized_mv, 0) + COALESCE(m.realized_mv, 0) as total_mv
        FROM cost_data c
        FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      )
      SELECT
        project_id,
        description,
        cost,
        unrealized_mv,
        realized_mv,
        total_mv
      FROM combined
      ORDER BY ABS(total_mv) DESC, ABS(cost) DESC
    `;

    return result;
  } catch (error) {
    console.error('Error fetching excluded position details:', error);
    return [];
  }
}

/**
 * Get totals for excluded positions (for verification)
 */
export async function getExcludedPositionsTotals(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<{ cost: number; unrealized_mv: number; realized_mv: number; total_mv: number }> {
  const positions = await getExcludedPositions(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd);

  return positions.reduce(
    (totals, pos) => ({
      cost: totals.cost + pos.cost,
      unrealized_mv: totals.unrealized_mv + pos.unrealized_mv,
      realized_mv: totals.realized_mv + pos.realized_mv,
      total_mv: totals.total_mv + pos.total_mv,
    }),
    { cost: 0, unrealized_mv: 0, realized_mv: 0, total_mv: 0 }
  );
}
