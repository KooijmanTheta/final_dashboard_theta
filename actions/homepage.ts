'use server';

import sql from '@/lib/db';
import { cookies } from 'next/headers';

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
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
