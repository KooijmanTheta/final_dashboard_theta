'use server';

import sql from '@/lib/db';
import { calculateMOIC } from '@/lib/moic-utils';

// Helper to convert PostgreSQL numeric strings to numbers
function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// ============================================================================
// Types
// ============================================================================

export type OwnershipType = 'Established' | 'Top Up' | 'All';

export interface NewInvestmentRow {
  project_id: string;
  asset_class: string;
  cost: number;
  valuation_token: number | null;
  valuation_equity: number | null;
  established_type: string | null;
  instrument_types: string;
  outcome_type: string | null;
}

export interface NewInvestmentProjectRow {
  project_id: string;
  cost: number;
  valuation_token: number | null;
  valuation_equity: number | null;
  established_type: string | null;
  has_multiple_asset_classes: boolean;
}

export interface NewInvestmentAssetRow {
  project_id: string;
  asset_class: string;
  cost: number;
  instrument_types: string;
  outcome_type: string | null;
}

export interface TopMVRow {
  project_id: string;
  cost: number;
  cost_percentage: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  mv_percentage: number;
  moic: number;
  qtd_weighted: number | null;
  qtd_line_item: number | null;
  liveness_score: number | null;
  is_expandable: boolean;
}

export interface TopMVAssetRow {
  asset_class: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
}

export interface TopCostRow {
  project_id: string;
  total_cost: number;
  total_cost_percentage: number;
  established_cost: number;
  established_cost_percentage: number;
  topup_cost: number;
  topup_cost_percentage: number;
  divested_cost: number;
  divested_cost_percentage: number;
  liveness_score: number | null;
}

export interface TopCostProjectRow {
  ownership_id: string;
  asset_class: string;
  ownership_type: string;
  cost: number;
  date_reported: string;
}

// ============================================================================
// Table 1: New Investments & Top Ups
// ============================================================================

/**
 * Get available investment dates for the New Investments filter
 * Returns distinct date_reported values in descending order
 */
export async function getAvailableInvestmentDates(
  vehicleId: string
): Promise<string[]> {
  try {
    const result = await sql<{ date_reported: string }[]>`
      SELECT DISTINCT TO_CHAR(date_reported, 'YYYY-MM-DD') as date_reported
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND ownership_type IN ('Established', 'Top Up')
      ORDER BY date_reported DESC
    `;

    console.log(`[getAvailableInvestmentDates] Found ${result.length} dates for vehicle ${vehicleId}`);

    return result.map(row => row.date_reported);
  } catch (error) {
    console.error('Error fetching available investment dates:', error);
    return [];
  }
}

/**
 * Get new investments and top-ups for a vehicle within a date range
 */
export async function getNewInvestments(
  vehicleId: string,
  ownershipType: OwnershipType,
  dateReportedStart: string,
  dateReportedEnd: string
): Promise<NewInvestmentRow[]> {
  try {
    let ownershipFilter = '';
    if (ownershipType === 'Established') {
      ownershipFilter = `AND o.ownership_type = 'Established'`;
    } else if (ownershipType === 'Top Up') {
      ownershipFilter = `AND o.ownership_type = 'Top Up'`;
    }

    const result = await sql<{
      project_id: string;
      asset_class: string;
      cost: number;
      valuation_token: number | null;
      valuation_equity: number | null;
      established_type: string | null;
      instrument_types: string;
      outcome_type: string | null;
    }[]>`
      SELECT
        o.project_id,
        COALESCE(o.asset_class, 'Unknown') as asset_class,
        COALESCE(SUM(o.delta_cost), 0) as cost,
        MAX(o.entry_valuation_token) as valuation_token,
        MAX(o.entry_valuation_equity) as valuation_equity,
        MAX(o.established_type) as established_type,
        STRING_AGG(DISTINCT o.instrument_type_standardized, ', ') as instrument_types,
        MAX(o.outcome_type) as outcome_type
      FROM at_tables.at_ownership_db_v2 o
      WHERE o.vehicle_id = ${vehicleId}
        AND o.date_reported >= ${dateReportedStart}::date
        AND o.date_reported <= ${dateReportedEnd}::date
        ${sql.unsafe(ownershipFilter)}
      GROUP BY o.project_id, o.asset_class
      ORDER BY cost DESC
    `;

    console.log(`[getNewInvestments] Fetched ${result.length} rows for vehicle ${vehicleId}`);

    return result.map(row => ({
      project_id: row.project_id,
      asset_class: row.asset_class,
      cost: toNumber(row.cost),
      valuation_token: row.valuation_token ? toNumber(row.valuation_token) : null,
      valuation_equity: row.valuation_equity ? toNumber(row.valuation_equity) : null,
      established_type: row.established_type,
      instrument_types: row.instrument_types || '',
      outcome_type: row.outcome_type,
    }));
  } catch (error) {
    console.error('Error fetching new investments:', error);
    return [];
  }
}

