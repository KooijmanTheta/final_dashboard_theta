// Slack Block Kit message templates for each notification type

interface OverdueItem {
  vehicleId: string;
  quarter: string;
  deliverable: string;
  daysOverdue: number;
  dueDate: string;
  tbv: string;
}

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
  const lpOverdue = items.filter(i => i.deliverable === 'LP Update');
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
        { type: 'mrkdwn', text: `*📊 LP Update*\n${lpOverdue.length} overdue` },
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
        { type: 'mrkdwn', text: `*📊 LP Update*\n${stats.lpUpdateMissing} missing` },
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
