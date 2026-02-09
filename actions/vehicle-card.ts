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

export interface VehicleInfo {
  vehicle_id: string;
  record_id_vehicle_universe: string | null;
  record_id_fund_universe: string | null;
  full_strategy_name: string | null;
  fund_manager: string | null;
  vintage: number | null;
  fund_size: number | null;
  target: number | null;
  cap: number | null;
  investment_period: number | null;
  fund_life: number | null;
  potential_extension: number | null;
  management_fee: number | null;
  performance_fee: number | null;
  gp_commitment: number | null;
  currency: string | null;
}

export interface VehicleCapitalSummary {
  theta_commitment_total: number;
  capital_called: number;
  called_percentage: number;
  capital_distributed: number;
}

export interface VehiclePerformanceMetrics {
  date_reported: string;
  nav: number;
  tvpi: number;
  dpi: number;
  rvpi: number;
  irr: number | null;
  unique_projects: number;
  private_positions: number;
  liquid_positions: number;
}

export interface TopPosition {
  project_id: string;
  project_name: string | null;
  asset_class: string;
  cost: number;
  market_value: number;
  moic: number;
}

// ============================================================================
// Section 1: General Vehicle Info
// ============================================================================

export async function getVehicleInfo(vehicleId: string): Promise<VehicleInfo | null> {
  try {
    const result = await sql<VehicleInfo[]>`
      SELECT
        v.vehicle_id,
        v.record_id_vehicle_universe,
        f.record_id_fund_universe,
        v.full_strategy_name,
        i.fund_id as fund_manager,
        v.vintage,
        v.fund_size,
        v.target,
        v.cap,
        v.investment_period,
        v.fund_life,
        v.potential_extension,
        v.management_fee,
        v.performance_fee,
        v.gp_commitment,
        v.currency
      FROM at_tables.at_vehicle_universe_db v
      LEFT JOIN at_tables.at_investment_names_db i ON v.vehicle_id = i.vehicle_id
      LEFT JOIN at_tables.at_fund_universe_db f ON i.fund_id = f.fund_id
      WHERE v.vehicle_id = ${vehicleId}
      LIMIT 1
    `;

    console.log(`[getVehicleInfo] Fetched info for vehicle: ${vehicleId}`);
    return result[0] || null;
  } catch (error) {
    console.error('Error fetching vehicle info:', error);
    return null;
  }
}

export async function getVehicleCapitalSummary(
  vehicleId: string,
  tbvFund?: string
): Promise<VehicleCapitalSummary> {
  try {
    // Get flows grouped by type
    const flowsQuery = tbvFund
      ? sql<{ flow_type: string; total: number }[]>`
          SELECT
            LOWER(flow_type) as flow_type,
            SUM(flow_amount) as total
          FROM at_tables.at_flows_db
          WHERE vehicle_id = ${vehicleId}
            AND tbv_fund = ${tbvFund}
          GROUP BY LOWER(flow_type)
        `
      : sql<{ flow_type: string; total: number }[]>`
          SELECT
            LOWER(flow_type) as flow_type,
            SUM(flow_amount) as total
          FROM at_tables.at_flows_db
          WHERE vehicle_id = ${vehicleId}
          GROUP BY LOWER(flow_type)
        `;

    const flows = await flowsQuery;

    let commitment = 0;
    let called = 0;
    let distributed = 0;

    for (const flow of flows) {
      const amount = toNumber(flow.total);
      if (flow.flow_type === 'commitment') {
        commitment = amount;
      } else if (flow.flow_type === 'called' || flow.flow_type === 'capital called') {
        called = Math.abs(amount); // Called is typically negative, so abs
      } else if (flow.flow_type === 'distribution' || flow.flow_type === 'distributed') {
        distributed = amount;
      }
    }

    const calledPercentage = commitment > 0 ? (called / commitment) * 100 : 0;

    console.log(`[getVehicleCapitalSummary] Capital summary for ${vehicleId}: commitment=${commitment}, called=${called}`);

    return {
      theta_commitment_total: commitment,
      capital_called: called,
      called_percentage: calledPercentage,
      capital_distributed: distributed,
    };
  } catch (error) {
    console.error('Error fetching vehicle capital summary:', error);
    return {
      theta_commitment_total: 0,
      capital_called: 0,
      called_percentage: 0,
      capital_distributed: 0,
    };
  }
}

