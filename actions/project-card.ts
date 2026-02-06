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

export interface ProjectInfo {
  project_id: string;
  record_id_project: string | null;  // Airtable record ID for project updates lookup
  description: string | null;
  project_ecosystem: string | null;
  project_stack: string | null;
  project_tag: string | null;
  project_sub_tag: string | null;
  website: string | null;
  website_status: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  country: string | null;
  project_liveness_score: number | null;
  project_liveness_status: string | null;
  token_live: string | null;
  coingecko_id: string | null;
  project_logo_url: string | null;
}

// TBV Cost & MV - Asset class breakdown for each TBV fund
export interface TBVAssetClassRow {
  asset_class: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
}

// TBV Cost & MV - Parent row for each TBV fund (expandable)
export interface TBVFundRow {
  tbv_fund: string;
  cost: number;
  unrealized_mv: number;
  realized_mv: number;
  total_mv: number;
  moic: number;
  asset_classes: TBVAssetClassRow[];
}

// TBV Cost & MV - Complete data structure
export interface TBVCostMVData {
  funds: TBVFundRow[];
  totals: {
    cost: number;
    unrealized_mv: number;
    realized_mv: number;
    total_mv: number;
    moic: number;
  };
}

// Fund Exposure - Row for each vehicle
export interface FundExposureRow {
  vehicle_id: string;
  fund_name: string;
  cost: number;
  market_value: number;
  moic: number;
}

export interface OwnershipHistoryRow {
  date_reported: string;
  ownership_type: string;
  delta_cost: number;
  cumulative_cost: number;
  instrument_type: string | null;
  asset_class: string | null;
}

export interface ValuationHistoryRow {
  rounds_date: string;
  round: string | null;
  overall_valuation: number | null;
  investment_instrument: string | null;
  fund_lead: string | null;
}

export interface ProjectNoteRow {
  note_id: string;
  created_at: string;
  note_text: string;
  note_type: string | null;
  created_by: string | null;
}

export interface PriceHistoryRow {
  date: string;
  price: number;
}

export interface OwnershipDateRow {
  date_reported: string;
  ownership_type: string;
}

// ============================================================================
// Section 1: Project Info
// ============================================================================

export async function getProjectInfo(projectId: string): Promise<ProjectInfo | null> {
  try {
    const result = await sql<ProjectInfo[]>`
      SELECT
        project_id,
        record_id_project_universe as record_id_project,
        description,
        project_ecosystem,
        project_stack,
        project_tag,
        project_sub_tag,
        website,
        website_status,
        twitter_handle,
        linkedin_url,
        country,
        project_liveness_score,
        project_liveness_status,
        token_live,
        coingecko_id,
        project_logo_url
      FROM at_tables.at_project_universe_db
      WHERE project_id = ${projectId}
      LIMIT 1
    `;

    console.log(`[getProjectInfo] Fetched info for project: ${projectId}`);
    return result[0] || null;
  } catch (error) {
    console.error('Error fetching project info:', error);
    return null;
  }
}

// ============================================================================
// Section 2: TBV Cost & Market Value
// Uses theta_ownership_db for cost and theta_mv_db for market value
// Expandable parent rows (TBV1-5) with asset class child rows
// ============================================================================

