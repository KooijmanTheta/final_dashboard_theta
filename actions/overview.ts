'use server';

import sql from '@/lib/db';
import { calculateMOIC } from '@/lib/moic-utils';

// Helper function to convert SQL values to numbers (handles string returns from PostgreSQL)
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

// TypeScript interfaces per specification
export interface ProjectCategorySummaryRow {
  category: string;
  project_count: number;
  project_percentage: number;
  avg_ownership: number;
  median_ownership: number;
  cost: number;
  cost_percentage: number;
  realized_mv: number;
  realized_mv_percentage: number;
  unrealized_mv: number;
  unrealized_mv_percentage: number;
  moic: number;
  is_expanded?: boolean;
  children?: CategoryProjectRow[];
}

export interface CategoryProjectRow {
  project_id: string;
  ownership: number;
  cost: number;
  realized_mv: number;
  unrealized_mv: number;
  total_mv: number;
  moic: number;
}

export interface MOICBucketRow {
  bucket: string;
  project_count: number;
  project_percentage: number;
  cost_equity: number;
  cost_tokens: number;
  cost_others: number;
  cost_total: number;
  unrealized_equity: number;
  unrealized_tokens: number;
  unrealized_others: number;
  unrealized_total: number;
  realized_equity: number;
  realized_tokens: number;
  realized_others: number;
  realized_total: number;
  total_mv_equity: number;
  total_mv_tokens: number;
  total_mv_others: number;
  total_mv_total: number;
  moic: number;
  is_expanded?: boolean;
  children?: MOICBucketProjectRow[];
}

export interface MOICBucketProjectRow {
  project_id: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  moic: number;
}

export interface AssetTypeRow {
  asset_type: string;
  is_summary: boolean;
  project_count: number;
  project_percentage: number;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
  is_expanded?: boolean;
  children?: AssetTypeProjectRow[];
}

export interface AssetTypeProjectRow {
  project_id: string;
  project_name: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
}

export interface ValuationStageRow {
  stage: string;
  is_summary: boolean;
  project_count: number;
  project_percentage: number;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
  is_expanded?: boolean;
  children?: ValuationProjectRow[];
}

export interface ValuationProjectRow {
  project_id: string;
  project_name: string;
  valuation: number;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
}

export interface OverviewNotes {
  current_notes: string | null;
  previous_notes: string | null;
  previous_review_date: string | null;
}

export type CategorySelection = 'project_stack' | 'project_tag' | 'project_sub_tag';

/**
 * Table 1: Project Category Summary
 * Aggregates by project_stack, project_tag, or project_sub_tag
 * Uses CUMULATIVE cost (SUM of ALL delta_cost, matching Historical Changes)
 */