/**
 * Get new investments aggregated by project (for expandable table)
 * Filters by exact investmentDate (date_reported) and ownership_type
 */
export async function getNewInvestmentsAggregated(
  vehicleId: string,
  ownershipType: OwnershipType,
  investmentDate: string
): Promise<NewInvestmentProjectRow[]> {
  try {
    let ownershipFilter = `AND o.ownership_type IN ('Established', 'Top Up')`;
    if (ownershipType === 'Established') {
      ownershipFilter = `AND o.ownership_type = 'Established'`;
    } else if (ownershipType === 'Top Up') {
      ownershipFilter = `AND o.ownership_type = 'Top Up'`;
    }

    const result = await sql<{
      project_id: string;
      cost: number;
      valuation_token: number | null;
      valuation_equity: number | null;
      established_type: string | null;
      asset_class_count: number;
    }[]>`
      SELECT
        o.project_id,
        COALESCE(SUM(o.delta_cost), 0) as cost,
        MAX(o.entry_valuation_token) as valuation_token,
        MAX(o.entry_valuation_equity) as valuation_equity,
        MAX(o.established_type) as established_type,
        COUNT(DISTINCT o.asset_class)::int as asset_class_count
      FROM at_tables.at_ownership_db_v2 o
      WHERE o.vehicle_id = ${vehicleId}
        AND o.date_reported = ${investmentDate}::date
        ${sql.unsafe(ownershipFilter)}
        AND COALESCE(o.outcome_type, '') != 'Cash'
        AND o.project_id != 'Other Assets'
      GROUP BY o.project_id
      ORDER BY cost DESC
    `;

    console.log(`[getNewInvestmentsAggregated] Fetched ${result.length} projects for vehicle ${vehicleId} on date ${investmentDate}`);

    return result.map(row => ({
      project_id: row.project_id,
      cost: toNumber(row.cost),
      valuation_token: row.valuation_token ? toNumber(row.valuation_token) : null,
      valuation_equity: row.valuation_equity ? toNumber(row.valuation_equity) : null,
      established_type: row.established_type,
      has_multiple_asset_classes: row.asset_class_count > 1,
    }));
  } catch (error) {
    console.error('Error fetching aggregated new investments:', error);
    return [];
  }
}

/**
 * Get asset class breakdown for a specific project's new investments
 * Filters by exact investmentDate (date_reported)
 */
