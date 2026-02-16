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
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `⚠️ ${items.length} Overdue Deliverable${items.length !== 1 ? 's' : ''}`, emoji: true },
    },
    { type: 'divider' },
  ];

  for (const item of items.slice(0, 10)) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Vehicle:*\n${item.vehicleId}` },
        { type: 'mrkdwn', text: `*Quarter:*\n${item.quarter}` },
        { type: 'mrkdwn', text: `*Deliverable:*\n${item.deliverable}` },
        { type: 'mrkdwn', text: `*Days Overdue:*\n${item.daysOverdue}d` },
        { type: 'mrkdwn', text: `*Due Date:*\n${item.dueDate}` },
        { type: 'mrkdwn', text: `*TBV:*\n${item.tbv || 'Unassigned'}` },
      ],
    });
    blocks.push({ type: 'divider' });
  }

  if (items.length > 10) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_...and ${items.length - 10} more overdue items_` }],
    });
  }

  return { blocks };
}

// ─── Weekly Digest ───────────────────────────────────────────────────────────

export function buildWeeklyDigest(stats: DigestStats) {
  const pct = stats.totalVehicles > 0
    ? ((stats.totalVehicles - stats.outstandingCount) / stats.totalVehicles * 100).toFixed(0)
    : '0';

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Weekly Monitoring Digest', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${stats.outstandingCount}/${stats.totalVehicles}* vehicles have outstanding deliverables (${pct}% complete)`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Portfolio missing:*\n${stats.portfolioMissing}` },
        { type: 'mrkdwn', text: `*LP Update missing:*\n${stats.lpUpdateMissing}` },
        { type: 'mrkdwn', text: `*Financials missing:*\n${stats.financialsMissing}` },
      ],
    },
  ];

  if (stats.topOverdue.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Top overdue:*' },
    });

    for (const item of stats.topOverdue.slice(0, 5)) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `🔴 *${item.vehicleId}* — ${item.deliverable} (${item.daysOverdue}d overdue, ${item.quarter})`,
        }],
      });
    }
  }

  return { blocks };
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