// ============================================================================
// Section 2: Performance Metrics
// ============================================================================

export async function getVehiclePerformanceMetrics(
  vehicleId: string,
  portfolioDate: string,
  tbvFund?: string
): Promise<VehiclePerformanceMetrics | null> {
  try {
    // Get the latest date_reported that is <= portfolio_date
    const latestDateResult = await sql<{ max_date: string }[]>`
      SELECT MAX(date_reported)::text as max_date
      FROM tbv_db.tbv_vehicle_performance_db
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
        ${tbvFund ? sql`AND tbv_fund = ${tbvFund}` : sql``}
    `;

    const latestDate = latestDateResult[0]?.max_date;
    if (!latestDate) {
      console.log(`[getVehiclePerformanceMetrics] No performance data for ${vehicleId}`);
      return null;
    }

    // Get performance metrics for that date
    const perfResult = await sql<{
      nav: number;
      tvpi: number;
      dpi: number;
      rvpi: number;
      irr: number | null;
    }[]>`
      SELECT
        COALESCE(nav, 0) as nav,
        COALESCE(tvpi, 0) as tvpi,
        COALESCE(dpi, 0) as dpi,
        COALESCE(rvpi, 0) as rvpi,
        irr
      FROM tbv_db.tbv_vehicle_performance_db
      WHERE vehicle_id = ${vehicleId}
        AND date_reported = ${latestDate}::date
        ${tbvFund ? sql`AND tbv_fund = ${tbvFund}` : sql``}
      LIMIT 1
    `;

    const perf = perfResult[0];
    if (!perf) {
      return null;
    }

    // Get position counts from ownership data
    const positionCounts = await sql<{
      unique_projects: number;
      private_positions: number;
      liquid_positions: number;
    }[]>`
      SELECT
        COUNT(DISTINCT project_id) as unique_projects,
        COUNT(DISTINCT CASE WHEN established_type = 'Private' OR established_type = 'Established' THEN project_id END) as private_positions,
        COUNT(DISTINCT CASE WHEN established_type = 'Liquid' THEN project_id END) as liquid_positions
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
    `;

    const counts = positionCounts[0] || { unique_projects: 0, private_positions: 0, liquid_positions: 0 };

    return {
      date_reported: latestDate,
      nav: toNumber(perf.nav),
      tvpi: toNumber(perf.tvpi),
      dpi: toNumber(perf.dpi),
      rvpi: toNumber(perf.rvpi),
      irr: perf.irr !== null ? toNumber(perf.irr) : null,
      unique_projects: toNumber(counts.unique_projects),
      private_positions: toNumber(counts.private_positions),
      liquid_positions: toNumber(counts.liquid_positions),
    };
  } catch (error) {
    console.error('Error fetching vehicle performance metrics:', error);
    // Return counts-only fallback if tbv_vehicle_performance_db doesn't exist
    try {
      const positionCounts = await sql<{
        unique_projects: number;
        private_positions: number;
        liquid_positions: number;
      }[]>`
        SELECT
          COUNT(DISTINCT project_id) as unique_projects,
          COUNT(DISTINCT CASE WHEN established_type = 'Private' OR established_type = 'Established' THEN project_id END) as private_positions,
          COUNT(DISTINCT CASE WHEN established_type = 'Liquid' THEN project_id END) as liquid_positions
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
      `;

      const counts = positionCounts[0] || { unique_projects: 0, private_positions: 0, liquid_positions: 0 };

      return {
        date_reported: portfolioDate,
        nav: 0,
        tvpi: 0,
        dpi: 0,
        rvpi: 0,
        irr: null,
        unique_projects: toNumber(counts.unique_projects),
        private_positions: toNumber(counts.private_positions),
        liquid_positions: toNumber(counts.liquid_positions),
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Section 3: Top Positions by Market Value
// ============================================================================

export async function getTopPositions(
  vehicleId: string,
  portfolioDate: string,
  limit: number = 5
): Promise<TopPosition[]> {
  try {
    // Get latest date_reported for cost calculation
    const latestOwnershipDate = await sql<{ max_date: string }[]>`
      SELECT MAX(date_reported)::text as max_date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported <= ${portfolioDate}::date
    `;

    const ownershipDate = latestOwnershipDate[0]?.max_date || portfolioDate;

    // Join ownership (cost) with MV and project info
    const result = await sql<{
      project_id: string;
      project_name: string | null;
      asset_class: string;
      cost: number;
      market_value: number;
    }[]>`
      WITH ownership_cost AS (
        SELECT
          project_id,
          asset_class,
          SUM(delta_cost) as cost
        FROM at_tables.at_ownership_db_v2
        WHERE vehicle_id = ${vehicleId}
          AND date_reported <= ${portfolioDate}::date
        GROUP BY project_id, asset_class
      ),
      mv_data AS (
        SELECT
          project_id,
          asset_class,
          COALESCE(SUM(unrealized_market_value), 0) as market_value
        FROM tbv_db.fund_mv_db
        WHERE vehicle_id = ${vehicleId}
          AND portfolio_date = ${portfolioDate}::date
        GROUP BY project_id, asset_class
      )
      SELECT
        COALESCE(o.project_id, m.project_id) as project_id,
        p.project_id as project_name,
        COALESCE(o.asset_class, m.asset_class) as asset_class,
        COALESCE(o.cost, 0) as cost,
        COALESCE(m.market_value, 0) as market_value
      FROM ownership_cost o
      FULL OUTER JOIN mv_data m ON o.project_id = m.project_id AND o.asset_class = m.asset_class
      LEFT JOIN at_tables.at_project_universe_db p ON COALESCE(o.project_id, m.project_id) = p.project_id
      WHERE COALESCE(m.market_value, 0) > 0
      ORDER BY COALESCE(m.market_value, 0) DESC
      LIMIT ${limit}
    `;

    console.log(`[getTopPositions] Fetched ${result.length} top positions for ${vehicleId}`);

    return result.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name || row.project_id,
      asset_class: row.asset_class || 'Unknown',
      cost: toNumber(row.cost),
      market_value: toNumber(row.market_value),
      moic: calculateMOIC(toNumber(row.market_value), toNumber(row.cost)),
    }));
  } catch (error) {
    console.error('Error fetching top positions:', error);
    return [];
  }
}

// ============================================================================
// Portfolio Date Filter for Vehicle Card
// ============================================================================

export async function getVehiclePortfolioDates(vehicleId: string): Promise<string[]> {
  try {
    const result = await sql<{ portfolio_date: string }[]>`
      SELECT DISTINCT TO_CHAR(portfolio_date, 'YYYY-MM-DD') as portfolio_date
      FROM tbv_db.fund_mv_db
      WHERE vehicle_id = ${vehicleId}
      ORDER BY portfolio_date DESC
    `;

    return result.map((r) => r.portfolio_date);
  } catch (error) {
    console.error('Error fetching vehicle portfolio dates:', error);
    return [];
  }
}

// ============================================================================
// TBV Fund Filter for Vehicle Card
// ============================================================================

export async function getVehicleTBVFunds(vehicleId: string): Promise<string[]> {
  try {
    const result = await sql<{ tbv_fund: string }[]>`
      SELECT DISTINCT tbv_fund
      FROM at_tables.at_closing_db
      WHERE closing_id = ${vehicleId}
        AND tbv_fund IS NOT NULL
      ORDER BY tbv_fund
    `;

    return result.map((r) => r.tbv_fund);
  } catch (error) {
    console.error('Error fetching vehicle TBV funds:', error);
    return [];
  }
}