export async function getNewInvestmentAssetBreakdown(
  vehicleId: string,
  projectId: string,
  ownershipType: OwnershipType,
  investmentDate: string
): Promise<NewInvestmentAssetRow[]> {
  try {
    let ownershipFilter = `AND o.ownership_type IN ('Established', 'Top Up')`;
    if (ownershipType === 'Established') {
      ownershipFilter = `AND o.ownership_type = 'Established'`;
    } else if (ownershipType === 'Top Up') {
      ownershipFilter = `AND o.ownership_type = 'Top Up'`;
    }

    const result = await sql<{
      asset_class: string;
      cost: number;
      instrument_types: string;
      outcome_type: string | null;
    }[]>`
      SELECT
        COALESCE(o.asset_class, 'Unknown') as asset_class,
        COALESCE(SUM(o.delta_cost), 0) as cost,
        STRING_AGG(DISTINCT o.instrument_type_standardized, ', ') as instrument_types,
        MAX(o.outcome_type) as outcome_type
      FROM at_tables.at_ownership_db_v2 o
      WHERE o.vehicle_id = ${vehicleId}
        AND o.project_id = ${projectId}
        AND o.date_reported = ${investmentDate}::date
        ${sql.unsafe(ownershipFilter)}
        AND COALESCE(o.outcome_type, '') != 'Cash'
        AND o.project_id != 'Other Assets'
      GROUP BY o.asset_class
      ORDER BY cost DESC
    `;

    return result.map(row => ({
      project_id: projectId,
      asset_class: row.asset_class,
      cost: toNumber(row.cost),
      instrument_types: row.instrument_types || '',
      outcome_type: row.outcome_type,
    }));
  } catch (error) {
    console.error('Error fetching new investment asset breakdown:', error);
    return [];
  }
}

// ============================================================================
// Table 2: Top N Market Value
// ============================================================================

/**
 * Get top N positions by market value with MOIC and QTD calculations
 * Cost column = SUM(delta_cost) between dateReportedStart and dateReportedEnd
 * MV data is at portfolioDate
 */
