'use server';

import sql from '@/lib/db';

// TypeScript interfaces per specification
export type PeriodType = 'Yearly' | 'Half Yearly' | 'Quarterly';

export interface TbvFund {
  tbv_fund: string;
  tbv_vehicle_id: string;
}

export interface HistoricalPerformanceRow {
  period: string;
  period_start: string;
  period_end: string;
  cumulative_deployment: number;
  deployment_pct: number;
  capital_calls: number;
  capital_calls_pct: number;
  distributions: number;
  distributions_pct: number;
  nav: number | null;
  tvpi: number | null;
  dpi: number | null;
  explanation: string;
  is_total: boolean;
}

export interface TbvFundPerformanceData {
  tbv_fund: string;
  tbv_vehicle_id: string;
  rows: HistoricalPerformanceRow[];
}

export interface HistoricalNotes {
  current_notes: string | null;
  previous_notes: string | null;
  previous_review_date: string | null;
}

/**
 * Format period based on period type
 */
function formatPeriod(dateStr: string, periodType: PeriodType): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed

  switch (periodType) {
    case 'Yearly':
      return `${year}`;
    case 'Half Yearly':
      return `${year} H${month <= 6 ? 1 : 2}`;
    case 'Quarterly':
      return `Q${Math.ceil(month / 3)} ${year}`;
    default:
      return `${year}`;
  }
}

/**
 * Get TBV funds available for a vehicle from at_closing_db
 */
export async function getTbvFunds(vehicleId: string): Promise<TbvFund[]> {
  try {
    const result = await sql<TbvFund[]>`
      SELECT DISTINCT
        tbv_fund,
        tbv_vehicle_id
      FROM at_tables.at_closing_db
      WHERE closing_id = ${vehicleId}
        AND tbv_fund IS NOT NULL
        AND tbv_vehicle_id IS NOT NULL
      ORDER BY tbv_fund
    `;

    console.log(`TBV funds fetched for: ${vehicleId}, count: ${result.length}`);
    return result;
  } catch (error) {
    console.error('Error fetching TBV funds:', error);
    return [];
  }
}

/**
 * Get the full date range including at_ledger_db dates
 */
export async function getFullDateRange(
  vehicleId: string,
  tbvVehicleId: string
): Promise<{ min_date: string | null; max_date: string | null }> {
  try {
    const result = await sql<{ min_date: string | null; max_date: string | null }[]>`
      SELECT
        LEAST(
          (SELECT MIN(date_reported) FROM at_tables.at_ownership_db_v2 WHERE vehicle_id = ${vehicleId}),
          (SELECT MIN(date_reported) FROM at_tables.at_ledger_db WHERE tbv_vehicle_id = ${tbvVehicleId})
        )::text as min_date,
        GREATEST(
          (SELECT MAX(date_reported) FROM at_tables.at_ownership_db_v2 WHERE vehicle_id = ${vehicleId}),
          (SELECT MAX(date_reported) FROM at_tables.at_ledger_db WHERE tbv_vehicle_id = ${tbvVehicleId})
        )::text as max_date
    `;

    return {
      min_date: result[0]?.min_date || null,
      max_date: result[0]?.max_date || null,
    };
  } catch (error) {
    console.error('Error fetching full date range:', error);
    return { min_date: null, max_date: null };
  }
}

/**
 * Get historical performance summary for ALL TBV funds (returns array of fund data)
 */
export async function getAllTbvFundsPerformance(
  vehicleId: string,
  periodStart: string,
  periodEnd: string,
  periodType: PeriodType
): Promise<TbvFundPerformanceData[]> {
  try {
    // Get all TBV funds for this vehicle
    const tbvFunds = await getTbvFunds(vehicleId);

    if (tbvFunds.length === 0) {
      console.log(`No TBV funds found for vehicle: ${vehicleId}`);
      return [];
    }

    // Get performance data for each TBV fund
    const results: TbvFundPerformanceData[] = [];

    for (const fund of tbvFunds) {
      // Get the full date range including ledger dates
      const dateRange = await getFullDateRange(vehicleId, fund.tbv_vehicle_id);
      const effectiveStart = periodStart || dateRange.min_date || periodStart;
      const effectiveEnd = dateRange.max_date && new Date(dateRange.max_date) > new Date(periodEnd)
        ? dateRange.max_date
        : periodEnd;

      const rows = await getHistoricalPerformanceSummary(
        vehicleId,
        fund.tbv_vehicle_id,
        effectiveStart,
        effectiveEnd,
        periodType
      );

      results.push({
        tbv_fund: fund.tbv_fund,
        tbv_vehicle_id: fund.tbv_vehicle_id,
        rows,
      });
    }

    console.log(`Historical changes fetched for: ${vehicleId}, TBV funds: ${results.length}`);
    return results;
  } catch (error) {
    console.error('Error fetching all TBV funds performance:', error);
    return [];
  }
}

