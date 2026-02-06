'use server';

import sql from '@/lib/db';

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

export interface SOIRow {
  project_id: string;
  cost: number;
  cost_percentage: number;
  realized_mv: number;
  realized_mv_percentage: number;
  unrealized_mv: number;
  unrealized_mv_percentage: number;
  total_mv: number;
  moic: number;
  first_entry: number | null;
  weighted_valuation: number | null;
  itd_fund: number | null;
  itd_individual: number | null;
  qtd_fund: number | null;
  qtd_individual: number | null;
  is_long_tail: boolean;
  is_high_moic_exception: boolean;
  has_asset_breakdown: boolean;
}

export interface SOIAssetRow {
  project_id: string;
  asset_class: string;
  cost: number;
  cost_percentage: number;
  realized_mv: number;
  unrealized_mv: number;
  total_mv: number;
  moic: number;
}

export interface SOISummary {
  total_positions: number;
  total_cost: number;
  total_realized_mv: number;
  total_unrealized_mv: number;
  total_mv: number;
  portfolio_moic: number;
  portfolio_itd: number;
  portfolio_qtd: number | null;
  equity_cost: number;
  equity_cost_percentage: number;
  tokens_cost: number;
  tokens_cost_percentage: number;
  others_cost: number;
  others_cost_percentage: number;
}

export type TopNOption = 10 | 25 | 50 | 100 | 0; // 0 = All

// ============================================================================
// Main SOI Query
// ============================================================================

/**
 * Get Schedule of Investments data
 * Uses cumulative cost (date_reported <= portfolio_date) and exact MV match
 */
