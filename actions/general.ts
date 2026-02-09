'use server';

import sql from '@/lib/db';
import logoMapping from '@/public/logos/_mapping.json';

// TypeScript interfaces per specification
export interface GeneralManagerInfo {
  name_fund: string;
  founded: number | null;
  aum: number | null;
  location: string | null;
  country: string | null;
  website: string | null;
  twitter_handle: string | null;
  linkedin: string | null;
  logo_url: string | null;
}

export interface TBVFundFlows {
  tbv_fund: string;
  commitment: number;
  called: number;
  called_percentage: number;
  distributed: number;
  dpi: number; // DPI = Total Distributed / Commitment
}

export interface GeneralFundInfo {
  name_fund_vintage: string;
  investment_period: string;
  fund_life_extensions: string;
  fees: string;
  gp_commit: number | null;
  fund_size: number | null;
  vintage_year: number | null;
  tbv_fund_flows: TBVFundFlows[];
  fund_relationship_owner: string | null;
  secondary_relationship_owner: string | null;
  date_of_review: string;
}

export interface GeneralNotes {
  last_review_outstanding_actions: string | null;
  last_review_conclusion: string | null;
}

export interface FundKPIs {
  total_committed: number;
  total_called: number;
  uncalled_capital: number;
  total_distributed: number;
  dpi: number;
  called_pct: number;
}

export interface CapitalDeploymentPoint {
  flow_date: string;
  cumulative_called: number;
  cumulative_distributed: number;
}

export interface VehicleCardData {
  vehicle_id: string;
  full_strategy_name: string | null;
  vintage: number | null;
  kpis: FundKPIs;
  timeline: CapitalDeploymentPoint[];
}

export interface InvestmentPeriodRange {
  start_date: string | null;
  end_date: string | null;
}

/**
 * Table 1: General Manager Info
 * Fetches fund manager information from at_fund_universe_db
 */
export async function getGeneralManagerInfo(fundManagerId: string): Promise<GeneralManagerInfo | null> {
  try {
    const result = await sql<GeneralManagerInfo[]>`
      SELECT
        fund_id as name_fund,
        NULL::int as founded,
        total_per_manager as aum,
        location,
        country,
        fund_website as website,
        twitter_handle,
        linkedin_url as linkedin,
        logo_url
      FROM at_tables.at_fund_universe_db
      WHERE fund_id = ${fundManagerId}
      LIMIT 1
    `;
    console.log('Manager info fetched for:', fundManagerId, result.length > 0 ? 'found' : 'not found');
    const row = result[0] || null;
    if (row) {
      const localLogos = logoMapping as Record<string, string>;
      row.logo_url = localLogos[fundManagerId] ?? row.logo_url;
    }
    return row;
  } catch (error) {
    console.error('Error fetching manager info:', error);
    return null;
  }
}

/**
 * Table 2: General Fund Info
 * Fetches fund vehicle information and calculates flows
 */