export async function getProjectTBVCostMV(
  projectId: string,
  portfolioDate: string
): Promise<TBVCostMVData> {
  try {
    // Get cost breakdown by TBV fund and asset class from theta_ownership_db
    // Uses SUM(theta_cost_basis) for cost, filtered by date_reported <= portfolio_date
    const costResult = await sql<{
      tbv_fund: string;
      asset_class: string;
      cost: number;
    }[]>`
      SELECT
        COALESCE(tbv_fund, 'Unknown') as tbv_fund,
        COALESCE(asset_class, 'Unknown') as asset_class,
        COALESCE(SUM(theta_cost_basis), 0) as cost
      FROM tbv_db.theta_ownership_db
      WHERE project_id = ${projectId}
        AND date_reported <= ${portfolioDate}::date
      GROUP BY tbv_fund, asset_class
    `;

    // Get MV breakdown by TBV fund and asset class from theta_mv_db
    // Uses exact match on portfolio_date
    const mvResult = await sql<{
      tbv_fund: string;
      asset_class: string;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      SELECT
        COALESCE(tbv_fund, 'Unknown') as tbv_fund,
        COALESCE(asset_class, 'Unknown') as asset_class,
        COALESCE(SUM(theta_unrealized_market_value), 0) as unrealized_mv,
        COALESCE(SUM(theta_realized_market_value), 0) as realized_mv
      FROM tbv_db.theta_mv_db
      WHERE project_id = ${projectId}
        AND portfolio_date = ${portfolioDate}::date
      GROUP BY tbv_fund, asset_class
    `;

    // Build data structure by TBV fund and asset class
    const tbvFunds = ['TBV1', 'TBV2', 'TBV3', 'TBV4', 'TBV5'];
    const assetClasses = ['Equity', 'Tokens', 'Others'];

    // Initialize data structure: tbvFund -> assetClass -> { cost, unrealized_mv, realized_mv }
    const dataMap: Record<string, Record<string, { cost: number; unrealized_mv: number; realized_mv: number }>> = {};

    for (const tbv of tbvFunds) {
      dataMap[tbv] = {};
      for (const ac of assetClasses) {
        dataMap[tbv][ac] = { cost: 0, unrealized_mv: 0, realized_mv: 0 };
      }
    }

    // Populate cost data
    for (const row of costResult) {
      const tbv = tbvFunds.includes(row.tbv_fund) ? row.tbv_fund : null;
      if (!tbv) continue;

      let assetClass = 'Others';
      const acLower = row.asset_class.toLowerCase();
      if (acLower === 'equity') assetClass = 'Equity';
      else if (acLower === 'tokens') assetClass = 'Tokens';

      dataMap[tbv][assetClass].cost += toNumber(row.cost);
    }

    // Populate MV data
    for (const row of mvResult) {
      const tbv = tbvFunds.includes(row.tbv_fund) ? row.tbv_fund : null;
      if (!tbv) continue;

      let assetClass = 'Others';
      const acLower = row.asset_class.toLowerCase();
      if (acLower === 'equity') assetClass = 'Equity';
      else if (acLower === 'tokens') assetClass = 'Tokens';

      dataMap[tbv][assetClass].unrealized_mv += toNumber(row.unrealized_mv);
      dataMap[tbv][assetClass].realized_mv += toNumber(row.realized_mv);
    }

    // Build result with expandable structure
    const funds: TBVFundRow[] = [];
    let totalCost = 0;
    let totalUnrealizedMV = 0;
    let totalRealizedMV = 0;

    for (const tbv of tbvFunds) {
      const assetClassRows: TBVAssetClassRow[] = [];
      let fundCost = 0;
      let fundUnrealizedMV = 0;
      let fundRealizedMV = 0;

      for (const ac of assetClasses) {
        const data = dataMap[tbv][ac];
        const cost = data.cost;
        const unrealizedMV = data.unrealized_mv;
        const realizedMV = data.realized_mv;
        const totalMV = unrealizedMV + realizedMV;

        // Only include asset class rows with exposure (cost > 0 or mv > 0)
        if (cost > 0 || totalMV > 0) {
          assetClassRows.push({
            asset_class: ac,
            cost,
            unrealized_mv: unrealizedMV,
            realized_mv: realizedMV,
            total_mv: totalMV,
            moic: cost > 0 ? totalMV / cost : 0,
          });
        }

        fundCost += cost;
        fundUnrealizedMV += unrealizedMV;
        fundRealizedMV += realizedMV;
      }

      const fundTotalMV = fundUnrealizedMV + fundRealizedMV;

      // Only include TBV fund if it has exposure (cost > 0 or mv > 0)
      if (fundCost > 0 || fundTotalMV > 0) {
        funds.push({
          tbv_fund: tbv,
          cost: fundCost,
          unrealized_mv: fundUnrealizedMV,
          realized_mv: fundRealizedMV,
          total_mv: fundTotalMV,
          moic: fundCost > 0 ? fundTotalMV / fundCost : 0,
          asset_classes: assetClassRows,
        });
      }

      totalCost += fundCost;
      totalUnrealizedMV += fundUnrealizedMV;
      totalRealizedMV += fundRealizedMV;
    }

    const totalTotalMV = totalUnrealizedMV + totalRealizedMV;

    console.log(`[getProjectTBVCostMV] Fetched ${funds.length} TBV funds with exposure for project: ${projectId}`);

    return {
      funds,
      totals: {
        cost: totalCost,
        unrealized_mv: totalUnrealizedMV,
        realized_mv: totalRealizedMV,
        total_mv: totalTotalMV,
        moic: totalCost > 0 ? totalTotalMV / totalCost : 0,
      },
    };
  } catch (error) {
    console.error('Error fetching project TBV cost/MV:', error);
    return {
      funds: [],
      totals: { cost: 0, unrealized_mv: 0, realized_mv: 0, total_mv: 0, moic: 0 },
    };
  }
}

// ============================================================================
// Section 3: Fund Exposure
// Uses at_ownership_db_v2 for cost and fund_mv_db for market value
// Joins to at_investment_names_db for full_investment_name display
// ============================================================================

export async function getProjectFundExposure(
  projectId: string,
  portfolioDate: string
): Promise<FundExposureRow[]> {
  try {
    // Get cost by vehicle from at_ownership_db_v2
    // Uses SUM(delta_cost) for cumulative cost up to portfolio_date
    const costResult = await sql<{
      vehicle_id: string;
      cost: number;
    }[]>`
      SELECT
        vehicle_id,
        COALESCE(SUM(delta_cost), 0) as cost
      FROM at_tables.at_ownership_db_v2
      WHERE project_id = ${projectId}
        AND date_reported <= ${portfolioDate}::date
      GROUP BY vehicle_id
    `;

    // Get MV by vehicle from fund_mv_db
    // Uses exact match on portfolio_date
    const mvResult = await sql<{
      vehicle_id: string;
      unrealized_mv: number;
      realized_mv: number;
    }[]>`
      SELECT
        vehicle_id,
        COALESCE(SUM(unrealized_market_value), 0) as unrealized_mv,
        COALESCE(SUM(realized_market_value), 0) as realized_mv
      FROM tbv_db.fund_mv_db
      WHERE project_id = ${projectId}
        AND portfolio_date = ${portfolioDate}::date
      GROUP BY vehicle_id
    `;

    // Get fund names from at_investment_names_db
    const vehicleIds = [...new Set([
      ...costResult.map(r => r.vehicle_id),
      ...mvResult.map(r => r.vehicle_id)
    ])];

    const fundNamesResult = vehicleIds.length > 0 ? await sql<{
      vehicle_id: string;
      full_investment_name: string;
    }[]>`
      SELECT
        vehicle_id,
        COALESCE(full_investment_name, vehicle_id) as full_investment_name
      FROM at_tables.at_investment_names_db
      WHERE vehicle_id = ANY(${vehicleIds})
    ` : [];

    // Build lookup maps
    const costMap = new Map(costResult.map(r => [r.vehicle_id, toNumber(r.cost)]));
    const mvMap = new Map(mvResult.map(r => [r.vehicle_id, {
      unrealized: toNumber(r.unrealized_mv),
      realized: toNumber(r.realized_mv)
    }]));
    const fundNameMap = new Map(fundNamesResult.map(r => [r.vehicle_id, r.full_investment_name]));

    // Build result rows
    const rows: FundExposureRow[] = [];

    for (const vehicleId of vehicleIds) {
      const cost = costMap.get(vehicleId) || 0;
      const mv = mvMap.get(vehicleId) || { unrealized: 0, realized: 0 };
      const marketValue = mv.unrealized + mv.realized;
      const fundName = fundNameMap.get(vehicleId) || vehicleId;

      // Only include vehicles with exposure (cost > 0 or mv > 0)
      if (cost > 0 || marketValue > 0) {
        rows.push({
          vehicle_id: vehicleId,
          fund_name: fundName,
          cost,
          market_value: marketValue,
          moic: cost > 0 ? marketValue / cost : 0,
        });
      }
    }

    // Sort by cost DESC (largest exposure first)
    rows.sort((a, b) => b.cost - a.cost);

    console.log(`[getProjectFundExposure] Fetched ${rows.length} fund exposures for project: ${projectId}`);

    return rows;
  } catch (error) {
    console.error('Error fetching project fund exposure:', error);
    return [];
  }
}

// ============================================================================
// Section 4: Ownership History
// ============================================================================

export async function getProjectOwnershipHistory(
  projectId: string
): Promise<OwnershipHistoryRow[]> {
  try {
    const result = await sql<{
      date_reported: string;
      ownership_type: string;
      delta_cost: number;
      instrument_type: string | null;
      asset_class: string | null;
    }[]>`
      SELECT
        TO_CHAR(date_reported, 'YYYY-MM-DD') as date_reported,
        COALESCE(ownership_type, 'Unknown') as ownership_type,
        COALESCE(delta_cost, 0) as delta_cost,
        instrument_type_standardized as instrument_type,
        asset_class
      FROM at_tables.at_ownership_db_v2
      WHERE project_id = ${projectId}
      ORDER BY date_reported ASC
    `;

    // Calculate cumulative cost
    let cumulative = 0;
    const rows: OwnershipHistoryRow[] = result.map(row => {
      cumulative += toNumber(row.delta_cost);
      return {
        date_reported: row.date_reported,
        ownership_type: row.ownership_type,
        delta_cost: toNumber(row.delta_cost),
        cumulative_cost: cumulative,
        instrument_type: row.instrument_type,
        asset_class: row.asset_class,
      };
    });

    console.log(`[getProjectOwnershipHistory] Fetched ${rows.length} ownership history rows for project: ${projectId}`);
    return rows;
  } catch (error) {
    console.error('Error fetching project ownership history:', error);
    return [];
  }
}

// ============================================================================
// Section 5: Valuation History
// ============================================================================

export async function getProjectValuationHistory(
  projectId: string
): Promise<ValuationHistoryRow[]> {
  try {
    const result = await sql<{
      rounds_date: string;
      round: string | null;
      overall_valuation: number | null;
      investment_instrument: string | null;
      fund_lead: string | null;
    }[]>`
      SELECT
        TO_CHAR(rounds_date, 'YYYY-MM-DD') as rounds_date,
        round,
        overall_valuation,
        investment_instrument,
        fund_lead
      FROM at_tables.at_rounds_db
      WHERE project_id = ${projectId}
      ORDER BY rounds_date ASC
    `;

    console.log(`[getProjectValuationHistory] Fetched ${result.length} valuation history rows for project: ${projectId}`);

    return result.map(row => ({
      rounds_date: row.rounds_date,
      round: row.round,
      overall_valuation: row.overall_valuation ? toNumber(row.overall_valuation) : null,
      investment_instrument: row.investment_instrument,
      fund_lead: row.fund_lead,
    }));
  } catch (error) {
    console.error('Error fetching project valuation history:', error);
    return [];
  }
}

// ============================================================================
// Section 6: Notes History
// ============================================================================

export async function getProjectNotes(
  projectId: string
): Promise<ProjectNoteRow[]> {
  try {
    // Note: This table may not exist yet - return empty array if query fails
    const result = await sql<{
      note_id: string;
      created_at: string;
      note_text: string;
      note_type: string | null;
      created_by: string | null;
    }[]>`
      SELECT
        note_id::text,
        TO_CHAR(created_at, 'YYYY-MM-DD') as created_at,
        note_text,
        note_type,
        created_by
      FROM reports.project_notes
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `;

    console.log(`[getProjectNotes] Fetched ${result.length} notes for project: ${projectId}`);
    return result;
  } catch (error) {
    // Notes table may not exist
    console.log('[getProjectNotes] Notes table not available:', error);
    return [];
  }
}

// ============================================================================
// Section 7: Price Chart
// ============================================================================

export async function getProjectPriceHistory(
  coingeckoId: string,
  startDate?: string
): Promise<PriceHistoryRow[]> {
  try {
    // Default to last 12 months if no start date
    const effectiveStartDate = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await sql<{
      date: string;
      price: number;
    }[]>`
      SELECT
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        price
      FROM price_data.liquid_prices_db
      WHERE ticker = ${coingeckoId}
        AND date >= ${effectiveStartDate}::date
      ORDER BY date ASC
    `;

    console.log(`[getProjectPriceHistory] Fetched ${result.length} price points for ticker: ${coingeckoId}`);

    return result.map(row => ({
      date: row.date,
      price: toNumber(row.price),
    }));
  } catch (error) {
    console.error('Error fetching project price history:', error);
    return [];
  }
}

export async function getProjectOwnershipDates(
  projectId: string
): Promise<OwnershipDateRow[]> {
  try {
    const result = await sql<{
      date_reported: string;
      ownership_type: string;
    }[]>`
      SELECT DISTINCT
        TO_CHAR(date_reported, 'YYYY-MM-DD') as date_reported,
        ownership_type
      FROM at_tables.at_ownership_db_v2
      WHERE project_id = ${projectId}
        AND ownership_type IN ('Established', 'Top Up')
      ORDER BY date_reported ASC
    `;

    return result;
  } catch (error) {
    console.error('Error fetching project ownership dates:', error);
    return [];
  }
}
