'use server';

import sql from '@/lib/db';
import { postBotMessage } from '@/lib/slack/client';

export interface SlackNotificationRow {
  notification_type: string;
  vehicle_id: string | null;
  deliverable: string | null;
  quarter: string | null;
  days_overdue: number | null;
  sent_at: string;
}

export async function getNotificationsForVehicle(vehicleId: string, limit = 20): Promise<SlackNotificationRow[]> {
  try {
    const rows = await sql`
      SELECT notification_type, vehicle_id, deliverable, quarter, days_overdue, sent_at
      FROM tracking.slack_notifications
      WHERE vehicle_id = ${vehicleId} OR vehicle_id IS NULL
      ORDER BY sent_at DESC
      LIMIT ${limit}
    `;
    return rows as unknown as SlackNotificationRow[];
  } catch {
    return [];
  }
}

// Recent received/standardized changes (last 7 days) for the Alerts Panel
export interface RecentChangeRow {
  vehicle_id: string;
  deliverable: string;
  quarter: string;
  notification_type: string;
  sent_at: string;
}

export async function getRecentChanges(): Promise<RecentChangeRow[]> {
  try {
    const rows = await sql`
      SELECT vehicle_id, deliverable, quarter, notification_type, sent_at
      FROM tracking.slack_notifications
      WHERE notification_type IN ('received', 'standardized')
        AND sent_at > NOW() - INTERVAL '7 days'
        AND vehicle_id IS NOT NULL
      ORDER BY sent_at DESC
    `;
    return rows as unknown as RecentChangeRow[];
  } catch {
    return [];
  }
}

// Dismissed overdue items
export interface DismissedRow {
  vehicle_id: string;
  quarter: string;
  deliverable: string;
}

export async function getDismissedOverdue(): Promise<DismissedRow[]> {
  try {
    const rows = await sql`
      SELECT vehicle_id, quarter, deliverable
      FROM tracking.dismissed_overdue
    `;
    return rows as unknown as DismissedRow[];
  } catch {
    return [];
  }
}

export async function dismissOverdueItem(vehicleId: string, quarter: string, deliverable: string): Promise<void> {
  await sql`
    INSERT INTO tracking.dismissed_overdue (vehicle_id, quarter, deliverable)
    VALUES (${vehicleId}, ${quarter}, ${deliverable})
    ON CONFLICT (vehicle_id, quarter, deliverable) DO NOTHING
  `;
}

export async function undismissOverdueItem(vehicleId: string, quarter: string, deliverable: string): Promise<void> {
  await sql`
    DELETE FROM tracking.dismissed_overdue
    WHERE vehicle_id = ${vehicleId} AND quarter = ${quarter} AND deliverable = ${deliverable}
  `;
}

// ─── Push vehicle notification to Slack ───────────────────────────────────────

export interface PushResult {
  ok: boolean;
  error?: string;
}

export async function pushVehicleNotification(
  vehicleId: string,
  missingItems: { deliverable: string; quarter: string; daysOverdue: number }[],
  tbv: string,
): Promise<PushResult> {
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId) {
    return { ok: false, error: 'SLACK_CHANNEL_ID not configured' };
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Follow-up: ${vehicleId}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${missingItems.length}* outstanding deliverable${missingItems.length !== 1 ? 's' : ''} for *${vehicleId}*${tbv ? ` (_${tbv}_)` : ''}`,
      },
    },
    { type: 'divider' },
  ];

  const lines = missingItems.map(item =>
    `• *${item.deliverable}* — ${item.quarter} · ${item.daysOverdue}d overdue`
  );
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n') },
  });

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Pushed from <https://final-dashboard-thetav1.vercel.app/fund-monitoring?tab=data-quality|Theta Dashboard>`,
    }],
  });

  const result = await postBotMessage(channelId, blocks, `Follow-up: ${vehicleId}`);

  // Log the push notification
  try {
    await sql`
      INSERT INTO tracking.slack_notifications
        (notification_type, vehicle_id, quarter, deliverable, days_overdue, message_payload, http_status, error_message)
      VALUES
        ('push', ${vehicleId}, ${missingItems[0]?.quarter || null}, ${null}, ${null}, ${JSON.stringify({ blocks })}, ${result.httpStatus ?? null}, ${result.error ?? null})
    `;
  } catch {
    // non-critical — don't fail the push if logging fails
  }

  return { ok: result.ok, error: result.error };
}
