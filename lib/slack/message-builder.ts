// Slack Block Kit message templates for each notification type

export interface OverdueItem {
  vehicleId: string;
  quarter: string;
  deliverable: string;
  daysOverdue: number;
  dueDate: string;
  tbv: string;
}

export interface OverdueFilters {
  tbv: string;   // 'all' | 'TBV1' | 'TBV2' | ... | 'TBV5'
  type: string;  // 'all' | 'Portfolio' | 'LP Letter' | 'Financials'
  page: number;  // 1-based
}

const ITEMS_PER_PAGE = 10;
const TBV_OPTIONS = ['all', 'TBV1', 'TBV2', 'TBV3', 'TBV4', 'TBV5'];
const TYPE_OPTIONS = ['all', 'Portfolio', 'LP Letter', 'Financials'];

interface DigestStats {
  totalVehicles: number;
  outstandingCount: number;
  portfolioMissing: number;
  lpUpdateMissing: number;
  financialsMissing: number;
  topOverdue: OverdueItem[];
}

interface ReceivedItem {
  vehicleId: string;
  quarter: string;
  deliverable: string;
}

// ─── Overdue Alert ───────────────────────────────────────────────────────────

export function buildOverdueAlert(items: OverdueItem[]) {
  // Group by deliverable type
  const portfolioOverdue = items.filter(i => i.deliverable === 'Portfolio');
  const lpOverdue = items.filter(i => i.deliverable === 'LP Letter');
  const finOverdue = items.filter(i => i.deliverable === 'Financials');

  // Unique vehicles affected
  const uniqueVehicles = new Set(items.map(i => i.vehicleId)).size;

  // Most overdue (already sorted by daysOverdue desc)
  const top10 = items.slice(0, 10);
  const maxOverdue = items[0]?.daysOverdue || 0;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚠️ Daily Overdue Report', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${items.length}* overdue deliverables across *${uniqueVehicles}* vehicles (worst: *${maxOverdue}d* overdue)`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📁 Portfolio*\n${portfolioOverdue.length} overdue` },
        { type: 'mrkdwn', text: `*📊 LP Letter*\n${lpOverdue.length} overdue` },
        { type: 'mrkdwn', text: `*💰 Financials*\n${finOverdue.length} overdue` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*🔴 Most overdue:*' },
    },
  ];

  // Compact table-style list of top 10
  const lines = top10.map(item =>
    `• *${item.vehicleId}* — ${item.deliverable} · ${item.daysOverdue}d overdue · ${item.quarter}${item.tbv ? ` · _${item.tbv}_` : ''}`
  );
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n') },
  });

  if (items.length > 10) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_+ ${items.length - 10} more overdue deliverables — check the dashboard for the full list_` }],
    });
  }

  // Group by TBV for a quick breakdown
  const tbvMap = new Map<string, number>();
  for (const item of items) {
    tbvMap.set(item.tbv, (tbvMap.get(item.tbv) || 0) + 1);
  }
  const tbvEntries = [...tbvMap.entries()].sort((a, b) => b[1] - a[1]);
  if (tbvEntries.length > 1) {
    blocks.push({ type: 'divider' });
    const tbvLines = tbvEntries.slice(0, 8).map(([tbv, count]) => `${tbv}: ${count}`).join('  ·  ');
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*By TBV:* ${tbvLines}` }],
    });
  }

  return { blocks };
}

// ─── Interactive Overdue Alert (Bot API with buttons) ────────────────────────

function encodeAction(tbv: string, type: string, page: number): string {
  return `overdue_nav:tbv=${tbv}&type=${type}&page=${page}`;
}

export function parseActionId(actionId: string): OverdueFilters | null {
  if (!actionId.startsWith('overdue_nav:')) return null;
  const params = new URLSearchParams(actionId.slice('overdue_nav:'.length));
  return {
    tbv: params.get('tbv') || 'all',
    type: params.get('type') || 'all',
    page: parseInt(params.get('page') || '1') || 1,
  };
}

export function applyFilters(items: OverdueItem[], filters: OverdueFilters) {
  let filtered = items;
  if (filters.tbv !== 'all') {
    filtered = filtered.filter(i => i.tbv === filters.tbv);
  }
  if (filters.type !== 'all') {
    filtered = filtered.filter(i => i.deliverable === filters.type);
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);
  return { filtered, pageItems, totalPages, page, totalFiltered: filtered.length };
}