export async function getGeneralFundInfo(
  vehicleId: string,
  dateOfReview: string
): Promise<GeneralFundInfo | null> {
  try {
    // Get vehicle info
    const vehicleResult = await sql<{
      vehicle_id: string;
      vintage: number | null;
      fund_life: number | null;
      potential_extension: number | null;
      investment_period: number | null;
      management_fee: number | null;
      performance_fee: number | null;
      gp_commitment: number | null;
      fund_size: number | null;
      full_strategy_name: string | null;
      primary_relationship_owner: string | null;
      secondary_relationship_owner: string | null;
    }[]>`
      SELECT
        v.vehicle_id,
        v.vintage,
        v.fund_life,
        v.potential_extension,
        v.investment_period,
        v.management_fee,
        v.performance_fee,
        v.gp_commitment,
        v.fund_size,
        v.full_strategy_name,
        v.primary_relationship_owner,
        v.secondary_relationship_owner
      FROM at_tables.at_vehicle_universe_db v
      WHERE v.vehicle_id = ${vehicleId}
      LIMIT 1
    `;

    if (vehicleResult.length === 0) {
      console.log('No vehicle found for:', vehicleId);
      return null;
    }

    const vehicle = vehicleResult[0];

    // Get flows data grouped by TBV fund for commitment and called calculations
    const flowsResult = await sql<{
      tbv_fund: string;
      flow_type: string;
      total_amount: number;
    }[]>`
      SELECT
        COALESCE(tbv_fund, 'Unknown') as tbv_fund,
        flow_type,
        SUM(flow_amount) as total_amount
      FROM at_tables.at_flows_db
      WHERE vehicle_id = ${vehicleId}
        AND flow_date <= ${dateOfReview}::date
      GROUP BY tbv_fund, flow_type
      ORDER BY tbv_fund, flow_type
    `;

    // Aggregate flows by TBV fund
    const tbvFlowsMap = new Map<string, { commitment: number; called: number; distributed: number }>();

    for (const flow of flowsResult) {
      const tbvFund = flow.tbv_fund;
      if (!tbvFlowsMap.has(tbvFund)) {
        tbvFlowsMap.set(tbvFund, { commitment: 0, called: 0, distributed: 0 });
      }
      const tbvData = tbvFlowsMap.get(tbvFund)!;

      const flowType = flow.flow_type?.toLowerCase() || '';
      if (flowType === 'commitment') {
        tbvData.commitment += Math.abs(flow.total_amount || 0);
      } else if (flowType === 'capital called' || flowType === 'capital_called') {
        tbvData.called += Math.abs(flow.total_amount || 0);
      } else if (flowType === 'distribution' || flowType === 'capital return' || flowType === 'capital_return') {
        tbvData.distributed += Math.abs(flow.total_amount || 0);
      }
    }

    // Convert to array and calculate percentages
    const tbvFundFlows: TBVFundFlows[] = Array.from(tbvFlowsMap.entries())
      .map(([tbvFund, data]) => ({
        tbv_fund: tbvFund,
        commitment: data.commitment,
        called: data.called,
        called_percentage: data.commitment > 0 ? Math.round((data.called / data.commitment) * 100) : 0,
        distributed: data.distributed,
        dpi: data.commitment > 0 ? Math.round((data.distributed / data.commitment) * 100) : 0,
      }))
      .sort((a, b) => a.tbv_fund.localeCompare(b.tbv_fund));

    // Format strings per specification
    const vintage = vehicle.vintage || 0;
    const fundLife = vehicle.fund_life || 0;
    const extension = vehicle.potential_extension || 0;
    const investmentPeriod = vehicle.investment_period || 0;
    const mgmtFee = vehicle.management_fee || 0;
    const perfFee = vehicle.performance_fee || 0;

    const fundInfo: GeneralFundInfo = {
      name_fund_vintage: `${vehicle.full_strategy_name || 'Unknown'} (${vintage})`,
      investment_period: `${investmentPeriod}y (${vintage + investmentPeriod})`,
      fund_life_extensions: `${fundLife}y + ${extension}y (${vintage + fundLife} | ${vintage + fundLife + extension})`,
      fees: `${(mgmtFee * 100).toFixed(1)}%/${(perfFee * 100).toFixed(0)}%`,
      gp_commit: vehicle.gp_commitment,
      fund_size: vehicle.fund_size,
      vintage_year: vehicle.vintage,
      tbv_fund_flows: tbvFundFlows,
      fund_relationship_owner: vehicle.primary_relationship_owner,
      secondary_relationship_owner: vehicle.secondary_relationship_owner,
      date_of_review: dateOfReview,
    };

    console.log('Fund info fetched for:', vehicleId, 'TBV funds:', tbvFundFlows.length);
    return fundInfo;
  } catch (error) {
    console.error('Error fetching fund info:', error);
    return null;
  }
}

/**
 * Section 3: Notes
 * Fetches notes from section_summaries table (if available)
 */