/**
 * Get historical performance summary with period aggregation
 */
export async function getHistoricalPerformanceSummary(
  vehicleId: string,
  tbvVehicleId: string,
  periodStart: string,
  periodEnd: string,
  periodType: PeriodType
): Promise<HistoricalPerformanceRow[]> {
  try {
    // First, get all deployment data
    const deploymentResult = await sql<{
      date_reported: string;
      delta_cost: number;
    }[]>`
      SELECT
        date_reported::text,
        COALESCE(SUM(delta_cost), 0) as delta_cost
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported >= ${periodStart}::date
        AND date_reported <= ${periodEnd}::date
      GROUP BY date_reported
      ORDER BY date_reported
    `;

    // Get all flows data (Capital Called and Distribution)
    const flowsResult = await sql<{
      flow_date: string;
      flow_type: string;
      flow_amount: number;
    }[]>`
      SELECT
        flow_date::text,
        flow_type,
        COALESCE(SUM(flow_amount), 0) as flow_amount
      FROM at_tables.at_flows_db
      WHERE tbv_vehicle_id = ${tbvVehicleId}
        AND flow_date >= ${periodStart}::date
        AND flow_date <= ${periodEnd}::date
      GROUP BY flow_date, flow_type
      ORDER BY flow_date
    `;

    // Get NAV data from at_ledger_db
    const navResult = await sql<{
      date_reported: string;
      nav: number | null;
    }[]>`
      SELECT
        date_reported::text,
        nav
      FROM at_tables.at_ledger_db
      WHERE tbv_vehicle_id = ${tbvVehicleId}
        AND date_reported >= ${periodStart}::date
        AND date_reported <= ${periodEnd}::date
      ORDER BY date_reported
    `;

    // Get performance data (TVPI/DPI)
    const performanceResult = await sql<{
      date_reported: string;
      tbv_tvpi: number | null;
      tbv_dpi: number | null;
    }[]>`
      SELECT
        date_reported::text,
        tbv_tvpi,
        tbv_dpi
      FROM performances.tbv_vehicle_performance_db
      WHERE tbv_vehicle_id = ${tbvVehicleId}
        AND date_reported >= ${periodStart}::date
        AND date_reported <= ${periodEnd}::date
      ORDER BY date_reported
    `;

    // Generate period spine
    const periods = generatePeriodSpine(periodStart, periodEnd, periodType);

    // Aggregate data by period
    const periodData: Map<string, {
      deployment: number;
      capitalCalls: number;
      distributions: number;
      nav: number | null;
      tvpi: number | null;
      dpi: number | null;
    }> = new Map();

    // Initialize periods
    for (const period of periods) {
      periodData.set(period.label, {
        deployment: 0,
        capitalCalls: 0,
        distributions: 0,
        nav: null,
        tvpi: null,
        dpi: null,
      });
    }

    // Aggregate deployment by period
    for (const row of deploymentResult) {
      const periodLabel = formatPeriod(row.date_reported, periodType);
      const data = periodData.get(periodLabel);
      if (data) {
        data.deployment += Number(row.delta_cost) || 0;
      }
    }

    // Aggregate flows by period - FIXED: 'Capital Called' and 'Distribution'
    for (const row of flowsResult) {
      const periodLabel = formatPeriod(row.flow_date, periodType);
      const data = periodData.get(periodLabel);
      if (data) {
        const flowType = row.flow_type || '';
        // Match exact flow_type values from schema
        if (flowType === 'Capital Called') {
          data.capitalCalls += Math.abs(Number(row.flow_amount) || 0);
        } else if (flowType === 'Distribution') {
          data.distributions += Math.abs(Number(row.flow_amount) || 0);
        }
      }
    }

    // Get latest NAV per period
    for (const row of navResult) {
      const periodLabel = formatPeriod(row.date_reported, periodType);
      const data = periodData.get(periodLabel);
      if (data && row.nav !== null) {
        // Keep the latest NAV value within the period
        data.nav = Number(row.nav);
      }
    }

    // Get latest TVPI/DPI per period
    for (const row of performanceResult) {
      const periodLabel = formatPeriod(row.date_reported, periodType);
      const data = periodData.get(periodLabel);
      if (data) {
        // Keep the latest value within the period
        if (row.tbv_tvpi !== null) data.tvpi = Number(row.tbv_tvpi);
        if (row.tbv_dpi !== null) data.dpi = Number(row.tbv_dpi);
      }
    }

    // Calculate totals
    let totalDeployment = 0;
    let totalCapitalCalls = 0;
    let totalDistributions = 0;

    for (const data of periodData.values()) {
      totalDeployment += data.deployment;
      totalCapitalCalls += data.capitalCalls;
      totalDistributions += data.distributions;
    }

    // Build result rows with cumulative deployment
    const rows: HistoricalPerformanceRow[] = [];
    let cumulativeDeployment = 0;
    let maxTvpi: number | null = null;
    let maxDpi: number | null = null;
    let latestNav: number | null = null;

    for (const period of periods) {
      const data = periodData.get(period.label);
      if (data) {
        cumulativeDeployment += data.deployment;

        // Track max TVPI/DPI and latest NAV for total row
        if (data.tvpi !== null) {
          maxTvpi = maxTvpi === null ? data.tvpi : Math.max(maxTvpi, data.tvpi);
        }
        if (data.dpi !== null) {
          maxDpi = maxDpi === null ? data.dpi : Math.max(maxDpi, data.dpi);
        }
        if (data.nav !== null) {
          latestNav = data.nav;
        }

        rows.push({
          period: period.label,
          period_start: period.start,
          period_end: period.end,
          cumulative_deployment: cumulativeDeployment,
          deployment_pct: totalDeployment > 0 ? cumulativeDeployment / totalDeployment : 0,
          capital_calls: data.capitalCalls,
          capital_calls_pct: totalCapitalCalls > 0 ? data.capitalCalls / totalCapitalCalls : 0,
          distributions: data.distributions,
          distributions_pct: totalDistributions > 0 ? data.distributions / totalDistributions : 0,
          nav: data.nav,
          tvpi: data.tvpi,
          dpi: data.dpi,
          explanation: '',
          is_total: false,
        });
      }
    }

    // Add TOTAL row
    rows.push({
      period: 'TOTAL',
      period_start: periodStart,
      period_end: periodEnd,
      cumulative_deployment: cumulativeDeployment,
      deployment_pct: 1,
      capital_calls: totalCapitalCalls,
      capital_calls_pct: 1,
      distributions: totalDistributions,
      distributions_pct: 1,
      nav: latestNav,
      tvpi: maxTvpi,
      dpi: maxDpi,
      explanation: '',
      is_total: true,
    });

    console.log(`Historical performance fetched for: ${vehicleId} / ${tbvVehicleId}, periods: ${rows.length - 1}`);
    return rows;
  } catch (error) {
    console.error('Error fetching historical performance summary:', error);
    return [];
  }
}