export async function getSOIData(
  vehicleId: string,
  portfolioDate: string,
  topN: TopNOption = 50
): Promise<{ rows: SOIRow[]; longTail: SOIRow | null; summary: SOISummary }> {
  console.log(`[getSOIData] START - vehicleId=${vehicleId}, portfolioDate=${portfolioDate}, topN=${topN}`);

  // Calculate previous quarter end for QTD calculations
  const prevQuarterEnd = getPreviousQuarterEndDate(portfolioDate);

  try {
    // Get all positions with cost and MV using FULL OUTER JOIN
    const result = await sql<{
      project_id: string;
      cost: number;
      realized_mv: number;
      unrealized_mv: number;
      first_entry: number | null;
      weighted_valuation: number | null;
      coingecko_id: string | null;
      has_multiple_asset_classes: boolean;
      first_mv_date: string | null;
      first_total_mv: number | null;
      additional_cost_since_first_mv: number;
      prev_quarter_total_mv: number;
      quarter_cost_change: number;
    }[]>`
      WITH cost_data AS (
        SELECT
          project_id,
          COALESCE(SUM(delta_cost), 0) as cost,
          -- First entry: MIN valuation excluding NULL/zero valuations
          MIN(CASE WHEN overall_valuation IS NOT NULL AND overall_valuation > 0 THEN overall_valuation ELSE NULL END) as first_entry,
          -- Weighted valuation: only include rows with valid valuations in BOTH numerator AND denominator
          CASE
            WHEN SUM(CASE
              WHEN ownership_type IN ('Established', 'Top Up')
                AND overall_valuation IS NOT NULL
                AND overall_valuation > 0
              THEN delta_cost ELSE 0 END) > 0
            THEN SUM(CASE
              WHEN ownership_type IN ('Established', 'Top Up')
                AND overall_valuation IS NOT NULL
                AND overall_valuation > 0
              THEN overall_valuation * delta_cost ELSE 0 END) /
                 NULLIF(SUM(CASE
                   WHEN ownership_type IN ('Established', 'Top Up')
                     AND overall_valuation IS NOT NULL
                     AND overall_valuation > 0
                   THEN delta_cost ELSE 0 END), 0)
            ELSE NULL
          END as weighted_valuation
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      mv_data AS (
        SELECT
          project_id,
          COALESCE(SUM(realized_market_value), 0) as realized_mv,
          COALESCE(SUM(unrealized_market_value), 0) as unrealized_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      asset_class_counts AS (
        SELECT project_id, COUNT(DISTINCT asset_class) as asset_count
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      -- First MV date for each project (for ITD base)
      first_mv_data AS (
        SELECT
          project_id,
          MIN(portfolio_date) as first_mv_date
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
          AND (COALESCE(realized_market_value, 0) + COALESCE(unrealized_market_value, 0)) > 0
        GROUP BY project_id
      ),
      -- First MV values (actual Total MV at first date)
      first_mv_values AS (
        SELECT
          f.project_id,
          f.first_mv_date,
          COALESCE(SUM(m.realized_market_value), 0) + COALESCE(SUM(m.unrealized_market_value), 0) as first_total_mv
        FROM first_mv_data f
        JOIN tbv_db.fund_mv_db m ON f.project_id = m.project_id
          AND m.portfolio_date = f.first_mv_date
          AND m.vehicle_id = ${vehicleId}
          AND COALESCE(m.asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
        GROUP BY f.project_id, f.first_mv_date
      ),
      -- Cost changes AFTER first MV date (for ITD adjustment)
      itd_cost_changes AS (
        SELECT
          o.project_id,
          COALESCE(SUM(o.delta_cost), 0) as additional_cost_since_first_mv
        FROM at_tables.at_ownership_db_v2 o
        JOIN first_mv_data f ON o.project_id = f.project_id
        WHERE o.vehicle_id = ${vehicleId}
          AND o.date_reported > f.first_mv_date
          AND o.date_reported <= ${portfolioDate}::date
          AND COALESCE(o.outcome_type, '') != 'Cash'
          AND o.project_id != 'Other Assets'
        GROUP BY o.project_id
      ),
      -- Previous quarter end MV (for QTD base)
      prev_quarter_mv AS (
        SELECT
          project_id,
          COALESCE(SUM(realized_market_value), 0) + COALESCE(SUM(unrealized_market_value), 0) as prev_quarter_total_mv
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${prevQuarterEnd}::date
          AND COALESCE(asset_class, '') NOT IN ('Flows', 'NAV Adjustment', 'Cash')
          AND project_id != 'Other Assets'
        GROUP BY project_id
      ),
      -- Cost changes DURING current quarter (for QTD adjustment)
      qtd_cost_changes AS (
        SELECT
          project_id,
          COALESCE(SUM(delta_cost), 0) as quarter_cost_change
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported > ${prevQuarterEnd}::date
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY project_id
      )
      SELECT
        COALESCE(c.project_id, m.project_id) as project_id,
        COALESCE(c.cost, 0) as cost,
        COALESCE(m.realized_mv, 0) as realized_mv,
        COALESCE(m.unrealized_mv, 0) as unrealized_mv,
        c.first_entry,
        c.weighted_valuation,
        p.coingecko_id,
        COALESCE(ac.asset_count, 0) > 1 as has_multiple_asset_classes,
        fmv.first_mv_date,
        fmv.first_total_mv,
        COALESCE(icc.additional_cost_since_first_mv, 0) as additional_cost_since_first_mv,
        COALESCE(pqm.prev_quarter_total_mv, 0) as prev_quarter_total_mv,
        COALESCE(qcc.quarter_cost_change, 0) as quarter_cost_change
      FROM cost_data c
      FULL OUTER JOIN mv_data m ON c.project_id = m.project_id
      LEFT JOIN at_tables.at_project_universe_db p ON COALESCE(c.project_id, m.project_id) = p.project_id
      LEFT JOIN asset_class_counts ac ON COALESCE(c.project_id, m.project_id) = ac.project_id
      LEFT JOIN first_mv_values fmv ON COALESCE(c.project_id, m.project_id) = fmv.project_id
      LEFT JOIN itd_cost_changes icc ON COALESCE(c.project_id, m.project_id) = icc.project_id
      LEFT JOIN prev_quarter_mv pqm ON COALESCE(c.project_id, m.project_id) = pqm.project_id
      LEFT JOIN qtd_cost_changes qcc ON COALESCE(c.project_id, m.project_id) = qcc.project_id
      ORDER BY cost DESC
    `;

    console.log(`[getSOIData] Fetched ${result.length} positions`);

    // Calculate totals
    const totalCost = result.reduce((sum, r) => sum + toNumber(r.cost), 0);
    const totalRealizedMV = result.reduce((sum, r) => sum + toNumber(r.realized_mv), 0);
    const totalUnrealizedMV = result.reduce((sum, r) => sum + toNumber(r.unrealized_mv), 0);
    const totalMV = totalRealizedMV + totalUnrealizedMV;
    const portfolioMOIC = totalCost > 0 ? totalMV / totalCost : 0;
    const portfolioITD = totalCost > 0 ? (totalMV - totalCost) / totalCost : 0;

    // Process rows and identify high MOIC exceptions
    const processedRows: SOIRow[] = result.map(row => {
      const cost = toNumber(row.cost);
      const realizedMV = toNumber(row.realized_mv);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const rowTotalMV = realizedMV + unrealizedMV;
      const moic = cost > 0 ? rowTotalMV / cost : 0;

      // New ITD calculation with additive base:
      // ITD = (Current Total MV / (First Total MV + Additional Cost Since First MV Date)) - 1
      let itdIndividual: number | null = null;
      const firstTotalMV = toNumber(row.first_total_mv);
      const additionalCostSinceFirst = toNumber(row.additional_cost_since_first_mv);

      if (firstTotalMV > 0) {
        const itdBase = firstTotalMV + additionalCostSinceFirst;
        if (itdBase > 0) {
          itdIndividual = (rowTotalMV / itdBase) - 1;
        }
      }

      // New QTD calculation with additive base:
      // QTD = (Current Total MV / (Previous Quarter End Total MV + Cost Change During Quarter)) - 1
      let qtdIndividual: number | null = null;
      const prevQuarterMV = toNumber(row.prev_quarter_total_mv);
      const quarterCostChange = toNumber(row.quarter_cost_change);

      // Only calculate QTD if position existed at prev quarter end OR had cost changes this quarter
      if (prevQuarterMV > 0 || quarterCostChange !== 0) {
        const qtdBase = prevQuarterMV + quarterCostChange;
        if (qtdBase > 0) {
          qtdIndividual = (rowTotalMV / qtdBase) - 1;
        }
      }

      return {
        project_id: row.project_id,
        cost,
        cost_percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        realized_mv: realizedMV,
        realized_mv_percentage: totalRealizedMV > 0 ? (realizedMV / totalRealizedMV) * 100 : 0,
        unrealized_mv: unrealizedMV,
        unrealized_mv_percentage: totalUnrealizedMV > 0 ? (unrealizedMV / totalUnrealizedMV) * 100 : 0,
        total_mv: rowTotalMV,
        moic,
        first_entry: row.first_entry ? toNumber(row.first_entry) : null,
        weighted_valuation: row.weighted_valuation ? toNumber(row.weighted_valuation) : null,
        itd_fund: portfolioITD,
        itd_individual: itdIndividual,
        qtd_fund: null, // Calculated separately
        qtd_individual: qtdIndividual,
        is_long_tail: false,
        is_high_moic_exception: moic >= 5,
        has_asset_breakdown: row.has_multiple_asset_classes,
      };
    });

    // Apply Top N logic with high MOIC exception
    let displayRows: SOIRow[] = [];
    let longTailRows: SOIRow[] = [];
    let longTailRow: SOIRow | null = null;

    if (topN === 0) {
      // Show all
      displayRows = processedRows;
    } else {
      // Sort by cost DESC (already done in SQL)
      // Take top N, but also include high MOIC exceptions
      const topNRows = processedRows.slice(0, topN);
      const remainingRows = processedRows.slice(topN);

      // Find high MOIC exceptions in remaining rows
      const highMOICExceptions = remainingRows.filter(r => r.is_high_moic_exception);
      longTailRows = remainingRows.filter(r => !r.is_high_moic_exception);

      displayRows = [...topNRows, ...highMOICExceptions];

      // Create Long Tail aggregate row
      if (longTailRows.length > 0) {
        const ltCost = longTailRows.reduce((sum, r) => sum + r.cost, 0);
        const ltRealizedMV = longTailRows.reduce((sum, r) => sum + r.realized_mv, 0);
        const ltUnrealizedMV = longTailRows.reduce((sum, r) => sum + r.unrealized_mv, 0);
        const ltTotalMV = ltRealizedMV + ltUnrealizedMV;
        const ltMOIC = ltCost > 0 ? ltTotalMV / ltCost : 0;

        // ITD: weighted average by total_mv for positions with ITD values
        const ltITDPositions = longTailRows.filter(r => r.itd_individual !== null);
        const ltITDTotalMV = ltITDPositions.reduce((sum, r) => sum + r.total_mv, 0);
        const ltITD = ltITDPositions.length > 0 && ltITDTotalMV > 0
          ? ltITDPositions.reduce((sum, r) => sum + (r.itd_individual || 0) * r.total_mv, 0) / ltITDTotalMV
          : null;

        const ltFirstEntry = longTailRows.filter(r => r.first_entry !== null).reduce((sum, r) => sum + (r.first_entry || 0), 0) / longTailRows.filter(r => r.first_entry !== null).length || null;
        const ltWeightedVal = longTailRows.filter(r => r.weighted_valuation !== null).reduce((sum, r) => sum + (r.weighted_valuation || 0), 0) / longTailRows.filter(r => r.weighted_valuation !== null).length || null;

        // QTD: weighted average by total_mv for positions with QTD values
        const ltQTDPositions = longTailRows.filter(r => r.qtd_individual !== null);
        const ltQTDTotalMV = ltQTDPositions.reduce((sum, r) => sum + r.total_mv, 0);
        const ltQTD = ltQTDPositions.length > 0 && ltQTDTotalMV > 0
          ? ltQTDPositions.reduce((sum, r) => sum + (r.qtd_individual || 0) * r.total_mv, 0) / ltQTDTotalMV
          : null;

        longTailRow = {
          project_id: `Long Tail (${longTailRows.length} positions)`,
          cost: ltCost,
          cost_percentage: totalCost > 0 ? (ltCost / totalCost) * 100 : 0,
          realized_mv: ltRealizedMV,
          realized_mv_percentage: totalRealizedMV > 0 ? (ltRealizedMV / totalRealizedMV) * 100 : 0,
          unrealized_mv: ltUnrealizedMV,
          unrealized_mv_percentage: totalUnrealizedMV > 0 ? (ltUnrealizedMV / totalUnrealizedMV) * 100 : 0,
          total_mv: ltTotalMV,
          moic: ltMOIC,
          first_entry: ltFirstEntry,
          weighted_valuation: ltWeightedVal,
          itd_fund: portfolioITD,
          itd_individual: ltITD,
          qtd_fund: null,
          qtd_individual: ltQTD,
          is_long_tail: true,
          is_high_moic_exception: false,
          has_asset_breakdown: false,
        };
      }
    }

    // Calculate portfolio-level ITD (weighted average of individual ITD values)
    const positionsWithITD = displayRows.filter(r => r.itd_individual !== null);
    const itdTotalMV = positionsWithITD.reduce((sum, r) => sum + r.total_mv, 0);
    const portfolioITDNew = positionsWithITD.length > 0 && itdTotalMV > 0
      ? positionsWithITD.reduce((sum, r) => sum + (r.itd_individual || 0) * r.total_mv, 0) / itdTotalMV
      : portfolioITD; // Fallback to simple calculation if no positions have ITD

    // Calculate portfolio QTD (weighted average)
    const positionsWithQTD = displayRows.filter(r => r.qtd_individual !== null);
    const qtdTotalMV = positionsWithQTD.reduce((sum, r) => sum + r.total_mv, 0);
    const portfolioQTD = positionsWithQTD.length > 0 && qtdTotalMV > 0
      ? positionsWithQTD.reduce((sum, r) => sum + (r.qtd_individual || 0) * r.total_mv, 0) / qtdTotalMV
      : null;

    // Update fund-level ITD and QTD on all rows
    displayRows = displayRows.map(r => ({ ...r, itd_fund: portfolioITDNew, qtd_fund: portfolioQTD }));
    if (longTailRow) {
      longTailRow.itd_fund = portfolioITDNew;
      longTailRow.qtd_fund = portfolioQTD;
    }

    // Get asset class distribution
    const assetDistribution = await getAssetClassDistribution(vehicleId, portfolioDate);

    const summary: SOISummary = {
      total_positions: result.length,
      total_cost: totalCost,
      total_realized_mv: totalRealizedMV,
      total_unrealized_mv: totalUnrealizedMV,
      total_mv: totalMV,
      portfolio_moic: portfolioMOIC,
      portfolio_itd: portfolioITDNew,
      portfolio_qtd: portfolioQTD,
      ...assetDistribution,
    };

    console.log(`[getSOIData] Returning ${displayRows.length} display rows, longTail: ${longTailRow ? 'yes' : 'no'}`);

    return { rows: displayRows, longTail: longTailRow, summary };
  } catch (error) {
    console.error('Error fetching SOI data:', error);
    return {
      rows: [],
      longTail: null,
      summary: {
        total_positions: 0,
        total_cost: 0,
        total_realized_mv: 0,
        total_unrealized_mv: 0,
        total_mv: 0,
        portfolio_moic: 0,
        portfolio_itd: 0,
        portfolio_qtd: null,
        equity_cost: 0,
        equity_cost_percentage: 0,
        tokens_cost: 0,
        tokens_cost_percentage: 0,
        others_cost: 0,
        others_cost_percentage: 0,
      },
    };
  }
}