export function buildInteractiveOverdueAlert(
  allItems: OverdueItem[],
  filters: OverdueFilters = { tbv: 'all', type: 'all', page: 1 },
) {
  const { pageItems, totalPages, page, totalFiltered } = applyFilters(allItems, filters);
  const uniqueVehicles = new Set(allItems.map(i => i.vehicleId)).size;
  const maxOverdue = allItems[0]?.daysOverdue || 0;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '\u26a0\ufe0f Daily Overdue Report', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${allItems.length}* overdue deliverables across *${uniqueVehicles}* vehicles (worst: *${maxOverdue}d* overdue)`,
      },
    },
    { type: 'divider' },
  ];

  // TBV filter buttons
  const tbvButtons = TBV_OPTIONS.map(opt => ({
    type: 'button' as const,
    text: { type: 'plain_text' as const, text: opt === 'all' ? 'All TBV' : opt, emoji: true },
    action_id: encodeAction(opt, filters.type, 1),
    ...(opt === filters.tbv ? { style: 'primary' as const } : {}),
  }));
  blocks.push({
    type: 'actions',
    elements: tbvButtons,
  });

  // Type filter buttons
  const typeButtons = TYPE_OPTIONS.map(opt => ({
    type: 'button' as const,
    text: { type: 'plain_text' as const, text: opt === 'all' ? 'All Types' : opt, emoji: true },
    action_id: encodeAction(filters.tbv, opt, 1),
    ...(opt === filters.type ? { style: 'primary' as const } : {}),
  }));
  blocks.push({
    type: 'actions',
    elements: typeButtons,
  });

  blocks.push({ type: 'divider' });

  // Filtered items list
  if (pageItems.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No overdue deliverables match the current filters._' },
    });
  } else {
    const lines = pageItems.map(item =>
      `\u2022 *${item.vehicleId}* \u2014 ${item.deliverable} \u00b7 ${item.daysOverdue}d overdue \u00b7 ${item.quarter}${item.tbv ? ` \u00b7 _${item.tbv}_` : ''}`
    );
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });
  }

  // Pagination row
  if (totalPages > 1) {
    const paginationElements: Record<string, unknown>[] = [];

    if (page > 1) {
      paginationElements.push({
        type: 'button',
        text: { type: 'plain_text', text: '\u2190 Prev', emoji: true },
        action_id: encodeAction(filters.tbv, filters.type, page - 1),
      });
    }

    // Page indicator as a static button (disabled look)
    paginationElements.push({
      type: 'button',
      text: { type: 'plain_text', text: `Page ${page}/${totalPages}`, emoji: true },
      action_id: encodeAction(filters.tbv, filters.type, page), // clicking re-renders same page
    });

    if (page < totalPages) {
      paginationElements.push({
        type: 'button',
        text: { type: 'plain_text', text: 'Next \u2192', emoji: true },
        action_id: encodeAction(filters.tbv, filters.type, page + 1),
      });
    }

    blocks.push({ type: 'actions', elements: paginationElements });
  }

  // Footer
  const filterDesc = [
    filters.tbv !== 'all' ? filters.tbv : null,
    filters.type !== 'all' ? filters.type : null,
  ].filter(Boolean).join(', ') || 'no filters';

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Showing ${totalFiltered} items (${filterDesc}) \u00b7 <https://final-dashboard-thetav1.vercel.app/fund-monitoring?tab=data-quality|View Dashboard>`,
    }],
  });

  return { blocks };
}

// ─── Weekly Digest ───────────────────────────────────────────────────────────

export function buildWeeklyDigest(stats: DigestStats) {
  const completePct = stats.totalVehicles > 0
    ? ((stats.totalVehicles - stats.outstandingCount) / stats.totalVehicles * 100).toFixed(0)
    : '0';

  const bar = buildProgressBar(parseInt(completePct));

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Weekly Monitoring Digest', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${bar}  *${completePct}%* complete\n*${stats.totalVehicles - stats.outstandingCount}*/${stats.totalVehicles} vehicles have all deliverables`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📁 Portfolio*\n${stats.portfolioMissing} missing` },
        { type: 'mrkdwn', text: `*📊 LP Letter*\n${stats.lpUpdateMissing} missing` },
        { type: 'mrkdwn', text: `*💰 Financials*\n${stats.financialsMissing} missing` },
        { type: 'mrkdwn', text: `*⚠️ Outstanding*\n${stats.outstandingCount} vehicles` },
      ],
    },
  ];

  if (stats.topOverdue.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*🔴 Most overdue this week:*' },
    });

    const lines = stats.topOverdue.slice(0, 5).map(item =>
      `• *${item.vehicleId}* — ${item.deliverable} · ${item.daysOverdue}d overdue · ${item.quarter}`
    );
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_View full details on the <https://final-dashboard-thetav1.vercel.app/fund-monitoring?tab=data-quality|Theta Dashboard>_' }],
  });

  return { blocks };
}

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

// ─── Received Confirmation ───────────────────────────────────────────────────

export function buildReceivedConfirmation(item: ReceivedItem) {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *${item.deliverable}* received for *${item.vehicleId}* (${item.quarter})`,
        },
      },
    ],
  };
}

// ─── Standardized Update ─────────────────────────────────────────────────────

export function buildStandardizedUpdate(item: ReceivedItem) {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🎯 *${item.vehicleId}* portfolio standardized — ready for analysis (${item.quarter})`,
        },
      },
    ],
  };
}