export async function getProjectCategorySummary(
  vehicleId: string,
  portfolioDate: string,
  categorySelection: CategorySelection = 'project_stack',
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<ProjectCategorySummaryRow[]> {
  try {
    // Build query based on category selection
    const categoryColumn = categorySelection;

    const result = await sql<{
      category: string | null;
      project_count: number;
      avg_ownership: number | null;
      median_ownership: number | null;
      total_cost: number | null;
      realized_mv: number | null;
      unrealized_mv: number | null;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          o.project_id,
          SUM(o.delta_cost) as cost,
          -- Get latest overall_ownership_percentage for this project
          (SELECT overall_ownership_percentage FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.date_reported <= ${portfolioDate}::date
             AND sub.overall_ownership_percentage IS NOT NULL
           ORDER BY sub.date_reported DESC LIMIT 1) as overall_ownership_percentage
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id
      ),
      mv_data AS (
        -- Market value at exact portfolio_date (aggregated per project)
        SELECT
          project_id,
          SUM(unrealized_market_value) as unrealized_mv,
          SUM(realized_market_value) as realized_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      combined AS (
        -- FULL OUTER JOIN to capture all positions
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          c.overall_ownership_percentage,
          COALESCE(m.unrealized_mv, 0) as unrealized_mv,
          COALESCE(m.realized_mv, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      ),
      with_category AS (
        SELECT
          cb.*,
          p.project_stack,
          p.project_tag,
          p.project_sub_tag
        FROM combined cb
        LEFT JOIN at_tables.at_project_universe_db p ON cb.project_id = p.project_id
      ),
      category_data AS (
        SELECT
          COALESCE(wc.${sql.unsafe(categoryColumn)}, 'Uncategorized') as category,
          COUNT(DISTINCT wc.project_id)::int as project_count,
          AVG(wc.overall_ownership_percentage) as avg_ownership,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wc.overall_ownership_percentage) as median_ownership,
          SUM(wc.cost) as total_cost,
          SUM(wc.realized_mv) as realized_mv,
          SUM(wc.unrealized_mv) as unrealized_mv
        FROM with_category wc
        GROUP BY wc.${sql.unsafe(categoryColumn)}
      )
      SELECT * FROM category_data
      ORDER BY total_cost DESC NULLS LAST
    `;

    // Calculate totals for percentage calculations
    const totalCost = result.reduce((sum, row) => sum + (row.total_cost || 0), 0);
    const totalRealizedMV = result.reduce((sum, row) => sum + (row.realized_mv || 0), 0);
    const totalUnrealizedMV = result.reduce((sum, row) => sum + (row.unrealized_mv || 0), 0);
    const totalProjects = result.reduce((sum, row) => sum + row.project_count, 0);

    const rows: ProjectCategorySummaryRow[] = result.map(row => {
      const cost = row.total_cost || 0;
      const realizedMV = row.realized_mv || 0;
      const unrealizedMV = row.unrealized_mv || 0;
      const totalMV = realizedMV + unrealizedMV;
      const moic = calculateMOIC(totalMV, cost);

      return {
        category: row.category || 'Uncategorized',
        project_count: row.project_count,
        project_percentage: totalProjects > 0 ? (row.project_count / totalProjects) * 100 : 0,
        avg_ownership: row.avg_ownership || 0,
        median_ownership: row.median_ownership || 0,
        cost: cost,
        cost_percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        realized_mv: realizedMV,
        realized_mv_percentage: totalRealizedMV > 0 ? (realizedMV / totalRealizedMV) * 100 : 0,
        unrealized_mv: unrealizedMV,
        unrealized_mv_percentage: totalUnrealizedMV > 0 ? (unrealizedMV / totalUnrealizedMV) * 100 : 0,
        moic: moic,
      };
    });

    console.log(`Category summary fetched for: ${vehicleId}, category: ${categorySelection}, rows: ${rows.length}`);
    return rows;
  } catch (error) {
    console.error('Error fetching category summary:', error);
    return [];
  }
}

/**
 * Table 2: MOIC Buckets
 * Classifies positions into Grand Slams, Home Run, etc.
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 * IMPORTANT: Aggregates at PROJECT level first, then classifies into buckets
 * This ensures each project is counted exactly ONCE (not once per asset class)
 */
export async function getMOICBuckets(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<MOICBucketRow[]> {
  try {
    // Log distinct asset classes found for this vehicle
    const assetClasses = await sql<{ asset_class: string | null }[]>`
      SELECT DISTINCT asset_class
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
      ORDER BY asset_class
    `;
    const assetClassList = assetClasses.map(ac => ac.asset_class || 'NULL').join(', ');
    console.log(`Asset classes found: ${assetClassList}`);

    const result = await sql<{
      bucket: string;
      project_count: number;
      cost_equity: number;
      cost_tokens: number;
      cost_others: number;
      cost_total: number;
      unrealized_equity: number;
      unrealized_tokens: number;
      unrealized_others: number;
      unrealized_total: number;
      realized_equity: number;
      realized_tokens: number;
      realized_others: number;
      realized_total: number;
    }[]>`
      WITH cumulative_cost_by_asset AS (
        -- Cumulative cost per project/asset_class up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          project_id,
          asset_class,
          SUM(delta_cost) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id, asset_class
      ),
      mv_data AS (
        -- Market value at exact portfolio_date
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined_by_asset AS (
        -- FULL OUTER JOIN at asset class level
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.asset_class, m.asset_class) as asset_class,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost_by_asset c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      ),
      project_totals AS (
        -- Aggregate to PROJECT level for MOIC calculation and bucket assignment
        SELECT
          project_id,
          SUM(cost) as total_cost,
          SUM(unrealized_mv) as total_unrealized_mv,
          SUM(realized_mv) as total_realized_mv,
          -- Keep asset class breakdown for reporting
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Equity' THEN cost ELSE 0 END) as cost_equity,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Tokens' THEN cost ELSE 0 END) as cost_tokens,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') NOT IN ('Equity', 'Tokens') THEN cost ELSE 0 END) as cost_others,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Equity' THEN unrealized_mv ELSE 0 END) as unrealized_equity,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Tokens' THEN unrealized_mv ELSE 0 END) as unrealized_tokens,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') NOT IN ('Equity', 'Tokens') THEN unrealized_mv ELSE 0 END) as unrealized_others,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Equity' THEN realized_mv ELSE 0 END) as realized_equity,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Tokens' THEN realized_mv ELSE 0 END) as realized_tokens,
          SUM(CASE WHEN COALESCE(asset_class, 'Unknown') NOT IN ('Equity', 'Tokens') THEN realized_mv ELSE 0 END) as realized_others
        FROM combined_by_asset
        GROUP BY project_id
      ),
      project_with_bucket AS (
        -- Assign bucket based on PROJECT-level MOIC
        SELECT
          project_id,
          total_cost,
          total_unrealized_mv,
          total_realized_mv,
          cost_equity, cost_tokens, cost_others,
          unrealized_equity, unrealized_tokens, unrealized_others,
          realized_equity, realized_tokens, realized_others,
          CASE
            WHEN total_cost IS NULL OR total_cost <= 0 THEN 'Fully Divested / No Cost Basis'
            WHEN total_unrealized_mv = 0 AND total_realized_mv = 0 THEN 'Write Offs'
            WHEN (total_unrealized_mv + total_realized_mv) / NULLIF(total_cost, 0) >= 10 THEN 'Grand Slams'
            WHEN (total_unrealized_mv + total_realized_mv) / NULLIF(total_cost, 0) >= 5 THEN 'Home Run'
            WHEN (total_unrealized_mv + total_realized_mv) / NULLIF(total_cost, 0) >= 2 THEN 'Doubles/Triples'
            WHEN (total_unrealized_mv + total_realized_mv) / NULLIF(total_cost, 0) > 1 THEN 'Base Hit'
            WHEN (total_unrealized_mv + total_realized_mv) / NULLIF(total_cost, 0) >= 0.95 THEN 'Cost'
            WHEN (total_unrealized_mv + total_realized_mv) = 0 THEN 'Write Off'
            ELSE 'Loss'
          END as bucket
        FROM project_totals
      )
      SELECT
        bucket,
        COUNT(*)::int as project_count,
        COALESCE(SUM(cost_equity), 0) as cost_equity,
        COALESCE(SUM(cost_tokens), 0) as cost_tokens,
        COALESCE(SUM(cost_others), 0) as cost_others,
        COALESCE(SUM(total_cost), 0) as cost_total,
        COALESCE(SUM(unrealized_equity), 0) as unrealized_equity,
        COALESCE(SUM(unrealized_tokens), 0) as unrealized_tokens,
        COALESCE(SUM(unrealized_others), 0) as unrealized_others,
        COALESCE(SUM(total_unrealized_mv), 0) as unrealized_total,
        COALESCE(SUM(realized_equity), 0) as realized_equity,
        COALESCE(SUM(realized_tokens), 0) as realized_tokens,
        COALESCE(SUM(realized_others), 0) as realized_others,
        COALESCE(SUM(total_realized_mv), 0) as realized_total
      FROM project_with_bucket
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN 'Grand Slams' THEN 1
          WHEN 'Home Run' THEN 2
          WHEN 'Doubles/Triples' THEN 3
          WHEN 'Base Hit' THEN 4
          WHEN 'Cost' THEN 5
          WHEN 'Loss' THEN 6
          WHEN 'Write Off' THEN 7
          WHEN 'Fully Divested / No Cost Basis' THEN 8
          WHEN 'Write Offs' THEN 9
        END
    `;

    // Calculate totals for percentages
    const totalProjects = result.reduce((sum, row) => sum + toNumber(row.project_count), 0);

    const rows: MOICBucketRow[] = result.map(row => {
      const costTotal = toNumber(row.cost_total);
      const unrealizedTotal = toNumber(row.unrealized_total);
      const realizedTotal = toNumber(row.realized_total);
      const totalMV = unrealizedTotal + realizedTotal;
      const moic = calculateMOIC(totalMV, costTotal);

      return {
        bucket: row.bucket,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost_equity: toNumber(row.cost_equity),
        cost_tokens: toNumber(row.cost_tokens),
        cost_others: toNumber(row.cost_others),
        cost_total: costTotal,
        unrealized_equity: toNumber(row.unrealized_equity),
        unrealized_tokens: toNumber(row.unrealized_tokens),
        unrealized_others: toNumber(row.unrealized_others),
        unrealized_total: unrealizedTotal,
        realized_equity: toNumber(row.realized_equity),
        realized_tokens: toNumber(row.realized_tokens),
        realized_others: toNumber(row.realized_others),
        realized_total: realizedTotal,
        total_mv_equity: toNumber(row.unrealized_equity) + toNumber(row.realized_equity),
        total_mv_tokens: toNumber(row.unrealized_tokens) + toNumber(row.realized_tokens),
        total_mv_others: toNumber(row.unrealized_others) + toNumber(row.realized_others),
        total_mv_total: totalMV,
        moic: moic,
        is_expanded: false,
        children: [],
      };
    });

    console.log(`MOIC buckets fetched for: ${vehicleId}, buckets: ${rows.length}`);
    return rows;
  } catch (error) {
    console.error('Error fetching MOIC buckets:', error);
    return [];
  }
}

/**
 * Get projects within a specific MOIC bucket (for expandable rows)
 * Aggregates by project_id (combines all asset classes)
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 * Uses SUM of ALL delta_cost (matching Historical Changes logic)
 */
export async function getMOICBucketProjects(
  vehicleId: string,
  portfolioDate: string,
  bucket: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<MOICBucketProjectRow[]> {
  try {
    const result = await sql<{
      project_id: string;
      cost: number;
      unrealized_mv: number;
      realized_mv: number;
      moic: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          project_id,
          SUM(delta_cost) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      mv_data AS (
        -- Market value at exact portfolio_date (aggregated per project)
        SELECT
          project_id,
          SUM(unrealized_market_value) as unrealized_mv,
          SUM(realized_market_value) as realized_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      combined AS (
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_mv, 0) as unrealized_mv,
          COALESCE(m.realized_mv, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      ),
      project_with_bucket AS (
        SELECT
          project_id,
          cost,
          unrealized_mv,
          realized_mv,
          CASE WHEN cost > 0 THEN (unrealized_mv + realized_mv) / cost ELSE 0 END as moic,
          CASE
            WHEN cost IS NULL OR cost <= 0 THEN 'Fully Divested / No Cost Basis'
            WHEN unrealized_mv = 0 AND realized_mv = 0 THEN 'Write Offs'
            WHEN (unrealized_mv + realized_mv) / NULLIF(cost, 0) >= 10 THEN 'Grand Slams'
            WHEN (unrealized_mv + realized_mv) / NULLIF(cost, 0) >= 5 THEN 'Home Run'
            WHEN (unrealized_mv + realized_mv) / NULLIF(cost, 0) >= 2 THEN 'Doubles/Triples'
            WHEN (unrealized_mv + realized_mv) / NULLIF(cost, 0) > 1 THEN 'Base Hit'
            WHEN (unrealized_mv + realized_mv) / NULLIF(cost, 0) >= 0.95 THEN 'Cost'
            WHEN (unrealized_mv + realized_mv) = 0 THEN 'Write Off'
            ELSE 'Loss'
          END as bucket
        FROM combined
      )
      SELECT
        project_id,
        cost,
        unrealized_mv,
        realized_mv,
        moic
      FROM project_with_bucket
      WHERE bucket = ${bucket}
      ORDER BY cost DESC
    `;

    return result.map(row => ({
      project_id: row.project_id,
      cost: row.cost || 0,
      unrealized_mv: row.unrealized_mv,
      realized_mv: row.realized_mv,
      moic: row.moic || 0,
    }));
  } catch (error) {
    console.error('Error fetching MOIC bucket projects:', error);
    return [];
  }
}

