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
    // Table may not exist yet if migration hasn't been run
    return [];
  }
}