/**
 * Generate period spine from start to end date
 */
function generatePeriodSpine(
  startDate: string,
  endDate: string,
  periodType: PeriodType
): { label: string; start: string; end: string }[] {
  const periods: { label: string; start: string; end: string }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Align to period start
  let current = new Date(start);

  switch (periodType) {
    case 'Yearly':
      current.setMonth(0, 1); // Start of year
      break;
    case 'Half Yearly':
      current.setMonth(current.getMonth() < 6 ? 0 : 6, 1);
      break;
    case 'Quarterly':
      const q = Math.floor(current.getMonth() / 3);
      current.setMonth(q * 3, 1);
      break;
  }

  while (current <= end) {
    const periodStart = new Date(current);
    let periodEnd: Date;

    switch (periodType) {
      case 'Yearly':
        periodEnd = new Date(current.getFullYear(), 11, 31);
        current.setFullYear(current.getFullYear() + 1);
        break;
      case 'Half Yearly':
        if (current.getMonth() < 6) {
          periodEnd = new Date(current.getFullYear(), 5, 30);
          current.setMonth(6);
        } else {
          periodEnd = new Date(current.getFullYear(), 11, 31);
          current.setFullYear(current.getFullYear() + 1);
          current.setMonth(0);
        }
        break;
      case 'Quarterly':
        const quarter = Math.floor(current.getMonth() / 3);
        const lastMonthOfQuarter = (quarter + 1) * 3 - 1;
        periodEnd = new Date(current.getFullYear(), lastMonthOfQuarter + 1, 0);
        current.setMonth(current.getMonth() + 3);
        break;
      default:
        periodEnd = new Date(current.getFullYear(), 11, 31);
        current.setFullYear(current.getFullYear() + 1);
    }

    const label = formatPeriod(periodStart.toISOString(), periodType);

    periods.push({
      label,
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
    });
  }

  return periods;
}

/**
 * Get historical notes from section_summaries
 */
export async function getHistoricalNotes(
  vehicleId: string,
  dateOfReview: string
): Promise<HistoricalNotes> {
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
        AND rs.section_code = 'historical_changes'
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
        AND rs.section_code = 'historical_changes'
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
    console.log('Historical notes not available (table may not exist):', error);
    return {
      current_notes: null,
      previous_notes: null,
      previous_review_date: null,
    };
  }
}