/**
 * Table 3: Asset Type Breakdown
 * Classifies into Equity Downrounds/Uprounds/Cost, TGEd Tokens, Non-TGEd Tokens, Liquid
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 */
export async function getAssetTypeBreakdown(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<AssetTypeRow[]> {
  try {
    // Log distinct asset classes found for this vehicle
    const assetClasses = await sql<{ asset_class: string | null }[]>`
      SELECT DISTINCT asset_class
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
      ORDER BY asset_class
    `;
    const assetClassList = assetClasses.map(ac => ac.asset_class || 'NULL').join(', ');
    console.log(`[AssetTypeBreakdown] Asset classes found: ${assetClassList}`);

    // Get per-asset-type breakdown with cumulative cost
    // Uses SUM of ALL delta_cost (matching Historical Changes logic)
    const result = await sql<{
      asset_type: string;
      project_count: number;
      total_cost: number;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project/asset_class up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          o.project_id,
          o.asset_class,
          -- Get latest established_type for this position
          (SELECT established_type FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.asset_class IS NOT DISTINCT FROM o.asset_class
             AND sub.date_reported <= ${portfolioDate}::date
           ORDER BY sub.date_reported DESC LIMIT 1) as established_type,
          SUM(o.delta_cost) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id, o.asset_class
      ),
      mv_data AS (
        -- Market value at exact portfolio_date
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        -- FULL OUTER JOIN to capture all positions
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.asset_class, m.asset_class) as asset_class,
          c.established_type,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      ),
      asset_classification AS (
        SELECT
          cb.project_id,
          cb.asset_class,
          cb.cost,
          cb.unrealized_mv,
          cb.realized_mv,
          p.coingecko_id,
          CASE
            WHEN cb.established_type = 'Liquid' THEN 'Liquid'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' AND cb.unrealized_mv < cb.cost THEN 'Equity Downrounds'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' AND cb.unrealized_mv > cb.cost THEN 'Equity Uprounds'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' THEN 'Equity Cost'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' AND p.coingecko_id IS NOT NULL AND cb.established_type = 'Private' THEN 'TGEd Tokens (Private)'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' AND p.coingecko_id IS NULL AND cb.established_type = 'Private' THEN 'Non-TGEd Tokens (Private)'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' THEN 'Other Tokens'
            ELSE 'Other (' || COALESCE(cb.asset_class, 'Unknown') || ')'
          END as asset_type
        FROM combined cb
        LEFT JOIN at_tables.at_project_universe_db p ON cb.project_id = p.project_id
      )
      SELECT
        asset_type,
        COUNT(DISTINCT project_id)::int as project_count,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(SUM(unrealized_mv), 0) as unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as realized_mv
      FROM asset_classification
      GROUP BY asset_type
      ORDER BY
        CASE
          WHEN asset_type = 'Equity Downrounds' THEN 1
          WHEN asset_type = 'Equity Uprounds' THEN 2
          WHEN asset_type = 'Equity Cost' THEN 3
          WHEN asset_type = 'TGEd Tokens (Private)' THEN 4
          WHEN asset_type = 'Non-TGEd Tokens (Private)' THEN 5
          WHEN asset_type = 'Other Tokens' THEN 6
          WHEN asset_type = 'Liquid' THEN 7
          WHEN asset_type LIKE 'Other%' THEN 8
          ELSE 9
        END, asset_type
    `;

    // Get grand totals with cumulative cost
    // Uses SUM of ALL delta_cost (matching Historical Changes logic)
    const grandTotals = await sql<{
      total_project_count: number;
      total_cost: number;
      total_unrealized_mv: number;
      total_realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        SELECT
          project_id,
          asset_class,
          SUM(delta_cost) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id, asset_class
      ),
      mv_data AS (
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      )
      SELECT
        COUNT(DISTINCT project_id)::int as total_project_count,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(SUM(unrealized_mv), 0) as total_unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as total_realized_mv
      FROM combined
    `;

    const gt = grandTotals[0] || { total_project_count: 0, total_cost: 0, total_unrealized_mv: 0, total_realized_mv: 0 };
    const grandTotal = {
      total_project_count: toNumber(gt.total_project_count),
      total_cost: toNumber(gt.total_cost),
      total_unrealized_mv: toNumber(gt.total_unrealized_mv),
      total_realized_mv: toNumber(gt.total_realized_mv),
    };
    const totalProjects = grandTotal.total_project_count;

    // Build rows with summary rows
    const rows: AssetTypeRow[] = [];

    // Equity types
    const equityTypes = result.filter(r => r.asset_type.startsWith('Equity'));
    const equitySummary = {
      project_count: equityTypes.reduce((sum, r) => sum + toNumber(r.project_count), 0),
      cost: equityTypes.reduce((sum, r) => sum + toNumber(r.total_cost), 0),
      unrealized_mv: equityTypes.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0),
      realized_mv: equityTypes.reduce((sum, r) => sum + toNumber(r.realized_mv), 0),
    };

    // Add equity rows
    equityTypes.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        asset_type: row.asset_type,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    // Add equity summary
    if (equityTypes.length > 0) {
      const totalMV = equitySummary.unrealized_mv + equitySummary.realized_mv;
      rows.push({
        asset_type: 'TOTAL Equity',
        is_summary: true,
        project_count: equitySummary.project_count,
        project_percentage: totalProjects > 0 ? (equitySummary.project_count / totalProjects) * 100 : 0,
        cost: equitySummary.cost,
        unrealized_mv: equitySummary.unrealized_mv,
        realized_mv: equitySummary.realized_mv,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, equitySummary.cost),
      });
    }

    // Token types
    const tokenTypes = result.filter(r => r.asset_type.includes('Token'));
    const tokenSummary = {
      project_count: tokenTypes.reduce((sum, r) => sum + toNumber(r.project_count), 0),
      cost: tokenTypes.reduce((sum, r) => sum + toNumber(r.total_cost), 0),
      unrealized_mv: tokenTypes.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0),
      realized_mv: tokenTypes.reduce((sum, r) => sum + toNumber(r.realized_mv), 0),
    };

    // Add token rows
    tokenTypes.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        asset_type: row.asset_type,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    // Add token summary
    if (tokenTypes.length > 0) {
      const totalMV = tokenSummary.unrealized_mv + tokenSummary.realized_mv;
      rows.push({
        asset_type: 'TOTAL Tokens',
        is_summary: true,
        project_count: tokenSummary.project_count,
        project_percentage: totalProjects > 0 ? (tokenSummary.project_count / totalProjects) * 100 : 0,
        cost: tokenSummary.cost,
        unrealized_mv: tokenSummary.unrealized_mv,
        realized_mv: tokenSummary.realized_mv,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, tokenSummary.cost),
      });
    }

    // Other types (Liquid, Other)
    const otherTypes = result.filter(r => !r.asset_type.startsWith('Equity') && !r.asset_type.includes('Token'));
    otherTypes.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        asset_type: row.asset_type,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    // Grand total - use properly calculated totals from SQL
    const grandTotalMV = grandTotal.total_unrealized_mv + grandTotal.total_realized_mv;
    rows.push({
      asset_type: 'TOTAL',
      is_summary: true,
      project_count: grandTotal.total_project_count,
      project_percentage: 100,
      cost: grandTotal.total_cost,
      unrealized_mv: grandTotal.total_unrealized_mv,
      realized_mv: grandTotal.total_realized_mv,
      total_mv: grandTotalMV,
      moic: calculateMOIC(grandTotalMV, grandTotal.total_cost),
    });

    console.log(`Asset type breakdown fetched for: ${vehicleId}, rows: ${rows.length}, total projects: ${totalProjects}, total cost: ${grandTotal.total_cost}, total MV: ${grandTotalMV}, MOIC: ${grandTotal.total_cost > 0 ? (grandTotalMV / grandTotal.total_cost).toFixed(2) : 0}`);
    return rows;
  } catch (error) {
    console.error('Error fetching asset type breakdown:', error);
    return [];
  }
}

