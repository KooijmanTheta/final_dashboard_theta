'use server';

import sql from '@/lib/db';
import type { FundManager, InvestmentName, PortfolioDate } from '@/lib/types';

export async function getFundManagers(): Promise<FundManager[]> {
  try {
    // fund_id in at_fund_universe_db contains the fund manager NAME (e.g., "Dragonfly Capital")
    const result = await sql<FundManager[]>`
      SELECT DISTINCT
        fund_id as fund_manager_id,
        fund_id as fund_manager_name
      FROM at_tables.at_fund_universe_db
      WHERE fund_id IS NOT NULL
      ORDER BY fund_id
    `;
    console.log('Fund managers fetched:', result.length);
    return result;
  } catch (error) {
    console.error('Error fetching fund managers:', error);
    return [];
  }
}

export async function getInvestmentNames(fundManagerId?: string): Promise<InvestmentName[]> {
  try {
    // at_investment_names_db links to fund_universe via fund_id column
    if (fundManagerId) {
      const result = await sql<InvestmentName[]>`
        SELECT DISTINCT
          i.vehicle_id as investment_name_id,
          i.full_investment_name as investment_name,
          i.vehicle_id,
          i.full_investment_name as full_strategy_name,
          COALESCE(v.vintage, 0)::int as vintage
        FROM at_tables.at_investment_names_db i
        LEFT JOIN at_tables.at_vehicle_universe_db v ON i.vehicle_id = v.vehicle_id
        WHERE i.full_investment_name IS NOT NULL
          AND i.fund_id = ${fundManagerId}
        ORDER BY vintage DESC NULLS LAST, i.full_investment_name
      `;
      console.log('Investment names fetched for fund manager:', fundManagerId, 'count:', result.length);
      return result;
    } else {
      const result = await sql<InvestmentName[]>`
        SELECT DISTINCT
          i.vehicle_id as investment_name_id,
          i.full_investment_name as investment_name,
          i.vehicle_id,
          i.full_investment_name as full_strategy_name,
          COALESCE(v.vintage, 0)::int as vintage
        FROM at_tables.at_investment_names_db i
        LEFT JOIN at_tables.at_vehicle_universe_db v ON i.vehicle_id = v.vehicle_id
        WHERE i.full_investment_name IS NOT NULL
        ORDER BY vintage DESC NULLS LAST, i.full_investment_name
        LIMIT 100
      `;
      console.log('Investment names fetched (all):', result.length);
      return result;
    }
  } catch (error) {
    console.error('Error fetching investment names:', error);
    return [];
  }
}

export async function getPortfolioDates(vehicleId: string): Promise<PortfolioDate[]> {
  try {
    const result = await sql<PortfolioDate[]>`
      SELECT DISTINCT portfolio_date::text as date
      FROM tbv_db.fund_mv_db
      WHERE vehicle_id = ${vehicleId}
      ORDER BY date DESC
    `;
    console.log('Portfolio dates fetched for vehicle:', vehicleId, 'count:', result.length);
    return result;
  } catch (error) {
    console.error('Error fetching portfolio dates:', error);
    return [];
  }
}

export async function getLatestPortfolioDate(vehicleId: string): Promise<string | null> {
  try {
    const result = await sql<{ date: string }[]>`
      SELECT MAX(portfolio_date)::text as date
      FROM tbv_db.fund_mv_db
      WHERE vehicle_id = ${vehicleId}
    `;
    console.log('Latest portfolio date for vehicle:', vehicleId, 'date:', result[0]?.date);
    return result[0]?.date || null;
  } catch (error) {
    console.error('Error fetching latest portfolio date:', error);
    return null;
  }
}

/**
 * Get available date_reported dates from at_ownership_db_v2 (Investment Period filter)
 * These represent the dates when ownership/cost data was reported
 * Sorted ascending for start date selection
 */
export async function getDateReportedDates(vehicleId: string): Promise<PortfolioDate[]> {
  try {
    const result = await sql<PortfolioDate[]>`
      SELECT DISTINCT TO_CHAR(date_reported, 'YYYY-MM-DD') as date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported IS NOT NULL
      ORDER BY date ASC
    `;
    console.log('Date reported dates fetched for vehicle:', vehicleId, 'count:', result.length);
    return result;
  } catch (error) {
    console.error('Error fetching date reported dates:', error);
    return [];
  }
}

/**
 * Get available end dates for investment period (restricted by portfolio date)
 * Returns dates that are on or before the selected portfolio date
 */
export async function getDateReportedEndDates(vehicleId: string, portfolioDate: string): Promise<PortfolioDate[]> {
  try {
    const result = await sql<PortfolioDate[]>`
      SELECT DISTINCT TO_CHAR(date_reported, 'YYYY-MM-DD') as date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
        AND date_reported IS NOT NULL
        AND date_reported <= ${portfolioDate}::date
      ORDER BY date DESC
    `;
    console.log('Date reported end dates fetched for vehicle:', vehicleId, 'count:', result.length);
    return result;
  } catch (error) {
    console.error('Error fetching date reported end dates:', error);
    return [];
  }
}

/**
 * Get the investment period range for a vehicle (min and max date_reported)
 */
export async function getInvestmentPeriodRange(vehicleId: string): Promise<{ min_date: string | null; max_date: string | null }> {
  try {
    const result = await sql<{ min_date: string | null; max_date: string | null }[]>`
      SELECT
        TO_CHAR(MIN(date_reported), 'YYYY-MM-DD') as min_date,
        TO_CHAR(MAX(date_reported), 'YYYY-MM-DD') as max_date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
    `;
    console.log('Investment period range for vehicle:', vehicleId, 'min:', result[0]?.min_date, 'max:', result[0]?.max_date);
    return result[0] || { min_date: null, max_date: null };
  } catch (error) {
    console.error('Error fetching investment period range:', error);
    return { min_date: null, max_date: null };
  }
}

/**
 * Get the latest date_reported for a vehicle (restricted by portfolio date)
 */
export async function getLatestDateReported(vehicleId: string, portfolioDate?: string): Promise<string | null> {
  try {
    const result = portfolioDate
      ? await sql<{ date: string }[]>`
          SELECT TO_CHAR(MAX(date_reported), 'YYYY-MM-DD') as date
          FROM at_tables.at_ownership_db_v2
          WHERE vehicle_id = ${vehicleId}
            AND date_reported <= ${portfolioDate}::date
        `
      : await sql<{ date: string }[]>`
          SELECT TO_CHAR(MAX(date_reported), 'YYYY-MM-DD') as date
          FROM at_tables.at_ownership_db_v2
          WHERE vehicle_id = ${vehicleId}
        `;
    console.log('Latest date reported for vehicle:', vehicleId, 'date:', result[0]?.date);
    return result[0]?.date || null;
  } catch (error) {
    console.error('Error fetching latest date reported:', error);
    return null;
  }
}

/**
 * Get the earliest date_reported for a vehicle (start of investment period)
 */
export async function getEarliestDateReported(vehicleId: string): Promise<string | null> {
  try {
    const result = await sql<{ date: string }[]>`
      SELECT TO_CHAR(MIN(date_reported), 'YYYY-MM-DD') as date
      FROM at_tables.at_ownership_db_v2
      WHERE vehicle_id = ${vehicleId}
    `;
    console.log('Earliest date reported for vehicle:', vehicleId, 'date:', result[0]?.date);
    return result[0]?.date || null;
  } catch (error) {
    console.error('Error fetching earliest date reported:', error);
    return null;
  }
}