// ============================================================================
// Asset Class Breakdown for Row Expansion
// ============================================================================

/**
 * Get asset class breakdown for a specific project
 */
export async function getSOIAssetBreakdown(
  vehicleId: string,
  projectId: string,
  portfolioDate: string
): Promise<SOIAssetRow[]> {
  try {
    const result = await sql<{
      asset_class: string;
      cost: number;
      realized_mv: number;
      unrealized_mv: number;
    }[]>`
      WITH cost_data AS (
        SELECT
          asset_class,
          COALESCE(SUM(delta_cost), 0) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND project_id = ${projectId}
          AND date_reported <= ${portfolioDate}::date
          AND COALESCE(outcome_type, '') != 'Cash'
          AND project_id != 'Other Assets'
        GROUP BY asset_class
      ),
      mv_data AS (
        SELECT
          asset_class,
          COALESCE(SUM(realized_market_value), 0) as realized_mv,
          COALESCE(SUM(unrealized_market_value), 0) as unrealized_mv
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
        COALESCE(m.realized_mv, 0) as realized_mv,
        COALESCE(m.unrealized_mv, 0) as unrealized_mv
      FROM cost_data c
      FULL OUTER JOIN mv_data m ON c.asset_class = m.asset_class
      ORDER BY cost DESC
    `;

    const totalCost = result.reduce((sum, r) => sum + toNumber(r.cost), 0);

    return result.map(row => {
      const cost = toNumber(row.cost);
      const realizedMV = toNumber(row.realized_mv);
      const unrealizedMV = toNumber(row.unrealized_mv);
      const totalMV = realizedMV + unrealizedMV;

      return {
        project_id: projectId,
        asset_class: row.asset_class,
        cost,
        cost_percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        realized_mv: realizedMV,
        unrealized_mv: unrealizedMV,
        total_mv: totalMV,
        moic: cost > 0 ? totalMV / cost : 0,
      };
    });
  } catch (error) {
    console.error('Error fetching SOI asset breakdown:', error);
    return [];
  }
}

