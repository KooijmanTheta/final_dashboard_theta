'use client';

import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, X, FileText, BarChart3, DollarSign, AlertTriangle, CheckCircle2, Clock, MessageSquare, Hash, Bell, BellOff, XCircle } from 'lucide-react';
import { getMonitoringRecords, type MonitoringRecord } from '@/actions/overall-quality';
import { getNotificationsForVehicle, type SlackNotificationRow, getRecentChanges, type RecentChangeRow, getDismissedOverdue, type DismissedRow, dismissOverdueItem } from '@/actions/slack-notifications';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type CellStatus = 'Done' | "Recv'd" | 'LATE' | 'Expected' | 'N/A' | '-';

const CYCLE_COLUMNS = ['Portfolio', 'LP Letter', 'Financials'] as const;

interface CellFraction {
  missing: number;
  total: number;
  missingQuarters: string[]; // quarters that are missing the deliverable (for tooltip)
}

interface VehicleCycleRow {
  vehicleId: string;
  portfolio: CellFraction;
  lpLetter: CellFraction;
  financials: CellFraction;
}

interface TbvCycleGroup {
  tbv: string;
  vehicles: VehicleCycleRow[];
  portfolioCount: number;
  totalVehicles: number;
  pct: number;
}

interface DeliverableRow {
  deliverable: string;
  expected: string;
  received: string;
  status: CellStatus;
  pipeline: string;
  days: number | null;
}

// ============================================================================
// Status helpers
// ============================================================================

function statusBadgeClass(status: CellStatus): string {
  switch (status) {
    case 'Done': return 'bg-emerald-100 text-emerald-800';
    case "Recv'd": return 'bg-blue-100 text-blue-800';
    case 'LATE': return 'bg-red-100 text-red-800';
    case 'Expected': return 'bg-amber-100 text-amber-800';
    case 'N/A': return 'bg-gray-100 text-gray-400';
    default: return 'bg-gray-50 text-gray-400';
  }
}

// ============================================================================
// Quarter / due-date helpers
// ============================================================================

/** Parse "Q1 2025" → end-of-quarter Date, or null if unparseable */
function parseQuarterEnd(quarter: string): Date | null {
  const match = quarter.match(/Q(\d)\s*(\d{4})/i);
  if (!match) return null;
  const q = parseInt(match[1]);
  const year = parseInt(match[2]);
  // Q1 → Mar 31, Q2 → Jun 30, Q3 → Sep 30, Q4 → Dec 31
  const endMonthDay: Record<number, [number, number]> = {
    1: [2, 31],  // month index 2 = March
    2: [5, 30],
    3: [8, 30],
    4: [11, 31],
  };
  const md = endMonthDay[q];
  if (!md) return null;
  return new Date(year, md[0], md[1]);
}

/** Portfolio due = quarter end + 60 days */
function portfolioDueDate(quarter: string): Date | null {
  const qEnd = parseQuarterEnd(quarter);
  if (!qEnd) return null;
  const due = new Date(qEnd);
  due.setDate(due.getDate() + 60);
  return due;
}

