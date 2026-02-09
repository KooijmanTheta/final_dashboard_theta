'use server';

import sql from '@/lib/db';
import { cookies } from 'next/headers';
import logoMapping from '@/public/logos/_mapping.json';

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

export interface MyFundCard {
  fund_id: string;
  logo_url: string | null;
  aum: number | null;
  capital_committed: number;
  days_since_meeting: number | null;
  relationship_type: 'primary' | 'secondary';
}

export interface MyFundsData {
  primary: MyFundCard[];
  secondary: MyFundCard[];
}

export interface HomepageData {
  vehicleCount: number;
  totalAuM: number;
  fundManagerCount: number;
  username: string;
}

export async function getHomepageData(): Promise<HomepageData> {
  try {
    const cookieStore = await cookies();
    const user = cookieStore.get('site_user');
    const username = user?.value || 'User';

    const [vehicleResult, fundManagerResult] = await Promise.all([
      sql<{ vehicle_count: number }[]>`
        SELECT COUNT(DISTINCT vehicle_id)::int AS vehicle_count
        FROM at_tables.at_investment_names_db
        WHERE full_investment_name IS NOT NULL
      `,
      sql<{ fund_manager_count: number; total_aum: number }[]>`
        SELECT
          COUNT(DISTINCT fund_id)::int AS fund_manager_count,
          COALESCE(SUM(total_per_manager), 0) AS total_aum
        FROM at_tables.at_fund_universe_db
        WHERE fund_id IS NOT NULL
      `,
    ]);

    return {
      vehicleCount: toNumber(vehicleResult[0]?.vehicle_count),
      totalAuM: toNumber(fundManagerResult[0]?.total_aum),
      fundManagerCount: toNumber(fundManagerResult[0]?.fund_manager_count),
      username,
    };
  } catch (error) {
    console.error('Error fetching homepage data:', error);
    const cookieStore = await cookies();
    const user = cookieStore.get('site_user');
    return {
      vehicleCount: 0,
      totalAuM: 0,
      fundManagerCount: 0,
      username: user?.value || 'User',
    };
  }
}

export async function getMyFunds(): Promise<MyFundsData> {
  const empty: MyFundsData = { primary: [], secondary: [] };

  try {
    const cookieStore = await cookies();
    const user = cookieStore.get('site_user');
    const username = user?.value || '';
    if (!username) return empty;

    // Defensive: ensure fund_monitoring schema and fm_tracking table exist
    await sql`CREATE SCHEMA IF NOT EXISTS fund_monitoring`;
    await sql`
      CREATE TABLE IF NOT EXISTS fund_monitoring.fm_tracking (
        fund_id text PRIMARY KEY,
        fund_status text DEFAULT 'Active',
        last_meeting_date date,
        next_meeting_date date,
        quarterly_report_date date,
        primary_contact text,
        investor_portal_url text,
        updated_at timestamptz DEFAULT now(),
        updated_by text
      )
    `;

    const logos = logoMapping as Record<string, string>;

    const rows = await sql<{
      fund_id: string;
      aum: string | null;
      capital_committed: string | null;
      days_since_meeting: string | null;
      relationship_type: string;
    }[]>`
      WITH user_funds AS (
        SELECT DISTINCT
          i.fund_id,
          MIN(
            CASE
              WHEN LOWER(v.primary_relationship_owner) LIKE LOWER(${username}) || '%' THEN 'primary'
              WHEN LOWER(v.secondary_relationship_owner) LIKE '%' || LOWER(${username}) || '%' THEN 'secondary'
            END
          ) AS relationship_type
        FROM at_tables.at_vehicle_universe_db v
        JOIN at_tables.at_investment_names_db i ON v.vehicle_id = i.vehicle_id
        WHERE (
          LOWER(v.primary_relationship_owner) LIKE LOWER(${username}) || '%'
          OR LOWER(v.secondary_relationship_owner) LIKE '%' || LOWER(${username}) || '%'
        )
        AND i.fund_id IS NOT NULL
        GROUP BY i.fund_id
      ),
      fund_commitments AS (
        SELECT
          i.fund_id,
          SUM(ABS(fl.flow_amount)) AS total_committed
        FROM at_tables.at_flows_db fl
        JOIN at_tables.at_investment_names_db i ON fl.vehicle_id = i.vehicle_id
        WHERE LOWER(fl.flow_type) = 'commitment'
        AND i.fund_id IS NOT NULL
        GROUP BY i.fund_id
      )
      SELECT
        uf.fund_id,
        f.total_per_manager AS aum,
        COALESCE(fc.total_committed, 0) AS capital_committed,
        CASE
          WHEN t.last_meeting_date IS NOT NULL
          THEN EXTRACT(DAY FROM now() - t.last_meeting_date::timestamp)::int
          ELSE NULL
        END AS days_since_meeting,
        uf.relationship_type
      FROM user_funds uf
      LEFT JOIN at_tables.at_fund_universe_db f ON uf.fund_id = f.fund_id
      LEFT JOIN fund_commitments fc ON uf.fund_id = fc.fund_id
      LEFT JOIN fund_monitoring.fm_tracking t ON uf.fund_id = t.fund_id
      ORDER BY uf.fund_id
    `;

    const primary: MyFundCard[] = [];
    const secondary: MyFundCard[] = [];

    for (const row of rows) {
      const card: MyFundCard = {
        fund_id: row.fund_id,
        logo_url: logos[row.fund_id] ?? null,
        aum: row.aum != null ? toNumber(row.aum) : null,
        capital_committed: toNumber(row.capital_committed),
        days_since_meeting: row.days_since_meeting != null ? toNumber(row.days_since_meeting) : null,
        relationship_type: row.relationship_type === 'primary' ? 'primary' : 'secondary',
      };

      if (card.relationship_type === 'primary') {
        primary.push(card);
      } else {
        secondary.push(card);
      }
    }

    return { primary, secondary };
  } catch (error) {
    console.error('Error fetching my funds:', error);
    return empty;
  }
}
