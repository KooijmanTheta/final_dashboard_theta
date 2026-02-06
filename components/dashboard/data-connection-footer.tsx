'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Database, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { getDataConnectionSummary, type ConnectionSummary, type TableStatus } from '@/actions/data-connection';
import { cn } from '@/lib/utils';

function StatusIcon({ status }: { status: 'connected' | 'error' | 'empty' }) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'empty':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  }
}

function formatRowCount(count: number | null): string {
  if (count === null) return '-';
  if (count === 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

function TableRow({ table }: { table: TableStatus }) {
  return (
    <tr className={cn(
      'border-b border-[#F3F4F6] last:border-b-0',
      table.status === 'error' && 'bg-red-50',
      table.status === 'empty' && 'bg-yellow-50'
    )}>
      <td className="px-4 py-2">
        <StatusIcon status={table.status} />
      </td>
      <td className="px-4 py-2 text-sm font-medium text-[#111827]">{table.schema}</td>
      <td className="px-4 py-2 text-sm text-[#374151]">{table.table_name}</td>
      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
        {formatRowCount(table.row_count)}
      </td>
      <td className="px-4 py-2 text-sm text-[#6B7280]">
        {table.status === 'connected' && <span className="text-green-600">OK</span>}
        {table.status === 'empty' && <span className="text-yellow-600">Empty</span>}
        {table.status === 'error' && (
          <span className="text-red-600" title={table.error_message}>
            Error
          </span>
        )}
      </td>
    </tr>
  );
}

export function DataConnectionFooter() {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: connectionSummary, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dataConnectionSummary'],
    queryFn: getDataConnectionSummary,
    staleTime: 60000, // Consider data fresh for 1 minute
    refetchOnWindowFocus: false,
  });

  const toggleExpand = () => setIsExpanded(!isExpanded);

  // Summary bar content
  const renderSummaryBar = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-[#6B7280]">
          <Database className="h-4 w-4" />
          <span className="text-sm">Checking database connections...</span>
        </div>
      );
    }

    if (!connectionSummary) {
      return (
        <div className="flex items-center gap-2 text-[#6B7280]">
          <Database className="h-4 w-4" />
          <span className="text-sm">Connection status unknown</span>
        </div>
      );
    }

    const { database_connected, connected_tables, error_tables, empty_tables, total_tables, database_name } = connectionSummary;

    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {database_connected ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium text-[#111827]">
            {database_connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="text-sm text-[#6B7280]">
            ({database_name})
          </span>
        </div>

        <div className="h-4 w-px bg-[#E5E7EB]" />

        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span className="text-[#6B7280]">{connected_tables} tables</span>
          </span>
          {error_tables > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-red-600">{error_tables} errors</span>
            </span>
          )}
          {empty_tables > 0 && (
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-yellow-600">{empty_tables} empty</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-lg z-30">
      {/* Collapsed Summary Bar */}
      <div
        onClick={toggleExpand}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(); }}
      >
        {renderSummaryBar()}

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              refetch();
            }}
            disabled={isFetching}
            className={cn(
              'p-1.5 rounded-md hover:bg-[#F3F4F6] transition-colors',
              isFetching && 'animate-spin'
            )}
            title="Refresh connection status"
          >
            <RefreshCw className="h-4 w-4 text-[#6B7280]" />
          </button>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-[#6B7280]" />
          ) : (
            <ChevronUp className="h-5 w-5 text-[#6B7280]" />
          )}
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {isExpanded && connectionSummary && (
        <div className="border-t border-[#E5E7EB] max-h-80 overflow-y-auto">
          <div className="px-6 py-4">
            {/* Connection Info */}
            <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[#6B7280]">Database: </span>
                <span className="font-medium text-[#111827]">{connectionSummary.database_name}</span>
              </div>
              <div>
                <span className="text-[#6B7280]">Host: </span>
                <span className="font-medium text-[#111827]">{connectionSummary.database_host}</span>
              </div>
              <div>
                <span className="text-[#6B7280]">Last Checked: </span>
                <span className="font-medium text-[#111827]">
                  {new Date(connectionSummary.last_checked).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Connection Error */}
            {connectionSummary.connection_error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">
                  <strong>Connection Error:</strong> {connectionSummary.connection_error}
                </p>
              </div>
            )}

            {/* Tables Grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left">
                    <th className="px-4 py-2 font-medium text-[#6B7280] w-12">Status</th>
                    <th className="px-4 py-2 font-medium text-[#6B7280]">Schema</th>
                    <th className="px-4 py-2 font-medium text-[#6B7280]">Table</th>
                    <th className="px-4 py-2 font-medium text-[#6B7280] text-right">Rows</th>
                    <th className="px-4 py-2 font-medium text-[#6B7280]">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {connectionSummary.tables.map((table) => (
                    <TableRow key={table.full_name} table={table} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-[#E5E7EB] flex justify-between text-sm text-[#6B7280]">
              <span>
                Total: {connectionSummary.total_tables} tables |
                Connected: {connectionSummary.connected_tables} |
                Empty: {connectionSummary.empty_tables} |
                Errors: {connectionSummary.error_tables}
              </span>
              <span>
                Total Rows: {formatRowCount(
                  connectionSummary.tables.reduce((sum, t) => sum + (t.row_count || 0), 0)
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
