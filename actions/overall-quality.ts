'use server';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_MONITORING_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_MONITORING_TABLE_ID;

export interface MonitoringRecord {
  recordId: string;
  monitoringId: string;
  vehicleId: string;
  dateMemo: string;
  quarter: string;
  hasPortfolio: boolean;
  hasStandardizedPortfolio: boolean;
  hasAnyPortfolio: boolean;
  hasFinancials: boolean;
  hasLpUpdate: boolean;
  portfolioActionItem: string | null;
  tbvFunds: string[];
}

/**
 * Fetch all monitoring records from Airtable with pagination.
 * - hasPortfolio: true when the `portfolio` attachment column has files
 * - hasStandardizedPortfolio: true when the `standardized_portfolio_v2` attachment column has files
 */
const VALID_TBVS = new Set(['TBV1', 'TBV2', 'TBV3', 'TBV4', 'TBV5']);

export async function getMonitoringRecords(): Promise<MonitoringRecord[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  const allRecords: MonitoringRecord[] = [];
  let offset: string | undefined = undefined;

  const fields = [
    'monitoring_id',
    'vehicle_universe_str',
    'date_memo',
    'quarter',
    'portfolio',
    'standardized_portfolio_v2',
    'portfolio_action_item',
    'tbv_fund (from closing) (from vehicle_id)',
    'financials',
    'lp_updates',
  ];

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
    for (const f of fields) {
      url.searchParams.append('fields[]', f);
    }
    url.searchParams.set('pageSize', '100');
    if (offset) {
      url.searchParams.set('offset', offset);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable API error ${res.status}: ${text}`);
    }

    const data = await res.json();

    for (const record of data.records || []) {
      const f = record.fields;
      // Attachment fields are arrays — present & non-empty means file(s) exist
      const portfolioAttachments = Array.isArray(f.portfolio) ? f.portfolio : [];
      const standardizedAttachments = Array.isArray(f.standardized_portfolio_v2) ? f.standardized_portfolio_v2 : [];

      const financialsAttachments = Array.isArray(f.financials) ? f.financials : [];
      // lp_updates is a linked record field — array of record IDs when present
      const lpUpdateLinks = Array.isArray(f.lp_updates) ? f.lp_updates : [];

      const hasPortfolio = portfolioAttachments.length > 0;
      const hasStandardized = standardizedAttachments.length > 0;
      const hasFinancials = financialsAttachments.length > 0;
      const hasLpUpdate = lpUpdateLinks.length > 0;

      // tbv_fund is a lookup array, may contain duplicates
      const rawTbv = f['tbv_fund (from closing) (from vehicle_id)'];
      const tbvFunds = Array.isArray(rawTbv) ? [...new Set(rawTbv as string[])] : [];

      allRecords.push({
        recordId: record.id,
        monitoringId: f.monitoring_id || '',
        vehicleId: f.vehicle_universe_str || '',
        dateMemo: f.date_memo || '',
        quarter: f.quarter || '',
        hasPortfolio,
        hasStandardizedPortfolio: hasStandardized,
        hasAnyPortfolio: hasPortfolio || hasStandardized,
        hasFinancials,
        hasLpUpdate,
        portfolioActionItem: f.portfolio_action_item || null,
        tbvFunds,
      });
    }

    offset = data.offset;
  } while (offset);

  // Only include vehicles assigned to TBV1-TBV5
  return allRecords.filter(r => r.tbvFunds.some(t => VALID_TBVS.has(t)));
}