function daysLeft(dueDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = dueDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get the last N completed quarters from today (e.g. if today is Feb 2026, last 3 = Q1 2025, Q2 2025, Q3 2025) */
function getLastNQuarters(n: number): string[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-based
  const currentYear = now.getFullYear();
  // Current quarter (1-based): Jan-Mar=1, Apr-Jun=2, Jul-Sep=3, Oct-Dec=4
  const currentQ = Math.floor(currentMonth / 3) + 1;

  const quarters: string[] = [];
  let q = currentQ;
  let y = currentYear;

  // Go back from current quarter (current quarter is incomplete, start from previous)
  for (let i = 0; i < n; i++) {
    q--;
    if (q === 0) { q = 4; y--; }
    quarters.push(`Q${q} ${y}`);
  }

  return quarters.reverse(); // oldest first
}

interface DueDeliverable {
  dueDate: string;
  deliverable: string;
  daysLeft: number;
  isOverdue: boolean;
}

// ============================================================================
// Derive cell status from monitoring record
// ============================================================================

function deriveRow(vehicleId: string, allRecords: MonitoringRecord[]): VehicleCycleRow {
  // Expected quarters = last 3 completed quarters based on today
  const expectedQuarters = getLastNQuarters(3);
  // Also include any quarters from records that aren't in the expected set
  const recordQuarters = [...new Set(allRecords.map(r => r.quarter).filter(Boolean))];
  const allQuarters = [...new Set([...expectedQuarters, ...recordQuarters])].sort();
  const totalQuarters = allQuarters.length || 1;

  // For each deliverable, find which quarters have it
  const portfolioHas = new Set(allRecords.filter(r => r.hasAnyPortfolio || r.hasStandardizedPortfolio).map(r => r.quarter));
  const lpHas = new Set(allRecords.filter(r => r.hasLpUpdate).map(r => r.quarter));
  const finHas = new Set(allRecords.filter(r => r.hasFinancials).map(r => r.quarter));

  // Missing = all expected quarters minus the ones that have it
  const portfolioMissing = allQuarters.filter(q => !portfolioHas.has(q));
  const lpMissing = allQuarters.filter(q => !lpHas.has(q));
  const finMissing = allQuarters.filter(q => !finHas.has(q));

  return {
    vehicleId,
    portfolio: { missing: portfolioMissing.length, total: totalQuarters, missingQuarters: portfolioMissing },
    lpLetter: { missing: lpMissing.length, total: totalQuarters, missingQuarters: lpMissing },
    financials: { missing: finMissing.length, total: totalQuarters, missingQuarters: finMissing },
  };
}

function deriveDeliverables(rec: MonitoringRecord): DeliverableRow[] {
  const dateMemo = rec.dateMemo || '-';
  const portfolioDue = portfolioDueDate(rec.quarter);
  const portfolioExpected = portfolioDue ? formatDate(portfolioDue) : dateMemo;
  const portfolioDaysLeft = portfolioDue ? daysLeft(portfolioDue) : null;

  // Portfolio / SOI
  let portfolioStatus: CellStatus = '-';
  let portfolioReceived = '-';
  if (rec.hasStandardizedPortfolio) {
    portfolioStatus = 'Done';
    portfolioReceived = dateMemo;
  } else if (rec.hasAnyPortfolio) {
    portfolioStatus = "Recv'd";
    portfolioReceived = dateMemo;
  } else if (portfolioDue) {
    portfolioStatus = portfolioDaysLeft !== null && portfolioDaysLeft < 0 ? 'LATE' : 'Expected';
  }

  // LP Letter
  let lpStatus: CellStatus = '-';
  let lpReceived = '-';
  if (rec.hasLpUpdate) {
    lpStatus = "Recv'd";
    lpReceived = dateMemo;
  }

  // Financials
  let finStatus: CellStatus = '-';
  let finReceived = '-';
  if (rec.hasFinancials) {
    finStatus = "Recv'd";
    finReceived = dateMemo;
  }

  return [
    {
      deliverable: 'Portfolio / SOI',
      expected: portfolioExpected,
      received: portfolioReceived,
      status: portfolioStatus,
      pipeline: rec.hasStandardizedPortfolio ? 'Standardized' : rec.hasAnyPortfolio ? 'Raw received' : '-',
      days: portfolioStatus === 'Done' || portfolioStatus === "Recv'd" ? null : portfolioDaysLeft,
    },
    {
      deliverable: 'LP Letter',
      expected: dateMemo,
      received: lpReceived,
      status: lpStatus,
      pipeline: rec.hasLpUpdate ? 'Linked' : '-',
      days: null,
    },
    {
      deliverable: 'Financials',
      expected: dateMemo,
      received: finReceived,
      status: finStatus,
      pipeline: rec.hasFinancials ? 'Attached' : '-',
      days: null,
    },
  ];
}

/** Get missing deliverables for a vehicle across all its records */
function getMissingDeliverables(vehicleId: string, vehicleRecords: MonitoringRecord[]): DueDeliverable[] {
  const missing: DueDeliverable[] = [];

  for (const rec of vehicleRecords) {
    // Portfolio: due 60 days after quarter end
    if (!rec.hasAnyPortfolio && !rec.hasStandardizedPortfolio) {
      const due = portfolioDueDate(rec.quarter);
      if (due) {
        const days = daysLeft(due);
        missing.push({
          dueDate: formatDate(due),
          deliverable: 'Portfolio',
          daysLeft: days,
          isOverdue: days < 0,
        });
      }
    }

    // LP Letter: missing if no linked records
    if (!rec.hasLpUpdate) {
      const due = portfolioDueDate(rec.quarter); // same timeline for now
      if (due) {
        const days = daysLeft(due);
        missing.push({
          dueDate: formatDate(due),
          deliverable: 'LP Letter',
          daysLeft: days,
          isOverdue: days < 0,
        });
      }
    }

    // Financials: missing if no attachment
    if (!rec.hasFinancials) {
      const due = portfolioDueDate(rec.quarter);
      if (due) {
        const days = daysLeft(due);
        missing.push({
          dueDate: formatDate(due),
          deliverable: 'Financials',
          daysLeft: days,
          isOverdue: days < 0,
        });
      }
    }
  }

  // Sort by due date ascending
  missing.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return missing;
}

function getFractionForColumn(row: VehicleCycleRow, col: typeof CYCLE_COLUMNS[number]): CellFraction {
  switch (col) {
    case 'Portfolio': return row.portfolio;
    case 'LP Letter': return row.lpLetter;
    case 'Financials': return row.financials;
  }
}

// ============================================================================
// Vehicle Detail Modal
// ============================================================================

function deliverableIcon(name: string) {
  switch (name) {
    case 'Portfolio / SOI': return <FileText className="h-4 w-4" />;
    case 'LP Letter': return <BarChart3 className="h-4 w-4" />;
    case 'Financials': return <DollarSign className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

function statusIcon(status: CellStatus) {
  switch (status) {
    case 'Done': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "Recv'd": return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
    case 'LATE': return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'Expected': return <Clock className="h-4 w-4 text-amber-500" />;
    default: return <div className="h-4 w-4 rounded-full bg-gray-200" />;
  }
}

function VehicleDetailModal({
  vehicleId,
  records,
  onClose,
}: {
  vehicleId: string;
  records: MonitoringRecord[];
  onClose: () => void;
}) {
  const vehicleRecords = useMemo(() => {
    return records
      .filter(r => r.vehicleId === vehicleId)
      .sort((a, b) => b.dateMemo.localeCompare(a.dateMemo));
  }, [records, vehicleId]);

  const availableDates = useMemo(() => {
    return vehicleRecords.map(r => r.dateMemo).filter(Boolean);
  }, [vehicleRecords]);

  const [selectedDate, setSelectedDate] = useState(availableDates[0] || '');

  const selectedRecord = useMemo(() => {
    return vehicleRecords.find(r => r.dateMemo === selectedDate);
  }, [vehicleRecords, selectedDate]);

  const deliverables = useMemo(() => {
    if (!selectedRecord) return [];
    return deriveDeliverables(selectedRecord);
  }, [selectedRecord]);

  const missingDeliverables = useMemo(() => {
    return getMissingDeliverables(vehicleId, vehicleRecords);
  }, [vehicleId, vehicleRecords]);

  const completedCount = deliverables.filter(d => d.status === 'Done' || d.status === "Recv'd").length;
  const overdueCount = missingDeliverables.filter(d => d.isOverdue).length;
  const upcomingCount = missingDeliverables.filter(d => !d.isOverdue).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#F9FAFB] rounded-xl shadow-2xl w-full max-w-[1200px] h-[calc(100vh-80px)] flex flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <div className="bg-white px-6 py-4 border-b border-[#E5E7EB] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[#111827]">{vehicleId}</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {selectedRecord?.quarter || '-'} &middot; {vehicleRecords.length} record{vehicleRecords.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle2 className="h-3 w-3" /> {completedCount} received
              </span>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                  <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
                </span>
              )}
              {upcomingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                  <Clock className="h-3 w-3" /> {upcomingCount} pending
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-[#374151] bg-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]"
            >
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Action item banner ── */}
        {selectedRecord?.portfolioActionItem && (
          <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">{selectedRecord.portfolioActionItem}</p>
          </div>
        )}

        {/* ── Dashboard body — two columns ── */}
        <div className="flex-1 flex gap-5 p-6 min-h-0">

          {/* Left column: Deliverables + Activity log */}
          <div className="flex-1 flex flex-col min-w-0 gap-5">

            {/* Deliverable cards — compact row */}
            <div className="shrink-0">
              <h4 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2.5">
                Deliverables for {selectedDate || '-'}
              </h4>

              {selectedRecord ? (
                <div className="grid grid-cols-3 gap-3">
                  {deliverables.map(row => {
                    const iconBg =
                      row.status === 'Done' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      row.status === "Recv'd" ? 'bg-blue-50 text-blue-600 border-blue-200' :
                      row.status === 'LATE' ? 'bg-red-50 text-red-500 border-red-200' :
                      row.status === 'Expected' ? 'bg-amber-50 text-amber-500 border-amber-200' :
                      'bg-gray-50 text-gray-400 border-gray-200';

                    return (
                      <div
                        key={row.deliverable}
                        className="bg-white rounded-lg border border-[#E5E7EB] px-4 py-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center gap-3 mb-2.5">
                          <div className={cn('w-8 h-8 rounded-md border flex items-center justify-center shrink-0', iconBg)}>
                            {deliverableIcon(row.deliverable)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#111827] truncate">{row.deliverable}</p>
                            <p className="text-[11px] text-[#9CA3AF]">
                              {row.pipeline !== '-' ? row.pipeline : 'Not received'}
                            </p>
                          </div>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0', statusBadgeClass(row.status))}>
                            {statusIcon(row.status)}
                            {row.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px]">
                          <div>
                            <span className="text-[#9CA3AF]">Exp </span>
                            <span className="font-medium text-[#374151]">{row.expected}</span>
                          </div>
                          <div>
                            <span className="text-[#9CA3AF]">Rcv </span>
                            <span className="font-medium text-[#374151]">{row.received}</span>
                          </div>
                          {row.days !== null && (
                            <span className={cn('font-semibold ml-auto', row.days < 0 ? 'text-red-600' : 'text-amber-600')}>
                              {row.days < 0 ? `${Math.abs(row.days)}d overdue` : `${row.days}d left`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 text-center text-sm text-[#6B7280]">
                  No monitoring record found for this date.
                </div>
              )}
            </div>

            {/* Activity / Slack log */}
            <CommunicationsLog vehicleId={vehicleId} />
          </div>

          {/* Right column: Missing deliverables */}
          <div className="w-[320px] shrink-0 flex flex-col min-h-0">
            <h4 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2.5">
              Missing &middot; All Periods
            </h4>

            {missingDeliverables.length > 0 ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] flex-1 overflow-y-auto divide-y divide-[#F3F4F6]">
                {missingDeliverables.map((item, idx) => (
                  <div
                    key={`${item.deliverable}-${item.dueDate}-${idx}`}
                    className="px-4 py-2.5 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          item.isOverdue ? 'bg-red-500' : 'bg-amber-400'
                        )} />
                        <span className="text-sm font-medium text-[#111827]">{item.deliverable}</span>
                      </div>
                      <span className={cn(
                        'text-xs font-semibold tabular-nums',
                        item.isOverdue ? 'text-red-600' : 'text-amber-600'
                      )}>
                        {item.isOverdue ? `${Math.abs(item.daysLeft)}d overdue` : `${item.daysLeft}d`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-[#9CA3AF]">Due {item.dueDate}</span>
                      <div className="flex items-center gap-1">
                        <button className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
                          Snooze
                        </button>
                        <button className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors">
                          Received
                        </button>
                        <button className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
                          Push
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[#E5E7EB] flex-1 flex items-center justify-center">
                <div className="text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#374151]">All caught up</p>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">No missing deliverables</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Communications Log — real Slack notification history
// ============================================================================

function notifTypeLabel(type: string): string {
  switch (type) {
    case 'overdue': return 'Overdue';
    case 'received': return 'Received';
    case 'standardized': return 'Standardized';
    case 'digest': return 'Digest';
    default: return type;
  }
}

function notifTypeStyle(type: string): string {
  switch (type) {
    case 'overdue': return 'bg-red-50 text-red-600';
    case 'received': return 'bg-emerald-50 text-emerald-600';
    case 'standardized': return 'bg-blue-50 text-blue-600';
    case 'digest': return 'bg-gray-100 text-[#6B7280]';
    default: return 'bg-gray-100 text-[#6B7280]';
  }
}

function notifIconStyle(type: string): string {
  switch (type) {
    case 'overdue': return 'bg-red-50 text-red-500';
    case 'received': return 'bg-emerald-50 text-emerald-500';
    case 'standardized': return 'bg-blue-50 text-blue-500';
    default: return 'bg-[#F3F4F6] text-[#9CA3AF]';
  }
}

function notifMessage(n: SlackNotificationRow): string {
  switch (n.notification_type) {
    case 'overdue':
      return `${n.deliverable || 'Deliverable'} ${n.days_overdue}d overdue`;
    case 'received':
      return `${n.deliverable || 'Deliverable'} received`;
    case 'standardized':
      return `${n.deliverable || 'Portfolio'} standardized — ready for analysis`;
    case 'digest':
      return 'Weekly monitoring digest sent';
    default:
      return n.notification_type;
  }
}

function CommunicationsLog({ vehicleId }: { vehicleId: string }) {
  const { data: notifications = [], isLoading: notifLoading } = useQuery({
    queryKey: ['slackNotifications', vehicleId],
    queryFn: () => getNotificationsForVehicle(vehicleId),
    staleTime: 60 * 1000,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <h4 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <Hash className="h-3 w-3" />
        Communications Log
      </h4>

      <div className="bg-white rounded-lg border border-[#E5E7EB] flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto divide-y divide-[#F3F4F6]">
          {notifLoading ? (
            <div className="px-4 py-6 text-center text-xs text-[#9CA3AF]">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#9CA3AF]">No Slack notifications yet for this vehicle.</div>
          ) : (
            notifications.map((entry, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-start gap-3 hover:bg-[#F9FAFB] transition-colors">
                <div className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                  notifIconStyle(entry.notification_type),
                )}>
                  <MessageSquare className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                      notifTypeStyle(entry.notification_type),
                    )}>
                      {notifTypeLabel(entry.notification_type)}
                    </span>
                    {entry.vehicle_id && (
                      <span className="text-xs font-medium text-[#374151]">{entry.vehicle_id}</span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">{notifMessage(entry)}</p>
                </div>
                <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap shrink-0">
                  {new Date(entry.sent_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F9FAFB] shrink-0">
          <p className="text-[11px] text-[#9CA3AF] text-center">
            Slack alerts: daily overdue, weekly digest, real-time received &amp; standardized
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Alerts Panel — overdue from live data, received/standardized from last 7 days
// ============================================================================

interface AlertItem {
  type: 'overdue' | 'received' | 'standardized';
  vehicleId: string;
  quarter: string;
  deliverable: string;
  detail: string;
  daysOverdue?: number;
  tbv: string;
}

function computeOverdueAlerts(records: MonitoringRecord[], dismissed: Set<string>): AlertItem[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const items: AlertItem[] = [];

  // Last 3 completed quarters based on today's date
  const expectedQuarters = getLastNQuarters(3);

  // Get all unique vehicle IDs and their TBV
  const vehicleTbv = new Map<string, string>();
  for (const r of records) {
    if (r.vehicleId && r.tbvFunds[0] && !vehicleTbv.has(r.vehicleId)) {
      vehicleTbv.set(r.vehicleId, r.tbvFunds[0]);
    }
  }

  // Group records by vehicle+quarter, pick latest dateMemo per combo
  const byVehicleQuarter = new Map<string, MonitoringRecord>();
  for (const r of records) {
    if (!r.vehicleId || !r.quarter) continue;
    const key = `${r.vehicleId}|${r.quarter}`;
    const existing = byVehicleQuarter.get(key);
    if (!existing || r.dateMemo > existing.dateMemo) {
      byVehicleQuarter.set(key, r);
    }
  }

  // For each vehicle × expected quarter, check for missing deliverables
  for (const vehicleId of vehicleTbv.keys()) {
    const tbv = vehicleTbv.get(vehicleId) || '';

    for (const quarter of expectedQuarters) {
      const due = portfolioDueDate(quarter);
      if (!due) continue;
      const days = daysLeft(due);
      if (days >= 0) continue; // not overdue yet
      const daysOver = Math.abs(days);

      const rec = byVehicleQuarter.get(`${vehicleId}|${quarter}`);

      // If no record exists at all for this quarter, all 3 are missing
      const hasPortfolio = rec ? (rec.hasAnyPortfolio || rec.hasStandardizedPortfolio) : false;
      const hasLp = rec ? rec.hasLpUpdate : false;
      const hasFin = rec ? rec.hasFinancials : false;

      if (!hasPortfolio) {
        const key = `${vehicleId}|${quarter}|Portfolio`;
        if (!dismissed.has(key)) {
          items.push({ type: 'overdue', vehicleId, quarter, deliverable: 'Portfolio', detail: `${daysOver}d overdue — due ${formatDate(due)}${!rec ? ' (no record)' : ''}`, daysOverdue: daysOver, tbv });
        }
      }
      if (!hasLp) {
        const key = `${vehicleId}|${quarter}|LP Letter`;
        if (!dismissed.has(key)) {
          items.push({ type: 'overdue', vehicleId, quarter, deliverable: 'LP Letter', detail: `${daysOver}d overdue — due ${formatDate(due)}${!rec ? ' (no record)' : ''}`, daysOverdue: daysOver, tbv });
        }
      }
      if (!hasFin) {
        const key = `${vehicleId}|${quarter}|Financials`;
        if (!dismissed.has(key)) {
          items.push({ type: 'overdue', vehicleId, quarter, deliverable: 'Financials', detail: `${daysOver}d overdue — due ${formatDate(due)}${!rec ? ' (no record)' : ''}`, daysOverdue: daysOver, tbv });
        }
      }
    }
  }

  items.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
  return items;
}

function recentChangesToAlerts(changes: RecentChangeRow[]): AlertItem[] {
  return changes.map(c => ({
    type: c.notification_type as 'received' | 'standardized',
    vehicleId: c.vehicle_id,
    quarter: c.quarter,
    deliverable: c.deliverable,
    detail: c.notification_type === 'standardized'
      ? `Standardized — ready for analysis`
      : `${c.deliverable} received`,
    tbv: '',
  }));
}

function alertTypeIcon(type: AlertItem['type']) {
  switch (type) {
    case 'overdue': return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    case 'received': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'standardized': return <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />;
  }
}

function alertTypeBadge(type: AlertItem['type']): string {
  switch (type) {
    case 'overdue': return 'bg-red-50 text-red-700 border-red-100';
    case 'received': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'standardized': return 'bg-blue-50 text-blue-700 border-blue-100';
  }
}

type AlertFilter = 'all' | 'overdue' | 'received' | 'standardized';
type DeliverableFilter = 'all' | 'Portfolio' | 'LP Letter' | 'Financials';
type QuarterFilter = 'all' | string;

function AlertsPanel({ records, onVehicleClick }: { records: MonitoringRecord[]; onVehicleClick: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<AlertFilter>('all');
  const [deliverableFilter, setDeliverableFilter] = useState<DeliverableFilter>('all');
  const [quarterFilter, setQuarterFilter] = useState<QuarterFilter>('all');
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [expandedTbvs, setExpandedTbvs] = useState<Set<string>>(new Set());

  const { data: recentChanges = [] } = useQuery({
    queryKey: ['recentChanges'],
    queryFn: () => getRecentChanges(),
    staleTime: 60 * 1000,
  });

  const { data: dismissedRows = [] } = useQuery({
    queryKey: ['dismissedOverdue'],
    queryFn: () => getDismissedOverdue(),
    staleTime: 60 * 1000,
  });

  const dismissedSet = useMemo(() => {
    return new Set(dismissedRows.map(d => `${d.vehicle_id}|${d.quarter}|${d.deliverable}`));
  }, [dismissedRows]);

  const overdueAlerts = useMemo(() => computeOverdueAlerts(records, dismissedSet), [records, dismissedSet]);
  const changeAlerts = useMemo(() => recentChangesToAlerts(recentChanges), [recentChanges]);

  // Enrich changeAlerts with TBV from records
  const enrichedChangeAlerts = useMemo(() => {
    const tbvLookup = new Map<string, string>();
    for (const r of records) {
      if (r.vehicleId && r.tbvFunds[0] && !tbvLookup.has(r.vehicleId)) {
        tbvLookup.set(r.vehicleId, r.tbvFunds[0]);
      }
    }
    return changeAlerts.map(a => ({ ...a, tbv: tbvLookup.get(a.vehicleId) || 'Unknown' }));
  }, [changeAlerts, records]);

  const allAlerts = useMemo(() => {
    const combined: AlertItem[] = [...overdueAlerts, ...enrichedChangeAlerts];
    combined.sort((a, b) => {
      const typeOrder = { overdue: 0, received: 1, standardized: 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      if (a.type === 'overdue' && b.type === 'overdue') return (b.daysOverdue || 0) - (a.daysOverdue || 0);
      return a.vehicleId.localeCompare(b.vehicleId);
    });
    return combined;
  }, [overdueAlerts, enrichedChangeAlerts]);

  const overdueCount = overdueAlerts.length;
  const receivedCount = enrichedChangeAlerts.filter(a => a.type === 'received').length;
  const standardizedCount = enrichedChangeAlerts.filter(a => a.type === 'standardized').length;

  // Available quarters from alerts
  const availableQuarters = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAlerts) if (a.quarter) set.add(a.quarter);
    return [...set].sort();
  }, [allAlerts]);

  // Apply all filters
  const filtered = useMemo(() => {
    return allAlerts.filter(a => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (deliverableFilter !== 'all' && a.deliverable !== deliverableFilter) return false;
      if (quarterFilter !== 'all' && a.quarter !== quarterFilter) return false;
      return true;
    });
  }, [allAlerts, typeFilter, deliverableFilter, quarterFilter]);

  // Group filtered alerts by TBV
  const groupedByTbv = useMemo(() => {
    const map = new Map<string, AlertItem[]>();
    for (const a of filtered) {
      const tbv = a.tbv || 'Unknown';
      const list = map.get(tbv) || [];
      list.push(a);
      map.set(tbv, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [filtered]);

  const toggleTbv = useCallback((tbv: string) => {
    setExpandedTbvs(prev => {
      const next = new Set(prev);
      if (next.has(tbv)) next.delete(tbv); else next.add(tbv);
      return next;
    });
  }, []);

  const handleDismiss = useCallback(async (alert: AlertItem) => {
    const key = `${alert.vehicleId}|${alert.quarter}|${alert.deliverable}`;
    setDismissing(key);
    try {
      await dismissOverdueItem(alert.vehicleId, alert.quarter, alert.deliverable);
      queryClient.invalidateQueries({ queryKey: ['dismissedOverdue'] });
    } finally {
      setDismissing(null);
    }
  }, [queryClient]);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors"
      >
        <div className="flex items-center gap-3">
          {overdueCount > 0 ? (
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
              <Bell className="h-4 w-4 text-red-500" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <BellOff className="h-4 w-4 text-emerald-500" />
            </div>
          )}
          <div className="text-left">
            <h2 className="text-sm font-semibold text-[#111827]">Alerts</h2>
            <p className="text-xs text-[#9CA3AF]">
              {overdueCount > 0
                ? `${overdueCount} overdue${receivedCount > 0 ? `, ${receivedCount} received (7d)` : ''}${standardizedCount > 0 ? `, ${standardizedCount} standardized (7d)` : ''}`
                : receivedCount > 0 || standardizedCount > 0
                  ? `${receivedCount} received, ${standardizedCount} standardized in last 7 days`
                  : 'All deliverables on track'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
              <AlertTriangle className="h-3 w-3" /> {overdueCount}
            </span>
          )}
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
            : <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
          }
        </div>
      </button>

      {isExpanded && (
        <>
          {/* Filters row */}
          <div className="px-5 py-2 border-t border-[#F3F4F6] flex items-center gap-3 flex-wrap">
            {/* Status type tabs */}
            <div className="flex items-center gap-1">
              {([
                { id: 'all' as const, label: 'All', count: allAlerts.length },
                { id: 'overdue' as const, label: 'Overdue', count: overdueCount },
                { id: 'received' as const, label: 'Received', count: receivedCount },
                { id: 'standardized' as const, label: 'Standardized', count: standardizedCount },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={(e) => { e.stopPropagation(); setTypeFilter(t.id); }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    typeFilter === t.id
                      ? 'bg-[#1E4B7A] text-white'
                      : 'text-[#6B7280] hover:bg-[#F3F4F6]'
                  )}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#E5E7EB]" />

            {/* Deliverable type dropdown */}
            <select
              value={deliverableFilter}
              onChange={e => setDeliverableFilter(e.target.value as DeliverableFilter)}
              className="text-xs border border-[#E5E7EB] rounded-md px-2 py-1 text-[#374151] bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A]"
            >
              <option value="all">All types</option>
              <option value="Portfolio">Portfolio</option>
              <option value="LP Letter">LP Letter</option>
              <option value="Financials">Financials</option>
            </select>

            {/* Quarter dropdown */}
            <select
              value={quarterFilter}
              onChange={e => setQuarterFilter(e.target.value)}
              className="text-xs border border-[#E5E7EB] rounded-md px-2 py-1 text-[#374151] bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A]"
            >
              <option value="all">All quarters</option>
              {availableQuarters.map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>

            <span className="text-[10px] text-[#9CA3AF] ml-auto">{filtered.length} alerts</span>
          </div>

          {/* Alert list grouped by TBV */}
          <div className="max-h-[400px] overflow-y-auto border-t border-[#F3F4F6]">
            {filtered.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-[#9CA3AF]">No alerts match the selected filters</div>
            ) : (
              groupedByTbv.map(([tbv, items]) => {
                const isOpen = expandedTbvs.has(tbv);
                const overdueInGroup = items.filter(a => a.type === 'overdue').length;
                return (
                  <div key={tbv}>
                    <button
                      onClick={() => toggleTbv(tbv)}
                      className="w-full px-5 py-2 flex items-center gap-2 bg-[#F9FAFB] hover:bg-[#F3F4F6] border-b border-[#E5E7EB] transition-colors"
                    >
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
                        : <ChevronRight className="h-3.5 w-3.5 text-[#6B7280]" />
                      }
                      <span className="text-xs font-semibold text-[#374151]">{tbv}</span>
                      <span className="text-[10px] text-[#9CA3AF]">{items.length} alerts</span>
                      {overdueInGroup > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                          <AlertTriangle className="h-2.5 w-2.5" /> {overdueInGroup}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-[#F3F4F6]">
                        {items.map((alert, idx) => {
                          const dismissKey = `${alert.vehicleId}|${alert.quarter}|${alert.deliverable}`;
                          return (
                            <div
                              key={`${alert.vehicleId}-${alert.quarter}-${alert.deliverable}-${alert.type}-${idx}`}
                              className="px-5 pl-10 py-2.5 flex items-center gap-3 hover:bg-[#F9FAFB] transition-colors"
                            >
                              {alertTypeIcon(alert.type)}
                              <button
                                onClick={() => onVehicleClick(alert.vehicleId)}
                                className="text-sm font-medium text-[#1E4B7A] hover:underline shrink-0 min-w-[140px] text-left"
                              >
                                {alert.vehicleId}
                              </button>
                              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0', alertTypeBadge(alert.type))}>
                                {alert.deliverable}
                              </span>
                              <span className="text-xs text-[#6B7280] truncate flex-1">{alert.detail}</span>
                              <span className="text-[10px] text-[#9CA3AF] shrink-0">{alert.quarter}</span>
                              {alert.type === 'overdue' && (
                                <button
                                  onClick={() => handleDismiss(alert)}
                                  disabled={dismissing === dismissKey}
                                  title="Mark as irrelevant — stops notifications for this item"
                                  className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-400 transition-colors shrink-0 disabled:opacity-40"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OverallQualityPage() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['monitoringRecords'],
    queryFn: () => getMonitoringRecords(),
    staleTime: 5 * 60 * 1000,
  });

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

  const tbvCycleGroups = useMemo(() => {
    // Group all records by vehicle
    const recordsByVehicle = new Map<string, MonitoringRecord[]>();
    for (const r of records) {
      if (!r.vehicleId) continue;
      const list = recordsByVehicle.get(r.vehicleId) || [];
      list.push(r);
      recordsByVehicle.set(r.vehicleId, list);
    }

    const tbvMap = new Map<string, VehicleCycleRow[]>();
    for (const [vehicleId, vehicleRecords] of recordsByVehicle) {
      // Use TBV from any record (they should all be the same for a vehicle)
      const tbvs = vehicleRecords[0].tbvFunds;
      const row = deriveRow(vehicleId, vehicleRecords);
      for (const tbv of tbvs) {
        const list = tbvMap.get(tbv) || [];
        list.push(row);
        tbvMap.set(tbv, list);
      }
    }

    const groups: TbvCycleGroup[] = [...tbvMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([tbv, vehicles]) => {
        vehicles.sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));
        const portfolioCount = vehicles.filter(v => v.portfolio.missing > 0).length;
        const totalVehicles = vehicles.length;
        return {
          tbv,
          vehicles,
          portfolioCount,
          totalVehicles,
          pct: totalVehicles > 0 ? (portfolioCount / totalVehicles) * 100 : 0,
        };
      });

    return groups;
  }, [records]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading monitoring data from Airtable...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlertsPanel records={records} onVehicleClick={setSelectedVehicle} />

      <h1 className="text-xl font-semibold text-[#111827]">1. Cycle Matrix</h1>

      {tbvCycleGroups.map(group => (
        <TbvCycleSection
          key={group.tbv}
          group={group}
          onVehicleClick={setSelectedVehicle}
        />
      ))}

      {selectedVehicle && (
        <VehicleDetailModal
          vehicleId={selectedVehicle}
          records={records}
          onClose={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  );
}

function FractionCell({ frac }: { frac: CellFraction }) {
  const [open, setOpen] = useState(false);
  const received = frac.total - frac.missing;
  const bgClass = frac.missing === 0
    ? 'bg-emerald-100 text-emerald-800'
    : received === 0
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-100 text-amber-800';

  return (
    <td className="px-3 py-2.5 text-center relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium hover:ring-2 hover:ring-offset-1 hover:ring-[#1E4B7A]/30 transition-all', bgClass)}
      >
        {received}/{frac.total}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg p-3 min-w-[160px] text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#111827]">
              {frac.missing === 0 ? 'All received' : 'Missing for:'}
            </span>
            <button onClick={() => setOpen(false)} className="text-[#6B7280] hover:text-[#111827]">
              <X className="h-3 w-3" />
            </button>
          </div>
          {frac.missingQuarters.length > 0 ? (
            <ul className="space-y-1">
              {frac.missingQuarters.map(q => (
                <li key={q} className="text-xs text-[#374151] flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                  {q}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-600">All quarters have this deliverable.</p>
          )}
        </div>
      )}
    </td>
  );
}

function TbvCycleSection({
  group,
  onVehicleClick,
}: {
  group: TbvCycleGroup;
  onVehicleClick: (vehicleId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
      {/* Collapsible TBV Header */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full px-6 py-3 bg-[#1E4B7A] text-white flex items-center justify-between hover:bg-[#1a4068] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded
            ? <ChevronDown className="h-4 w-4 opacity-70" />
            : <ChevronRight className="h-4 w-4 opacity-70" />
          }
          <h2 className="text-sm font-semibold">{group.tbv}</h2>
          <span className={cn('text-sm font-mono', group.pct === 0 ? 'text-emerald-300' : group.pct <= 20 ? 'text-amber-300' : 'text-red-300')}>
            ({group.portfolioCount}/{group.totalVehicles} missing portfolios)
          </span>
        </div>
        <span className="text-xs opacity-70">{group.vehicles.length} vehicles</span>
      </button>

      {/* Matrix Table */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium min-w-[180px]">Vehicle</th>
                {CYCLE_COLUMNS.map(col => (
                  <th key={col} className="px-3 py-2.5 font-medium text-center min-w-[100px]">{col}</th>
                ))}
                <th className="px-3 py-2.5 font-medium text-center min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {group.vehicles.map(row => (
                <tr key={row.vehicleId} className="hover:bg-[#F9FAFB]">
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onVehicleClick(row.vehicleId)}
                      className="text-sm font-medium text-[#1E4B7A] hover:underline text-left"
                    >
                      {row.vehicleId}
                    </button>
                  </td>
                  {CYCLE_COLUMNS.map(col => (
                    <FractionCell key={col} frac={getFractionForColumn(row, col)} />
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button className="px-2 py-0.5 text-xs font-medium rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
                        Push
                      </button>
                      <button className="px-2 py-0.5 text-xs font-medium rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
                        Snooze
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
