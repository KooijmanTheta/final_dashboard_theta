'use server';

import sql from '@/lib/db';

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
