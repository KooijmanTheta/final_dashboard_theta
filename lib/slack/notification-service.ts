import sql from '@/lib/db';
import { getMonitoringRecords, type MonitoringRecord } from '@/actions/overall-quality';
import { postToSlack } from './client';
import {
  buildOverdueAlert,
  buildReceivedConfirmation,
  buildStandardizedUpdate,
  buildWeeklyDigest,
} from './message-builder';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse "Q1 2025" → end-of-quarter Date */
function parseQuarterEnd(quarter: string): Date | null {
  const match = quarter.match(/Q(\d)\s*(\d{4})/i);
  if (!match) return null;
  const q = parseInt(match[1]);
  const year = parseInt(match[2]);
  const endMonthDay: Record<number, [number, number]> = {
    1: [2, 31], 2: [5, 30], 3: [8, 30], 4: [11, 31],
  };
  const md = endMonthDay[q];
  if (!md) return null;
  return new Date(year, md[0], md[1]);
}

/** Portfolio due = quarter end + 60 days */
function dueDate(quarter: string): Date | null {
  const qEnd = parseQuarterEnd(quarter);
  if (!qEnd) return null;
  const d = new Date(qEnd);
  d.setDate(d.getDate() + 60);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dedup key for overdue: same vehicle+quarter+deliverable within same week bucket */
function weekBucket(daysOverdue: number): number {
  return Math.floor(daysOverdue / 7);
}

async function logNotification(
  type: string,
  vehicleId: string | null,
  quarter: string | null,
  deliverable: string | null,
  daysOverdue: number | null,
  payload: Record<string, unknown>,
  httpStatus: number | null,
  errorMessage: string | null,
) {
  await sql`
    INSERT INTO tracking.slack_notifications
      (notification_type, vehicle_id, quarter, deliverable, days_overdue, message_payload, http_status, error_message)
    VALUES
      (${type}, ${vehicleId}, ${quarter}, ${deliverable}, ${daysOverdue}, ${JSON.stringify(payload)}, ${httpStatus}, ${errorMessage})
  `;
}

// ─── Overdue item detection ──────────────────────────────────────────────────

interface OverdueItem {
  vehicleId: string;
  quarter: string;
  deliverable: string;
  daysOverdue: number;
  dueDate: string;
  tbv: string;
}

function findOverdueItems(records: MonitoringRecord[]): OverdueItem[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const items: OverdueItem[] = [];

  // Get latest record per vehicle
  const latestByVehicle = new Map<string, MonitoringRecord>();
  for (const r of records) {
    if (!r.vehicleId) continue;
    const existing = latestByVehicle.get(r.vehicleId);
    if (!existing || r.dateMemo > existing.dateMemo) {
      latestByVehicle.set(r.vehicleId, r);
    }
  }

  for (const [, rec] of latestByVehicle) {
    const due = dueDate(rec.quarter);
    if (!due) continue;
    const days = daysBetween(due, now);
    if (days <= 0) continue; // not overdue yet

    const tbv = rec.tbvFunds[0] || 'Unassigned';

    if (!rec.hasAnyPortfolio && !rec.hasStandardizedPortfolio) {
      items.push({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'Portfolio',
        daysOverdue: days,
        dueDate: formatDate(due),
        tbv,
      });
    }

    if (!rec.hasLpUpdate) {
      items.push({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'LP Update',
        daysOverdue: days,
        dueDate: formatDate(due),
        tbv,
      });
    }

    if (!rec.hasFinancials) {
      items.push({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'Financials',
        daysOverdue: days,
        dueDate: formatDate(due),
        tbv,
      });
    }
  }

  items.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return items;
}

// ─── Dedup: skip if same vehicle+quarter+deliverable+week_bucket already sent ─

async function filterAlreadySent(items: OverdueItem[]): Promise<OverdueItem[]> {
  if (items.length === 0) return [];

  // Get recent overdue notifications from last 8 days
  const recent = await sql`
    SELECT vehicle_id, quarter, deliverable, days_overdue
    FROM tracking.slack_notifications
    WHERE notification_type = 'overdue'
      AND sent_at > NOW() - INTERVAL '8 days'
  `;

  const sentKeys = new Set<string>();
  for (const row of recent) {
    const bucket = weekBucket(row.days_overdue);
    sentKeys.add(`${row.vehicle_id}|${row.quarter}|${row.deliverable}|${bucket}`);
  }

  return items.filter(item => {
    const bucket = weekBucket(item.daysOverdue);
    const key = `${item.vehicleId}|${item.quarter}|${item.deliverable}|${bucket}`;
    return !sentKeys.has(key);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendOverdueAlerts(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const records = await getMonitoringRecords();
  const allOverdue = findOverdueItems(records);
  const toSend = await filterAlreadySent(allOverdue);
  const errors: string[] = [];

  if (toSend.length === 0) {
    return { sent: 0, skipped: allOverdue.length, errors: [] };
  }

  const payload = buildOverdueAlert(toSend);
  const result = await postToSlack(payload);

  // Log each item individually for granular dedup
  for (const item of toSend) {
    await logNotification(
      'overdue',
      item.vehicleId,
      item.quarter,
      item.deliverable,
      item.daysOverdue,
      payload,
      result.httpStatus ?? null,
      result.error ?? null,
    );
  }

  if (!result.ok) {
    errors.push(result.error || 'Unknown Slack error');
  }

  return { sent: toSend.length, skipped: allOverdue.length - toSend.length, errors };
}

export async function sendWeeklyDigest(): Promise<{ sent: boolean; error?: string }> {
  const records = await getMonitoringRecords();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Get latest record per vehicle
  const latestByVehicle = new Map<string, MonitoringRecord>();
  for (const r of records) {
    if (!r.vehicleId) continue;
    const existing = latestByVehicle.get(r.vehicleId);
    if (!existing || r.dateMemo > existing.dateMemo) {
      latestByVehicle.set(r.vehicleId, r);
    }
  }

  let portfolioMissing = 0;
  let lpUpdateMissing = 0;
  let financialsMissing = 0;
  const vehiclesWithOutstanding = new Set<string>();

  for (const [vehicleId, rec] of latestByVehicle) {
    let hasMissing = false;
    if (!rec.hasAnyPortfolio && !rec.hasStandardizedPortfolio) {
      portfolioMissing++;
      hasMissing = true;
    }
    if (!rec.hasLpUpdate) {
      lpUpdateMissing++;
      hasMissing = true;
    }
    if (!rec.hasFinancials) {
      financialsMissing++;
      hasMissing = true;
    }
    if (hasMissing) vehiclesWithOutstanding.add(vehicleId);
  }

  const allOverdue = findOverdueItems(records);

  const payload = buildWeeklyDigest({
    totalVehicles: latestByVehicle.size,
    outstandingCount: vehiclesWithOutstanding.size,
    portfolioMissing,
    lpUpdateMissing,
    financialsMissing,
    topOverdue: allOverdue.slice(0, 5),
  });

  const result = await postToSlack(payload);

  await logNotification(
    'digest',
    null,
    null,
    null,
    null,
    payload,
    result.httpStatus ?? null,
    result.error ?? null,
  );

  return { sent: result.ok, error: result.error };
}

export async function detectAndNotifyChanges(): Promise<{ received: number; standardized: number; errors: string[] }> {
  const records = await getMonitoringRecords();
  const errors: string[] = [];
  let receivedCount = 0;
  let standardizedCount = 0;

  // Get latest record per vehicle
  const latestByVehicle = new Map<string, MonitoringRecord>();
  for (const r of records) {
    if (!r.vehicleId || !r.quarter) continue;
    const key = `${r.vehicleId}|${r.quarter}`;
    const existing = latestByVehicle.get(key);
    if (!existing || r.dateMemo > existing.dateMemo) {
      latestByVehicle.set(key, r);
    }
  }

  // Get current snapshots
  const snapshots = await sql`SELECT * FROM tracking.monitoring_snapshot`;
  const snapshotMap = new Map<string, { has_portfolio: boolean; has_standardized: boolean; has_financials: boolean; has_lp_update: boolean }>();
  for (const s of snapshots) {
    snapshotMap.set(`${s.vehicle_id}|${s.quarter}`, s as { has_portfolio: boolean; has_standardized: boolean; has_financials: boolean; has_lp_update: boolean });
  }

  for (const [key, rec] of latestByVehicle) {
    const prev = snapshotMap.get(key);
    const prevPortfolio = prev?.has_portfolio ?? false;
    const prevStandardized = prev?.has_standardized ?? false;
    const prevFinancials = prev?.has_financials ?? false;
    const prevLpUpdate = prev?.has_lp_update ?? false;

    // Detect portfolio received
    if (rec.hasAnyPortfolio && !prevPortfolio) {
      const payload = buildReceivedConfirmation({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'Portfolio',
      });
      const result = await postToSlack(payload);
      await logNotification('received', rec.vehicleId, rec.quarter, 'Portfolio', null, payload, result.httpStatus ?? null, result.error ?? null);
      if (!result.ok) errors.push(`Portfolio received for ${rec.vehicleId}: ${result.error}`);
      receivedCount++;
    }

    // Detect standardized
    if (rec.hasStandardizedPortfolio && !prevStandardized) {
      const payload = buildStandardizedUpdate({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'Portfolio',
      });
      const result = await postToSlack(payload);
      await logNotification('standardized', rec.vehicleId, rec.quarter, 'Portfolio', null, payload, result.httpStatus ?? null, result.error ?? null);
      if (!result.ok) errors.push(`Standardized for ${rec.vehicleId}: ${result.error}`);
      standardizedCount++;
    }

    // Detect financials received
    if (rec.hasFinancials && !prevFinancials) {
      const payload = buildReceivedConfirmation({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'Financials',
      });
      const result = await postToSlack(payload);
      await logNotification('received', rec.vehicleId, rec.quarter, 'Financials', null, payload, result.httpStatus ?? null, result.error ?? null);
      if (!result.ok) errors.push(`Financials received for ${rec.vehicleId}: ${result.error}`);
      receivedCount++;
    }

    // Detect LP Update received
    if (rec.hasLpUpdate && !prevLpUpdate) {
      const payload = buildReceivedConfirmation({
        vehicleId: rec.vehicleId,
        quarter: rec.quarter,
        deliverable: 'LP Update',
      });
      const result = await postToSlack(payload);
      await logNotification('received', rec.vehicleId, rec.quarter, 'LP Update', null, payload, result.httpStatus ?? null, result.error ?? null);
      if (!result.ok) errors.push(`LP Update received for ${rec.vehicleId}: ${result.error}`);
      receivedCount++;
    }

    // Upsert snapshot
    await sql`
      INSERT INTO tracking.monitoring_snapshot (vehicle_id, quarter, has_portfolio, has_standardized, has_financials, has_lp_update, snapshot_at)
      VALUES (${rec.vehicleId}, ${rec.quarter}, ${rec.hasAnyPortfolio}, ${rec.hasStandardizedPortfolio}, ${rec.hasFinancials}, ${rec.hasLpUpdate}, NOW())
      ON CONFLICT (vehicle_id, quarter)
      DO UPDATE SET
        has_portfolio = ${rec.hasAnyPortfolio},
        has_standardized = ${rec.hasStandardizedPortfolio},
        has_financials = ${rec.hasFinancials},
        has_lp_update = ${rec.hasLpUpdate},
        snapshot_at = NOW()
    `;
  }

  return { received: receivedCount, standardized: standardizedCount, errors };
}

// ─── Query for UI ────────────────────────────────────────────────────────────

export async function getNotificationsForVehicle(vehicleId: string, limit = 20) {
  return sql`
    SELECT notification_type, deliverable, quarter, days_overdue, sent_at, http_status, error_message
    FROM tracking.slack_notifications
    WHERE vehicle_id = ${vehicleId}
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
}

export async function getRecentNotifications(limit = 20) {
  return sql`
    SELECT notification_type, vehicle_id, deliverable, quarter, days_overdue, sent_at
    FROM tracking.slack_notifications
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
}