/**
 * Table 4: Valuation Breakdown
 * Classifies by valuation stage (Pre-Seed, Seed, Series A, Series B, Growth)
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 */
export async function getValuationBreakdown(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<ValuationStageRow[]> {
  try {
    // Log distinct asset classes found for this vehicle
    const assetClasses = await sql<{ asset_class: string | null }[]>`
      SELECT DISTINCT asset_class
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
      ORDER BY asset_class
    `;
    const assetClassList = assetClasses.map(ac => ac.asset_class || 'NULL').join(', ');
    console.log(`[ValuationBreakdown] Asset classes found: ${assetClassList}`);

    // Uses SUM of ALL delta_cost (matching Historical Changes logic)
    const result = await sql<{
      valuation_stage: string;
      project_count: number;
      total_cost: number;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project/asset_class up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        -- Also get the latest overall_valuation for each position
        SELECT
          o.project_id,
          o.asset_class,
          SUM(o.delta_cost) as cost,
          -- Get latest overall_valuation for this position
          (SELECT overall_valuation FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.asset_class IS NOT DISTINCT FROM o.asset_class
             AND sub.date_reported <= ${portfolioDate}::date
             AND sub.overall_valuation IS NOT NULL
           ORDER BY sub.date_reported DESC LIMIT 1) as overall_valuation
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id, o.asset_class
      ),
      mv_data AS (
        -- Market value at exact portfolio_date
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        -- FULL OUTER JOIN to capture all positions
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.asset_class, m.asset_class) as asset_class,
          c.overall_valuation,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      ),
      valuation_classification AS (
        SELECT
          project_id,
          cost,
          unrealized_mv,
          realized_mv,
          CASE
            WHEN overall_valuation IS NULL THEN 'Unknown'
            WHEN overall_valuation < 25000000 THEN 'Early Stage: Pre-Seed'
            WHEN overall_valuation < 50000000 THEN 'Early Stage: Seed'
            WHEN overall_valuation < 150000000 THEN 'Mid Stage: Series A'
            WHEN overall_valuation < 250000000 THEN 'Late Stage: Series B'
            ELSE 'Late Stage: Growth'
          END as valuation_stage
        FROM combined
      )
      SELECT
        valuation_stage,
        COUNT(DISTINCT project_id)::int as project_count,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(SUM(unrealized_mv), 0) as unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as realized_mv
      FROM valuation_classification
      GROUP BY valuation_stage
      ORDER BY
        CASE valuation_stage
          WHEN 'Early Stage: Pre-Seed' THEN 1
          WHEN 'Early Stage: Seed' THEN 2
          WHEN 'Mid Stage: Series A' THEN 3
          WHEN 'Late Stage: Series B' THEN 4
          WHEN 'Late Stage: Growth' THEN 5
          WHEN 'Unknown' THEN 6
        END
    `;

    // Get grand totals with cumulative cost
    // Uses SUM of ALL delta_cost (matching Historical Changes logic)
    const grandTotals = await sql<{
      total_project_count: number;
      total_cost: number;
      total_unrealized_mv: number;
      total_realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        SELECT
          project_id,
          asset_class,
          SUM(delta_cost) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id, asset_class
      ),
      mv_data AS (
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      )
      SELECT
        COUNT(DISTINCT project_id)::int as total_project_count,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(SUM(unrealized_mv), 0) as total_unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as total_realized_mv
      FROM combined
    `;

    const gt = grandTotals[0] || { total_project_count: 0, total_cost: 0, total_unrealized_mv: 0, total_realized_mv: 0 };
    const grandTotal = {
      total_project_count: toNumber(gt.total_project_count),
      total_cost: toNumber(gt.total_cost),
      total_unrealized_mv: toNumber(gt.total_unrealized_mv),
      total_realized_mv: toNumber(gt.total_realized_mv),
    };
    const totalProjects = grandTotal.total_project_count;

    // Build rows with summary rows
    const rows: ValuationStageRow[] = [];

    // Early stage
    const earlyStages = result.filter(r => r.valuation_stage.startsWith('Early Stage'));
    const earlySummary = {
      project_count: earlyStages.reduce((sum, r) => sum + toNumber(r.project_count), 0),
      cost: earlyStages.reduce((sum, r) => sum + toNumber(r.total_cost), 0),
      unrealized_mv: earlyStages.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0),
      realized_mv: earlyStages.reduce((sum, r) => sum + toNumber(r.realized_mv), 0),
    };

    earlyStages.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        stage: row.valuation_stage,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    if (earlyStages.length > 0) {
      const totalMV = earlySummary.unrealized_mv + earlySummary.realized_mv;
      rows.push({
        stage: 'TOTAL Early Stage',
        is_summary: true,
        project_count: earlySummary.project_count,
        project_percentage: totalProjects > 0 ? (earlySummary.project_count / totalProjects) * 100 : 0,
        cost: earlySummary.cost,
        unrealized_mv: earlySummary.unrealized_mv,
        realized_mv: earlySummary.realized_mv,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, earlySummary.cost),
      });
    }

    // Mid stage
    const midStages = result.filter(r => r.valuation_stage.startsWith('Mid Stage'));
    const midSummary = {
      project_count: midStages.reduce((sum, r) => sum + toNumber(r.project_count), 0),
      cost: midStages.reduce((sum, r) => sum + toNumber(r.total_cost), 0),
      unrealized_mv: midStages.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0),
      realized_mv: midStages.reduce((sum, r) => sum + toNumber(r.realized_mv), 0),
    };

    midStages.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        stage: row.valuation_stage,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    if (midStages.length > 0) {
      const totalMV = midSummary.unrealized_mv + midSummary.realized_mv;
      rows.push({
        stage: 'TOTAL Mid Stage',
        is_summary: true,
        project_count: midSummary.project_count,
        project_percentage: totalProjects > 0 ? (midSummary.project_count / totalProjects) * 100 : 0,
        cost: midSummary.cost,
        unrealized_mv: midSummary.unrealized_mv,
        realized_mv: midSummary.realized_mv,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, midSummary.cost),
      });
    }

    // Late stage
    const lateStages = result.filter(r => r.valuation_stage.startsWith('Late Stage'));
    const lateSummary = {
      project_count: lateStages.reduce((sum, r) => sum + toNumber(r.project_count), 0),
      cost: lateStages.reduce((sum, r) => sum + toNumber(r.total_cost), 0),
      unrealized_mv: lateStages.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0),
      realized_mv: lateStages.reduce((sum, r) => sum + toNumber(r.realized_mv), 0),
    };

    lateStages.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        stage: row.valuation_stage,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    if (lateStages.length > 0) {
      const totalMV = lateSummary.unrealized_mv + lateSummary.realized_mv;
      rows.push({
        stage: 'TOTAL Late Stage',
        is_summary: true,
        project_count: lateSummary.project_count,
        project_percentage: totalProjects > 0 ? (lateSummary.project_count / totalProjects) * 100 : 0,
        cost: lateSummary.cost,
        unrealized_mv: lateSummary.unrealized_mv,
        realized_mv: lateSummary.realized_mv,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, lateSummary.cost),
      });
    }

    // Unknown
    const unknownStages = result.filter(r => r.valuation_stage === 'Unknown');
    unknownStages.forEach(row => {
      const cost = toNumber(row.total_cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      rows.push({
        stage: row.valuation_stage,
        is_summary: false,
        project_count: toNumber(row.project_count),
        project_percentage: totalProjects > 0 ? (toNumber(row.project_count) / totalProjects) * 100 : 0,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      });
    });

    // Grand total - use properly calculated totals from SQL
    const grandTotalMV = grandTotal.total_unrealized_mv + grandTotal.total_realized_mv;
    rows.push({
      stage: 'TOTAL',
      is_summary: true,
      project_count: grandTotal.total_project_count,
      project_percentage: 100,
      cost: grandTotal.total_cost,
      unrealized_mv: grandTotal.total_unrealized_mv,
      realized_mv: grandTotal.total_realized_mv,
      total_mv: grandTotalMV,
      moic: calculateMOIC(grandTotalMV, grandTotal.total_cost),
    });

    console.log(`Valuation breakdown fetched for: ${vehicleId}, rows: ${rows.length}, total projects: ${totalProjects}, total cost: ${grandTotal.total_cost}, total MV: ${grandTotalMV}, MOIC: ${grandTotal.total_cost > 0 ? (grandTotalMV / grandTotal.total_cost).toFixed(2) : 0}`);
    return rows;
  } catch (error) {
    console.error('Error fetching valuation breakdown:', error);
    return [];
  }
}