export async function getTopMVPositions(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart: string,
  dateReportedEnd: string,
  topN: number = 10
): Promise<TopMVRow[]> {
  console.log(`[getTopMVPositions] START - vehicleId=${vehicleId}, portfolioDate=${portfolioDate}, dateReportedStart=${dateReportedStart}, dateReportedEnd=${dateReportedEnd}, topN=${topN}`);

  try {
    // Use FULL OUTER JOIN to capture positions with MV but zero cost
    // Cost = SUM(delta_cost) between dateReportedStart and dateReportedEnd
    // MV = at portfolioDate
    const result = await sql<{
      project_id: string;
      cost: number;
      unrealized_mv: number;
      realized_mv: number;
      total_mv: number;
      liveness_score: number | null;
      coingecko_id: string | null;
      has_multiple_rows: boolean;
    }[]>`
      WITH cost_data AS (
        -- Cost = SUM of delta_cost between date range
        SELECT
          o.project_id,
          COALESCE(SUM(o.delta_cost), 0) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported >= ${dateReportedStart}::date
          AND o.date_reported <= ${dateReportedEnd}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id
      ),
      mv_data AS (
        SELECT
          project_id,
          COALESCE(SUM(unrealized_market_value), 0) as unrealized_mv,
          COALESCE(SUM(realized_market_value), 0) as realized_mv
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
          COALESCE(m.realized_mv, 0) as realized_mv,
          COALESCE(m.unrealized_mv, 0) + COALESCE(m.realized_mv, 0) as total_mv
        FROM cost_data c
        FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      ),
      row_counts AS (
        SELECT project_id, COUNT(DISTINCT ownership_id) as row_count
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported <= ${portfolioDate}::date
        GROUP BY project_id
      )
      SELECT
        cb.project_id,
        cb.cost,
        cb.unrealized_mv,
        cb.realized_mv,
        cb.total_mv,
        p.project_liveness_score as liveness_score,
        p.coingecko_id,
        COALESCE(rc.row_count, 0) > 1 as has_multiple_rows
      FROM combined cb
      LEFT JOIN at_tables.at_project_universe_db p ON cb.project_id = p.project_id
      LEFT JOIN row_counts rc ON cb.project_id = rc.project_id
      ORDER BY cb.total_mv DESC
      ${topN > 0 ? sql`LIMIT ${topN}` : sql``}
    `;

    // Calculate totals for percentages
    const totalCost = result.reduce((sum, r) => sum + toNumber(r.cost), 0);
    const totalMV = result.reduce((sum, r) => sum + toNumber(r.total_mv), 0);

    // Get QTD prices for liquid positions (optional - table may not exist)
    const qtdStart = getQuarterStartDate(portfolioDate);
    const coingeckoIds = result.filter(r => r.coingecko_id).map(r => r.coingecko_id);

    let priceData: Record<string, { start: number; end: number }> = {};
    if (coingeckoIds.length > 0) {
      try {
        const prices = await sql<{
          ticker: string;
          start_price: number;
          end_price: number;
        }[]>`
          SELECT
            ticker,
            (SELECT price FROM price_data.liquid_prices_db WHERE ticker = lp.ticker AND date <= ${qtdStart}::date ORDER BY date DESC LIMIT 1) as start_price,
            (SELECT price FROM price_data.liquid_prices_db WHERE ticker = lp.ticker AND date <= ${portfolioDate}::date ORDER BY date DESC LIMIT 1) as end_price
          FROM (SELECT DISTINCT ticker FROM price_data.liquid_prices_db WHERE ticker = ANY(${coingeckoIds})) lp
        `;

        for (const p of prices) {
          if (p.start_price && p.end_price) {
            priceData[p.ticker] = { start: toNumber(p.start_price), end: toNumber(p.end_price) };
          }
        }
      } catch (priceError) {
        // liquid_prices_db table may not exist - QTD will be null for all positions
        console.log('[getTopMVPositions] QTD price lookup skipped (table may not exist)');
      }
    }

    console.log(`[getTopMVPositions] Fetched ${result.length} positions for vehicle ${vehicleId}`);

    return result.map(row => {
      const cost = toNumber(row.cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const mvTotal = toNumber(row.total_mv);
      const moic = calculateMOIC(mvTotal, cost);

      let qtdLineItem: number | null = null;
      let qtdWeighted: number | null = null;

      if (row.coingecko_id && priceData[row.coingecko_id]) {
        const { start, end } = priceData[row.coingecko_id];
        if (start > 0) {
          qtdLineItem = (end - start) / start;
          qtdWeighted = totalMV > 0 ? qtdLineItem * (mvTotal / totalMV) : 0;
        }
      }

      return {
        project_id: row.project_id,
        cost: cost,
        cost_percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: mvTotal,
        mv_percentage: totalMV > 0 ? (mvTotal / totalMV) * 100 : 0,
        moic: moic,
        qtd_weighted: qtdWeighted,
        qtd_line_item: qtdLineItem,
        liveness_score: row.liveness_score ? toNumber(row.liveness_score) : null,
        is_expandable: row.has_multiple_rows,
      };
    });
  } catch (error) {
    console.error('Error fetching top MV positions:', error);
    return [];
  }
}

/**
 * Get asset class breakdown for expandable rows in Top MV table
 * Aggregates by asset_class for each project
 */
export async function getTopMVProjectDetails(
  vehicleId: string,
  projectId: string,
  portfolioDate: string,
  dateReportedStart: string,
  dateReportedEnd: string
): Promise<TopMVAssetRow[]> {
  try {
    const result = await sql<{
      asset_class: string;
      cost: number;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      WITH cost_data AS (
        -- Cost = SUM of delta_cost between date range, grouped by asset_class
        SELECT
          COALESCE(o.asset_class, 'Unknown') as asset_class,
          COALESCE(SUM(o.delta_cost), 0) as cost
        FROM at_tables.at_ownership_db_v2 o
        WHERE o.vehicle_id = ${vehicleId}
          AND o.project_id = ${projectId}
          AND o.date_reported >= ${dateReportedStart}::date
          AND o.date_reported <= ${dateReportedEnd}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.asset_class
      ),
      mv_data AS (
        SELECT
          COALESCE(asset_class, 'Unknown') as asset_class,
          COALESCE(SUM(unrealized_market_value), 0) as unrealized_mv,
          COALESCE(SUM(realized_market_value), 0) as realized_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND project_id = ${projectId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY asset_class
      )
      SELECT
        COALESCE(c.asset_class, m.asset_class, 'Unknown') as asset_class,
        COALESCE(c.cost, 0) as cost,
        COALESCE(m.unrealized_mv, 0) as unrealized_mv,
        COALESCE(m.realized_mv, 0) as realized_mv
      FROM cost_data c
      FULL OUTER JOIN mv_data m ON c.asset_class = m.asset_class
      ORDER BY COALESCE(m.unrealized_mv, 0) + COALESCE(m.realized_mv, 0) DESC
    `;

    return result.map(row => {
      const cost = toNumber(row.cost);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const realizedMV = toNumber(row.realized_mv);
      const totalMV = unrealizedMV + realizedMV;
      return {
        asset_class: row.asset_class,
        cost: cost,
        unrealized_mv: unrealizedMV,
        realized_mv: realizedMV,
        total_mv: totalMV,
        moic: calculateMOIC(totalMV, cost),
      };
    });
  } catch (error) {
    console.error('Error fetching top MV project details:', error);
    return [];
  }
}

// ============================================================================
// Table 3: Top N Cost
// ============================================================================

/**
 * Get top N positions by cost with ownership type breakdown
 * Cost = SUM(delta_cost) between dateReportedStart and dateReportedEnd
 */
export async function getTopCostPositions(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart: string,
  dateReportedEnd: string,
  topN: number = 10
): Promise<TopCostRow[]> {
  try {
    const result = await sql<{
      project_id: string;
      total_cost: number;
      established_cost: number;
      topup_cost: number;
      divested_cost: number;
      liveness_score: number | null;
    }[]>`
      SELECT
        o.project_id,
        COALESCE(SUM(o.delta_cost), 0) as total_cost,
        COALESCE(SUM(CASE WHEN o.ownership_type = 'Established' THEN o.delta_cost ELSE 0 END), 0) as established_cost,
        COALESCE(SUM(CASE WHEN o.ownership_type = 'Top Up' THEN o.delta_cost ELSE 0 END), 0) as topup_cost,
        COALESCE(SUM(CASE WHEN o.ownership_type ILIKE '%Divested%' THEN o.delta_cost ELSE 0 END), 0) as divested_cost,
        p.project_liveness_score as liveness_score
      FROM at_tables.at_ownership_db_v2 o
      LEFT JOIN at_tables.at_project_universe_db p ON o.project_id = p.project_id
      WHERE o.vehicle_id = ${vehicleId}
        AND o.date_reported >= ${dateReportedStart}::date
        AND o.date_reported <= ${dateReportedEnd}::date
        AND COALESCE(o.outcome_type, '') != 'Cash'
        AND o.project_id != 'Other Assets'
      GROUP BY o.project_id, p.project_liveness_score
      ORDER BY total_cost DESC
      ${topN > 0 ? sql`LIMIT ${topN}` : sql``}
    `;

    // Calculate total for percentages
    const grandTotal = result.reduce((sum, r) => sum + toNumber(r.total_cost), 0);

    console.log(`[getTopCostPositions] Fetched ${result.length} positions for vehicle ${vehicleId}`);

    return result.map(row => {
      const totalCost = toNumber(row.total_cost);
      const establishedCost = toNumber(row.established_cost);
      const topupCost = toNumber(row.topup_cost);
      const divestedCost = toNumber(row.divested_cost);

      return {
        project_id: row.project_id,
        total_cost: totalCost,
        total_cost_percentage: grandTotal > 0 ? (totalCost / grandTotal) * 100 : 0,
        established_cost: establishedCost,
        established_cost_percentage: totalCost > 0 ? (establishedCost / totalCost) * 100 : 0,
        topup_cost: topupCost,
        topup_cost_percentage: totalCost > 0 ? (topupCost / totalCost) * 100 : 0,
        divested_cost: divestedCost,
        divested_cost_percentage: totalCost > 0 ? (divestedCost / totalCost) * 100 : 0,
        liveness_score: row.liveness_score ? toNumber(row.liveness_score) : null,
      };
    });
  } catch (error) {
    console.error('Error fetching top cost positions:', error);
    return [];
  }
}

/**
 * Get project breakdown for expandable rows in Top Cost table
 * Uses cost_basis at the latest date_reported within the date range (consistent with Overview)
 */
export async function getTopCostProjectDetails(
  vehicleId: string,
  projectId: string,
  dateReportedStart: string,
  dateReportedEnd: string
): Promise<TopCostProjectRow[]> {
  try {
    // Show individual ownership rows within date range, sorted by date_reported (oldest first)
    const result = await sql<{
      ownership_id: string;
      asset_class: string;
      ownership_type: string;
      cost: number;
      date_reported: string;
    }[]>`
      SELECT
        o.ownership_id,
        COALESCE(o.asset_class, 'Unknown') as asset_class,
        COALESCE(o.ownership_type, 'Unknown') as ownership_type,
        COALESCE(o.delta_cost, 0) as cost,
        TO_CHAR(o.date_reported, 'YYYY-MM-DD') as date_reported
      FROM at_tables.at_ownership_db_v2 o
      WHERE o.vehicle_id = ${vehicleId}
        AND o.project_id = ${projectId}
        AND o.date_reported >= ${dateReportedStart}::date
        AND o.date_reported <= ${dateReportedEnd}::date
        AND COALESCE(o.outcome_type, '') != 'Cash'
        AND o.project_id != 'Other Assets'
      ORDER BY o.date_reported ASC
    `;

    return result.map(row => ({
      ownership_id: row.ownership_id,
      asset_class: row.asset_class,
      ownership_type: row.ownership_type,
      cost: toNumber(row.cost),
      date_reported: row.date_reported,
    }));
  } catch (error) {
    console.error('Error fetching top cost project details:', error);
    return [];
  }
}

// ============================================================================
// Chart Data
// ============================================================================

export interface NewInvestmentChartData {
  outcome_type: string;
  established_cost: number;
  topup_cost: number;
}

export interface TopMVChartData {
  project_id: string;
  unrealized_mv: number;
  realized_mv: number;
}

export interface TopCostChartData {
  project_id: string;
  established_cost: number;
  topup_cost: number;
  divested_cost: number;
}

/**
 * Get chart data for Table 1: New Investments by outcome type
 */
export async function getNewInvestmentChartData(
  vehicleId: string,
  dateReportedStart: string,
  dateReportedEnd: string
): Promise<NewInvestmentChartData[]> {
  try {
    const result = await sql<{
      outcome_type: string;
      established_cost: number;
      top_up_cost: number;
    }[]>`
      SELECT
        COALESCE(outcome_type, 'Unknown') as outcome_type,
        COALESCE(SUM(CASE WHEN ownership_type = 'Established' THEN delta_cost ELSE 0 END), 0) as established_cost,
        COALESCE(SUM(CASE WHEN ownership_type = 'Top Up' THEN delta_cost ELSE 0 END), 0) as top_up_cost
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported >= ${dateReportedStart}::date
        AND date_reported <= ${dateReportedEnd}::date
      GROUP BY outcome_type
      ORDER BY 2 DESC, 3 DESC
    `;

    return result.map(row => ({
      outcome_type: row.outcome_type,
      established_cost: toNumber(row.established_cost),
      topup_cost: toNumber(row.top_up_cost),
    }));
  } catch (error) {
    console.error('Error fetching new investment chart data:', error);
    return [];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get start of quarter for QTD calculations
 */
function getQuarterStartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const quarter = Math.floor(date.getMonth() / 3);
  const quarterStart = new Date(date.getFullYear(), quarter * 3, 1);
  return quarterStart.toISOString().split('T')[0];
}