export async function getGeneralNotes(
  vehicleId: string,
  dateOfReview: string
): Promise<GeneralNotes> {
  try {
    // Try to fetch notes from section_summaries
    const result = await sql<{
      section_code: string;
      summary_text: string;
    }[]>`
      SELECT
        rs.section_code,
        ss.summary_text
      FROM reports.section_summaries ss
      JOIN reports.report_sections rs ON ss.section_id::text = rs.section_id::text
      WHERE ss.vehicle_id = ${vehicleId}
        AND ss.review_date = ${dateOfReview}::date
        AND rs.section_code IN ('general_actions', 'general_conclusion')
    `;

    const notes: GeneralNotes = {
      last_review_outstanding_actions: null,
      last_review_conclusion: null,
    };

    for (const row of result) {
      if (row.section_code === 'general_actions') {
        notes.last_review_outstanding_actions = row.summary_text;
      } else if (row.section_code === 'general_conclusion') {
        notes.last_review_conclusion = row.summary_text;
      }
    }

    return notes;
  } catch (error) {
    // Notes table may not exist yet - return empty
    console.log('Notes not available (table may not exist):', error);
    return {
      last_review_outstanding_actions: null,
      last_review_conclusion: null,
    };
  }
}

/**
 * Get investment period range (min/max date_reported)
 */
export async function getInvestmentPeriodRange(vehicleId: string): Promise<InvestmentPeriodRange> {
  try {
    const result = await sql<{ min_date: string | null; max_date: string | null }[]>`
      SELECT
        MIN(date_reported)::text as min_date,
        MAX(date_reported)::text as max_date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
    `;
    return {
      start_date: result[0]?.min_date || null,
      end_date: result[0]?.max_date || null,
    };
  } catch (error) {
    console.error('Error fetching investment period range:', error);
    return { start_date: null, end_date: null };
  }
}

/**
 * Vehicle Record IDs for timeline lookup
 */
export interface VehicleRecordIds {
  record_id_vehicle_universe: string | null;
  record_id_fund_universe: string | null;
}

/**
 * Get record_id_vehicle_universe and record_id_fund_universe from vehicle_id
 * Used for looking up updates from at_processed_notes
 */
export async function getVehicleRecordIds(vehicleId: string): Promise<VehicleRecordIds> {
  try {
    const result = await sql<{
      record_id_vehicle_universe: string | null;
      record_id_fund_universe: string | null;
    }[]>`
      SELECT
        v.record_id_vehicle_universe,
        f.record_id_fund_universe
      FROM at_tables.at_vehicle_universe_db v
      LEFT JOIN at_tables.at_investment_names_db i ON v.vehicle_id = i.vehicle_id
      LEFT JOIN at_tables.at_fund_universe_db f ON i.fund_id = f.fund_id
      WHERE v.vehicle_id = ${vehicleId}
      LIMIT 1
    `;

    if (result.length === 0) {
      console.log('No record IDs found for vehicle:', vehicleId);
      return { record_id_vehicle_universe: null, record_id_fund_universe: null };
    }

    console.log('Record IDs fetched for vehicle:', vehicleId, result[0]);
    return result[0];
  } catch (error) {
    console.error('Error fetching vehicle record IDs:', error);
    return { record_id_vehicle_universe: null, record_id_fund_universe: null };
  }
}

/**
 * Aggregate KPI metrics across all TBV funds for a vehicle
 */