/**
 * Get projects within a specific category (for expandable rows in Category Summary)
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 * Uses SUM of ALL delta_cost (matching Historical Changes logic)
 */
export async function getCategoryProjects(
  vehicleId: string,
  portfolioDate: string,
  category: string,
  categorySelection: CategorySelection,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<CategoryProjectRow[]> {
  try {
    const categoryColumn = categorySelection;

    const result = await sql<{
      project_id: string;
      ownership: number;
      cost: number;
      realized_mv: number;
      unrealized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          o.project_id,
          SUM(o.delta_cost) as cost,
          -- Get latest overall_ownership_percentage for this project
          (SELECT overall_ownership_percentage FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.date_reported <= ${portfolioDate}::date
             AND sub.overall_ownership_percentage IS NOT NULL
           ORDER BY sub.date_reported DESC LIMIT 1) as overall_ownership_percentage
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id
      ),
      mv_data AS (
        -- Market value at exact portfolio_date (aggregated per project)
        SELECT
          project_id,
          SUM(unrealized_market_value) as unrealized_mv,
          SUM(realized_market_value) as realized_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      combined AS (
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.cost, 0) as cost,
          c.overall_ownership_percentage,
          COALESCE(m.unrealized_mv, 0) as unrealized_mv,
          COALESCE(m.realized_mv, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      ),
      with_category AS (
        SELECT
          cb.*,
          p.project_stack,
          p.project_tag,
          p.project_sub_tag
        FROM combined cb
        LEFT JOIN at_tables.at_project_universe_db p ON cb.project_id = p.project_id
      )
      SELECT
        project_id,
        COALESCE(overall_ownership_percentage, 0) as ownership,
        cost,
        realized_mv,
        unrealized_mv
      FROM with_category
      WHERE COALESCE(${sql.unsafe(categoryColumn)}, 'Uncategorized') = ${category}
      ORDER BY cost DESC
    `;

    return result.map(row => {
      const cost = toNumber(row.cost);
      const realizedMV = toNumber(row.realized_mv);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const totalMV = realizedMV + unrealizedMV;
      return {
        project_id: row.project_id,
        ownership: toNumber(row.ownership),
        cost: cost,
        realized_mv: realizedMV,
        unrealized_mv: unrealizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      };
    });
  } catch (error) {
    console.error('Error fetching category projects:', error);
    return [];
  }
}

/**
 * Get projects within a specific asset type (for expandable rows in Asset Type Breakdown)
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 * Uses SUM of ALL delta_cost (matching Historical Changes logic)
 */
export async function getAssetTypeProjects(
  vehicleId: string,
  portfolioDate: string,
  assetType: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<AssetTypeProjectRow[]> {
  console.log(`[getAssetTypeProjects] START - assetType="${assetType}", vehicleId=${vehicleId}, portfolioDate=${portfolioDate}`);
  try {
    const result = await sql<{
      project_id: string;
      cost: number;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project/asset_class up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        SELECT
          o.project_id,
          o.asset_class,
          -- Get latest established_type for this position
          (SELECT established_type FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.asset_class IS NOT DISTINCT FROM o.asset_class
             AND sub.date_reported <= ${portfolioDate}::date
           ORDER BY sub.date_reported DESC LIMIT 1) as established_type,
          SUM(o.delta_cost) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id, o.asset_class
      ),
      mv_data AS (
        -- Market value at exact portfolio_date
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        -- FULL OUTER JOIN to capture all positions
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          COALESCE(c.asset_class, m.asset_class) as asset_class,
          c.established_type,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      ),
      asset_classification AS (
        SELECT
          cb.project_id,
          cb.cost,
          cb.unrealized_mv,
          cb.realized_mv,
          CASE
            WHEN cb.established_type = 'Liquid' THEN 'Liquid'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' AND cb.unrealized_mv < cb.cost THEN 'Equity Downrounds'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' AND cb.unrealized_mv > cb.cost THEN 'Equity Uprounds'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Equity' THEN 'Equity Cost'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' AND p.coingecko_id IS NOT NULL AND cb.established_type = 'Private' THEN 'TGEd Tokens (Private)'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' AND p.coingecko_id IS NULL AND cb.established_type = 'Private' THEN 'Non-TGEd Tokens (Private)'
            WHEN COALESCE(cb.asset_class, 'Unknown') = 'Tokens' THEN 'Other Tokens'
            ELSE 'Other (' || COALESCE(cb.asset_class, 'Unknown') || ')'
          END as asset_type
        FROM combined cb
        LEFT JOIN at_tables.at_project_universe_db p ON cb.project_id = p.project_id
      )
      SELECT
        project_id,
        COALESCE(SUM(cost), 0) as cost,
        COALESCE(SUM(unrealized_mv), 0) as unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as realized_mv
      FROM asset_classification
      WHERE asset_type = ${assetType}
      GROUP BY project_id
      ORDER BY cost DESC
    `;

    console.log(`[getAssetTypeProjects] Fetching projects for assetType="${assetType}", vehicleId=${vehicleId}, portfolioDate=${portfolioDate}, results: ${result.length}`);

    return result.map(row => {
      const cost = toNumber(row.cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      return {
        project_id: row.project_id,
        project_name: row.project_id,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      };
    });
  } catch (error) {
    console.error('Error fetching asset type projects:', error);
    return [];
  }
}

/**
 * Get projects within a specific valuation stage (for expandable rows in Valuation Stage Breakdown)
 * Uses CUMULATIVE cost (date_reported <= portfolioDate) and portfolioDate for market value
 * Uses SUM of ALL delta_cost (matching Historical Changes logic)
 */
export async function getValuationStageProjects(
  vehicleId: string,
  portfolioDate: string,
  stage: string,
  dateReportedStart?: string,
  dateReportedEnd?: string
): Promise<ValuationProjectRow[]> {
  console.log(`[getValuationStageProjects] START - stage="${stage}", vehicleId=${vehicleId}, portfolioDate=${portfolioDate}`);
  try {
    const result = await sql<{
      project_id: string;
      valuation: number;
      cost: number;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      WITH cumulative_cost AS (
        -- Cumulative cost per project/asset_class up to portfolio_date
        -- Uses SUM of ALL delta_cost (matching Historical Changes logic)
        -- Also get the latest overall_valuation for each position
        SELECT
          o.project_id,
          o.asset_class,
          SUM(o.delta_cost) as cost,
          -- Get latest overall_valuation for this position
          (SELECT overall_valuation FROM at_tables.at_ownership_db_v2 sub
           WHERE sub.vehicle_id = ${vehicleId}
             AND sub.project_id = o.project_id
             AND sub.asset_class IS NOT DISTINCT FROM o.asset_class
             AND sub.date_reported <= ${portfolioDate}::date
             AND sub.overall_valuation IS NOT NULL
           ORDER BY sub.date_reported DESC LIMIT 1) as overall_valuation
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id, o.asset_class
      ),
      mv_data AS (
        -- Market value at exact portfolio_date
        SELECT
          project_id,
          asset_class,
          unrealized_market_value,
          realized_market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
      ),
      combined AS (
        -- FULL OUTER JOIN to capture all positions
        SELECT
          COALESCE(c.project_id, m.project_id) as project_id,
          c.overall_valuation,
          COALESCE(c.cost, 0) as cost,
          COALESCE(m.unrealized_market_value, 0) as unrealized_mv,
          COALESCE(m.realized_market_value, 0) as realized_mv
        FROM cumulative_cost c
        FULL OUTER JOIN mv_data m
          ON c.project_id = m.project_id
          AND COALESCE(c.asset_class, 'Unknown') = COALESCE(m.asset_class, 'Unknown')
      ),
      valuation_classification AS (
        SELECT
          project_id,
          overall_valuation,
          cost,
          unrealized_mv,
          realized_mv,
          CASE
            WHEN overall_valuation IS NULL THEN 'Unknown'
            WHEN overall_valuation < 25000000 THEN 'Early Stage: Pre-Seed'
            WHEN overall_valuation < 50000000 THEN 'Early Stage: Seed'
            WHEN overall_valuation < 150000000 THEN 'Mid Stage: Series A'
            WHEN overall_valuation < 250000000 THEN 'Late Stage: Series B'
            ELSE 'Late Stage: Growth'
          END as valuation_stage
        FROM combined
      )
      SELECT
        project_id,
        COALESCE(MAX(overall_valuation), 0) as valuation,
        COALESCE(SUM(cost), 0) as cost,
        COALESCE(SUM(unrealized_mv), 0) as unrealized_mv,
        COALESCE(SUM(realized_mv), 0) as realized_mv
      FROM valuation_classification
      WHERE valuation_stage = ${stage}
      GROUP BY project_id
      ORDER BY cost DESC
    `;

    console.log(`[getValuationStageProjects] Fetching projects for stage="${stage}", vehicleId=${vehicleId}, portfolioDate=${portfolioDate}, results: ${result.length}`);

    return result.map(row => {
      const cost = toNumber(row.cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      return {
        project_id: row.project_id,
        project_name: row.project_id,
        valuation: toNumber(row.valuation),
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      };
    });
  } catch (error) {
    console.error('Error fetching valuation stage projects:', error);
    return [];
  }
}

/**
 * Section 5: Notes
 * Fetches notes from section_summaries table
 */
export async function getOverviewNotes(
  vehicleId: string,
  dateOfReview: string
): Promise<OverviewNotes> {
  try {
    // Try to fetch current notes (cast section_id to match types)
    const currentResult = await sql<{
      summary_text: string;
    }[]>`
      SELECT ss.summary_text
      FROM reports.section_summaries ss
      JOIN reports.report_sections rs ON ss.section_id::text = rs.section_id::text
      WHERE ss.vehicle_id = ${vehicleId}
        AND ss.review_date = ${dateOfReview}::date
        AND rs.section_code = 'overview'
      LIMIT 1
    `;

    // Try to fetch previous notes (cast section_id to match types)
    const previousResult = await sql<{
      review_date: string;
      summary_text: string;
    }[]>`
      SELECT
        ss.review_date::text,
        ss.summary_text
      FROM reports.section_summaries ss
      JOIN reports.report_sections rs ON ss.section_id::text = rs.section_id::text
      WHERE ss.vehicle_id = ${vehicleId}
        AND ss.review_date < ${dateOfReview}::date
        AND rs.section_code = 'overview'
      ORDER BY ss.review_date DESC
      LIMIT 1
    `;

    return {
      current_notes: currentResult[0]?.summary_text || null,
      previous_notes: previousResult[0]?.summary_text || null,
      previous_review_date: previousResult[0]?.review_date || null,
    };
  } catch (error) {
    // Notes table may not exist - return empty
    console.log('Overview notes not available (table may not exist):', error);
    return {
      current_notes: null,
      previous_notes: null,
      previous_review_date: null,
    };
  }
}