// ============================================================================
// Asset Class Distribution Summary
// ============================================================================

async function getAssetClassDistribution(
  vehicleId: string,
  portfolioDate: string
): Promise<{
  equity_cost: number;
  equity_cost_percentage: number;
  tokens_cost: number;
  tokens_cost_percentage: number;
  others_cost: number;
  others_cost_percentage: number;
}> {
  try {
    const result = await sql<{
      equity_cost: number;
      tokens_cost: number;
      others_cost: number;
      total_cost: number;
    }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Equity' THEN delta_cost ELSE 0 END), 0) as equity_cost,
        COALESCE(SUM(CASE WHEN COALESCE(asset_class, 'Unknown') = 'Tokens' THEN delta_cost ELSE 0 END), 0) as tokens_cost,
        COALESCE(SUM(CASE WHEN COALESCE(asset_class, 'Unknown') NOT IN ('Equity', 'Tokens') THEN delta_cost ELSE 0 END), 0) as others_cost,
        COALESCE(SUM(delta_cost), 0) as total_cost
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
        AND COALESCE(outcome_type, '') != 'Cash'
        AND project_id != 'Other Assets'
    `;

    const row = result[0];
    const equityCost = toNumber(row?.equity_cost);
    const tokensCost = toNumber(row?.tokens_cost);
    const othersCost = toNumber(row?.others_cost);
    const totalCost = toNumber(row?.total_cost);

    return {
      equity_cost: equityCost,
      equity_cost_percentage: totalCost > 0 ? (equityCost / totalCost) * 100 : 0,
      tokens_cost: tokensCost,
      tokens_cost_percentage: totalCost > 0 ? (tokensCost / totalCost) * 100 : 0,
      others_cost: othersCost,
      others_cost_percentage: totalCost > 0 ? (othersCost / totalCost) * 100 : 0,
    };
  } catch (error) {
    console.error('Error fetching asset class distribution:', error);
    return {
      equity_cost: 0,
      equity_cost_percentage: 0,
      tokens_cost: 0,
      tokens_cost_percentage: 0,
      others_cost: 0,
      others_cost_percentage: 0,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function getQuarterStartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const quarter = Math.floor(date.getMonth() / 3);
  const quarterStart = new Date(date.getFullYear(), quarter * 3, 1);
  return quarterStart.toISOString().split('T')[0];
}

/**
 * Get previous quarter end date for QTD calculations
 * If portfolio_date is 2025-08-15, previous quarter end is 2025-06-30
 * Quarter ends: 03-31, 06-30, 09-30, 12-31
 */
function getPreviousQuarterEndDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();

  if (month <= 2) {
    return `${year - 1}-12-31`; // Q1 -> prev Dec 31
  } else if (month <= 5) {
    return `${year}-03-31`;     // Q2 -> Mar 31
  } else if (month <= 8) {
    return `${year}-06-30`;     // Q3 -> Jun 30
  } else {
    return `${year}-09-30`;     // Q4 -> Sep 30
  }
}