export async function getFundKPIs(
  vehicleId: string,
  dateOfReview: string
): Promise<FundKPIs> {
  try {
    const flowsResult = await sql<{
      flow_type: string;
      total_amount: number;
    }[]>`
      SELECT
        flow_type,
        SUM(flow_amount) as total_amount
      FROM at_tables.at_flows_db
      WHERE vehicle_id = ${vehicleId}
        AND flow_date <= ${dateOfReview}::date
      GROUP BY flow_type
    `;

    let committed = 0;
    let called = 0;
    let distributed = 0;

    for (const flow of flowsResult) {
      const ft = flow.flow_type?.toLowerCase() || '';
      if (ft === 'commitment') {
        committed += Math.abs(flow.total_amount || 0);
      } else if (ft === 'capital called' || ft === 'capital_called') {
        called += Math.abs(flow.total_amount || 0);
      } else if (ft === 'distribution' || ft === 'capital return' || ft === 'capital_return') {
        distributed += Math.abs(flow.total_amount || 0);
      }
    }

    return {
      total_committed: committed,
      total_called: called,
      uncalled_capital: committed - called,
      total_distributed: distributed,
      dpi: committed > 0 ? distributed / committed : 0,
      called_pct: committed > 0 ? called / committed : 0,
    };
  } catch (error) {
    console.error('Error fetching fund KPIs:', error);
    return {
      total_committed: 0,
      total_called: 0,
      uncalled_capital: 0,
      total_distributed: 0,
      dpi: 0,
      called_pct: 0,
    };
  }
}

/**
 * Capital deployment timeline — cumulative called & distributed over time
 */
export async function getCapitalDeploymentTimeline(
  vehicleId: string
): Promise<CapitalDeploymentPoint[]> {
  try {
    const rows = await sql<{
      flow_date: string;
      flow_type: string;
      flow_amount: number;
    }[]>`
      SELECT
        flow_date::text as flow_date,
        flow_type,
        flow_amount
      FROM at_tables.at_flows_db
      WHERE vehicle_id = ${vehicleId}
      ORDER BY flow_date ASC
    `;

    let cumCalled = 0;
    let cumDistributed = 0;
    const pointsMap = new Map<string, { cumulative_called: number; cumulative_distributed: number }>();

    for (const row of rows) {
      const ft = row.flow_type?.toLowerCase() || '';
      if (ft === 'capital called' || ft === 'capital_called') {
        cumCalled += Math.abs(row.flow_amount || 0);
      } else if (ft === 'distribution' || ft === 'capital return' || ft === 'capital_return') {
        cumDistributed += Math.abs(row.flow_amount || 0);
      } else {
        continue; // skip commitment rows — they don't affect deployment chart
      }
      pointsMap.set(row.flow_date, {
        cumulative_called: cumCalled,
        cumulative_distributed: cumDistributed,
      });
    }

    return Array.from(pointsMap.entries()).map(([date, vals]) => ({
      flow_date: date,
      ...vals,
    }));
  } catch (error) {
    console.error('Error fetching capital deployment timeline:', error);
    return [];
  }
}

/**
 * Get card data (KPIs + timeline) for all vehicles under a fund manager
 */
export async function getVehicleCardData(
  fundManagerId: string,
  dateOfReview: string
): Promise<VehicleCardData[]> {
  try {
    const vehicles = await sql<{
      vehicle_id: string;
      full_strategy_name: string | null;
      vintage: number | null;
    }[]>`
      SELECT DISTINCT
        v.vehicle_id,
        v.full_strategy_name,
        v.vintage
      FROM at_tables.at_investment_names_db i
      JOIN at_tables.at_vehicle_universe_db v ON i.vehicle_id = v.vehicle_id
      WHERE i.fund_id = ${fundManagerId}
      ORDER BY v.vintage DESC NULLS LAST
    `;

    if (vehicles.length === 0) return [];

    const results = await Promise.all(
      vehicles.map(async (v) => {
        const [kpis, timeline] = await Promise.all([
          getFundKPIs(v.vehicle_id, dateOfReview),
          getCapitalDeploymentTimeline(v.vehicle_id),
        ]);
        return {
          vehicle_id: v.vehicle_id,
          full_strategy_name: v.full_strategy_name,
          vintage: v.vintage,
          kpis,
          timeline,
        };
      })
    );

    return results;
  } catch (error) {
    console.error('Error fetching vehicle card data:', error);
    return [];
  }
}
