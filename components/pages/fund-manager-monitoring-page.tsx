'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFundManagerMonitoringList,
  upsertFMTracking,
  getFMTodos,
  addFMTodo,
  toggleFMTodo,
  deleteFMTodo,
  getFundManagerDetail,
  getFundManagerTeam,
  getFundManagerVehicles,
  type FMMonitoringRow,
  type FMTodo,
  type FMDetail,
  type FMTeamMember,
  type FMVehicle,
} from '@/actions/fund-manager-monitoring';
import {
  Search,
  ChevronDown,
  ExternalLink,
  X,
  Plus,
  Loader2,
  Globe,
  MapPin,
  Users,
  Linkedin,
  Twitter,
  CheckSquare,
  Building2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Helpers
// ============================================

type StatusFilter = 'All' | 'Active' | 'On Hold' | 'Exited';
type SidebarTab = 'overview' | 'team' | 'todos';

const STATUS_OPTIONS: StatusFilter[] = ['All', 'Active', 'On Hold', 'Exited'];

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'Active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On Hold':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Exited':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function daysSinceColor(days: number | null): string {
  if (days === null) return 'text-[#6B7280]';
  if (days <= 30) return 'text-emerald-600';
  if (days <= 90) return 'text-amber-600';
  return 'text-red-600';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAuM(value: number | null): string {
  if (!value) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function FundAvatar({ fundId, logoUrl, size = 'sm' }: { fundId: string; logoUrl: string | null; size?: 'sm' | 'lg' }) {
  const [imgError, setImgError] = useState(false);
  const dims = size === 'lg' ? 'w-14 h-14' : 'w-6 h-6';
  const textSize = size === 'lg' ? 'text-lg' : 'text-[10px]';

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={fundId}
        className={`${dims} rounded-lg object-contain bg-[#F9FAFB]`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={`${dims} rounded-lg bg-[#1E4B7A] flex items-center justify-center ${textSize} text-white font-semibold`}>
      {fundId.charAt(0).toUpperCase()}
    </div>
  );
}

// ============================================
// Inline Editable Cells
// ============================================

function EditableTextCell({
  value,
  fundId,
  field,
  placeholder,
  onSave,
}: {
  value: string | null;
  fundId: string;
  field: string;
  placeholder?: string;
  onSave: (fundId: string, field: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const save = () => {
    setEditing(false);
    if (draft !== (value || '')) {
      onSave(fundId, field, draft);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
        }}
        className="w-full px-2 py-1 text-sm border border-[#1E4B7A] rounded bg-white outline-none"
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left px-2 py-1 text-sm rounded hover:bg-[#F3F4F6] transition-colors min-h-[28px]"
      title="Click to edit"
    >
      {value || <span className="text-[#D1D5DB]">{placeholder || '—'}</span>}
    </button>
  );
}

function EditableDateCell({
  value,
  fundId,
  field,
  onSave,
}: {
  value: string | null;
  fundId: string;
  field: string;
  onSave: (fundId: string, field: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.showPicker?.();
    }
  }, [editing]);

  const save = (newValue: string) => {
    setEditing(false);
    if (newValue !== (value || '')) {
      onSave(fundId, field, newValue);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={value || ''}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        className="w-full px-2 py-1 text-sm border border-[#1E4B7A] rounded bg-white outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left px-2 py-1 text-sm rounded hover:bg-[#F3F4F6] transition-colors min-h-[28px]"
      title="Click to edit"
    >
      {value ? formatDate(value) : <span className="text-[#D1D5DB]">—</span>}
    </button>
  );
}

function StatusDropdown({
  value,
  fundId,
  onSave,
}: {
  value: string;
  fundId: string;
  onSave: (fundId: string, field: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = ['Active', 'On Hold', 'Exited'];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${statusBadgeClasses(value)} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {value}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1 min-w-[100px]">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setOpen(false);
                if (opt !== value) onSave(fundId, 'fund_status', opt);
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F9FAFB] ${opt === value ? 'font-medium text-[#1E4B7A]' : 'text-[#374151]'}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${opt === 'Active' ? 'bg-emerald-500' : opt === 'On Hold' ? 'bg-amber-500' : 'bg-red-500'}`} />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sidebar Components
// ============================================

function SidebarOverviewTab({ fundId, detail, row, onSave }: {
  fundId: string;
  detail: FMDetail | null;
  row: FMMonitoringRow;
  onSave: (fundId: string, field: string, value: string) => void;
}) {
  const { data: vehicles = [] } = useQuery({
    queryKey: ['fmVehicles', fundId],
    queryFn: () => getFundManagerVehicles(fundId),
  });

  return (
    <div className="space-y-6">
      {/* Fund Info */}
      <div className="flex items-start gap-4">
        <FundAvatar fundId={fundId} logoUrl={detail?.logo_url || row.logo_url} size="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-[#111827] truncate">{fundId}</h3>
          {detail?.location && (
            <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {detail.location}{detail.country ? `, ${detail.country}` : ''}
            </p>
          )}
          {detail?.aum != null && detail.aum > 0 && (
            <p className="text-sm text-[#6B7280] mt-0.5">AuM: <span className="font-medium text-[#111827]">{formatAuM(detail.aum)}</span></p>
          )}
        </div>
      </div>

      {/* Links */}
      {detail && (detail.website || detail.twitter_handle || detail.linkedin_url) && (
        <div className="flex flex-wrap gap-3">
          {detail.website && (
            <a href={detail.website.startsWith('http') ? detail.website : `https://${detail.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline">
              <Globe className="h-4 w-4" /> Website
            </a>
          )}
          {detail.linkedin_url && (
            <a href={detail.linkedin_url.startsWith('http') ? detail.linkedin_url : `https://${detail.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline">
              <Linkedin className="h-4 w-4" /> LinkedIn
            </a>
          )}
          {detail.twitter_handle && (
            <a href={`https://twitter.com/${detail.twitter_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline">
              <Twitter className="h-4 w-4" /> @{detail.twitter_handle.replace('@', '')}
            </a>
          )}
        </div>
      )}

      {/* Tracking Fields */}
      <div>
        <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Relationship Tracking</h4>
        <div className="bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Status</span>
            <StatusDropdown value={row.fund_status} fundId={fundId} onSave={onSave} />
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Last Meeting</span>
            <div className="flex items-center gap-2">
              {row.days_since_meeting !== null && (
                <span className={`text-xs font-medium ${daysSinceColor(row.days_since_meeting)}`}>{row.days_since_meeting}d ago</span>
              )}
              <EditableDateCell value={row.last_meeting_date} fundId={fundId} field="last_meeting_date" onSave={onSave} />
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Next Meeting</span>
            <div className="flex items-center gap-2">
              {row.days_until_next !== null && (
                <span className={`text-xs font-medium ${row.days_until_next < 0 ? 'text-red-600' : row.days_until_next <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {row.days_until_next < 0 ? `${Math.abs(row.days_until_next)}d overdue` : `in ${row.days_until_next}d`}
                </span>
              )}
              <EditableDateCell value={row.next_meeting_date} fundId={fundId} field="next_meeting_date" onSave={onSave} />
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Quarterly Report</span>
            <EditableDateCell value={row.quarterly_report_date} fundId={fundId} field="quarterly_report_date" onSave={onSave} />
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Primary Contact</span>
            <EditableTextCell value={row.primary_contact} fundId={fundId} field="primary_contact" placeholder="Contact name" onSave={onSave} />
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#6B7280]">Investor Portal</span>
            <EditableTextCell value={row.investor_portal_url} fundId={fundId} field="investor_portal_url" placeholder="https://..." onSave={onSave} />
          </div>
        </div>
      </div>

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Vehicles ({vehicles.length})</h4>
          <div className="space-y-1.5">
            {vehicles.map((v: FMVehicle) => (
              <div key={v.vehicle_id} className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] text-sm">
                <Building2 className="h-3.5 w-3.5 text-[#9CA3AF] flex-shrink-0" />
                <span className="text-[#111827] font-medium truncate">{v.full_strategy_name || v.vehicle_id}</span>
                {v.vintage && <span className="text-[#9CA3AF] text-xs ml-auto">({v.vintage})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarTeamTab({ fundId }: { fundId: string }) {
  const { data: team = [], isLoading } = useQuery({
    queryKey: ['fmTeam', fundId],
    queryFn: () => getFundManagerTeam(fundId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-[#6B7280]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading team...
      </div>
    );
  }

  if (team.length === 0) {
    return <p className="text-sm text-[#6B7280] text-center py-8">No team members found for this fund manager.</p>;
  }

  // Group by team
  const grouped: Record<string, FMTeamMember[]> = {};
  for (const member of team) {
    const group = member.team || 'Other';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(member);
  }

  const teamOrder = ['Leadership Team', 'Investment Team', 'Operations Team', 'Other'];
  const sortedGroups = Object.keys(grouped).sort(
    (a, b) => teamOrder.indexOf(a) - teamOrder.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {sortedGroups.map((group) => (
        <div key={group}>
          <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
            {group} ({grouped[group].length})
          </h4>
          <div className="space-y-2">
            {grouped[group].map((member: FMTeamMember) => (
              <div key={member.people_id} className="flex items-start gap-3 px-3 py-2.5 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB]">
                {member.linkedin_profile_pic_url ? (
                  <img
                    src={member.linkedin_profile_pic_url}
                    alt={member.people_id}
                    className="w-9 h-9 rounded-full object-cover bg-[#E5E7EB] flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-[#9CA3AF]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#111827] truncate">{member.people_id}</span>
                    {member.key_member && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#1E4B7A] text-white rounded font-medium">KEY</span>
                    )}
                  </div>
                  {member.role && (
                    <p className="text-xs text-[#6B7280] truncate">{member.role}</p>
                  )}
                  {member.linkedin_headline && !member.role && (
                    <p className="text-xs text-[#6B7280] truncate">{member.linkedin_headline}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {member.linkedin_location && (
                      <span className="text-[11px] text-[#9CA3AF] flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {member.linkedin_location}
                      </span>
                    )}
                    {member.joining_year && (
                      <span className="text-[11px] text-[#9CA3AF]">Joined {member.joining_year}</span>
                    )}
                  </div>
                </div>
                {member.linkedin_profile_url && (
                  <a href={member.linkedin_profile_url} target="_blank" rel="noopener noreferrer" className="text-[#9CA3AF] hover:text-[#1E4B7A] flex-shrink-0">
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarTodosTab({ fundId, username }: { fundId: string; username: string }) {
  const queryClient = useQueryClient();
  const [newTodo, setNewTodo] = useState('');

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['fmTodos', fundId],
    queryFn: () => getFMTodos(fundId),
  });

  const addMutation = useMutation({
    mutationFn: (text: string) => addFMTodo({ fund_id: fundId, todo_text: text, created_by: username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fmTodos', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fmMonitoring'] });
      setNewTodo('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ todoId, completed }: { todoId: string; completed: boolean }) => toggleFMTodo(todoId, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fmTodos', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fmMonitoring'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (todoId: string) => deleteFMTodo(todoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fmTodos', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fmMonitoring'] });
    },
  });

  const handleAdd = () => {
    const text = newTodo.trim();
    if (!text) return;
    addMutation.mutate(text);
  };

  const openTodos = todos.filter((t: FMTodo) => !t.is_completed);
  const doneTodos = todos.filter((t: FMTodo) => t.is_completed);

  return (
    <div className="space-y-4">
      {/* Add TODO input */}
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-[#9CA3AF] flex-shrink-0" />
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add a TODO..."
          className="flex-1 text-sm px-3 py-2 border border-[#E5E7EB] rounded-lg bg-white placeholder:text-[#D1D5DB] outline-none focus:border-[#1E4B7A] transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={!newTodo.trim() || addMutation.isPending}
          className="text-sm px-4 py-2 bg-[#1E4B7A] text-white rounded-lg hover:bg-[#163D63] disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[#6B7280] text-sm py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : todos.length === 0 ? (
        <p className="text-sm text-[#6B7280] text-center py-8">No TODOs yet. Add one above.</p>
      ) : (
        <div className="space-y-1">
          {openTodos.map((todo: FMTodo) => (
            <div key={todo.todo_id} className="flex items-start gap-3 group px-3 py-2.5 rounded-lg hover:bg-[#F9FAFB] transition-colors">
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleMutation.mutate({ todoId: todo.todo_id, completed: true })}
                className="h-4 w-4 mt-0.5 rounded border-[#D1D5DB] text-[#1E4B7A] cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-[#374151]">{todo.todo_text}</span>
                {todo.created_by && (
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5">by {todo.created_by}</p>
                )}
              </div>
              <button
                onClick={() => deleteMutation.mutate(todo.todo_id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-500 transition-all flex-shrink-0"
                title="Delete"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {doneTodos.length > 0 && openTodos.length > 0 && (
            <div className="border-t border-[#E5E7EB] my-2" />
          )}
          {doneTodos.map((todo: FMTodo) => (
            <div key={todo.todo_id} className="flex items-start gap-3 group px-3 py-2.5 rounded-lg hover:bg-[#F9FAFB] transition-colors">
              <input
                type="checkbox"
                checked={true}
                onChange={() => toggleMutation.mutate({ todoId: todo.todo_id, completed: false })}
                className="h-4 w-4 mt-0.5 rounded border-[#D1D5DB] text-[#1E4B7A] cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-[#9CA3AF] line-through flex-1">{todo.todo_text}</span>
              <button
                onClick={() => deleteMutation.mutate(todo.todo_id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-500 transition-all flex-shrink-0"
                title="Delete"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Fund Manager Sidebar
// ============================================

function FundManagerSidebar({
  fundId,
  row,
  isOpen,
  onClose,
  username,
  onSave,
}: {
  fundId: string;
  row: FMMonitoringRow;
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onSave: (fundId: string, field: string, value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['fmDetail', fundId],
    queryFn: () => getFundManagerDetail(fundId),
    enabled: isOpen && !!fundId,
  });

  // Escape key handler
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  // Reset tab when opening a new fund
  useEffect(() => {
    if (isOpen) setActiveTab('overview');
  }, [fundId, isOpen]);

  if (!isOpen) return null;

  const tabs: { id: SidebarTab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'todos', label: 'TODOs', icon: CheckSquare },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} />

      {/* Slide-over panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FundAvatar fundId={fundId} logoUrl={row.logo_url} size="sm" />
              <h2 className="text-lg font-semibold text-[#111827] truncate">{fundId}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${statusBadgeClasses(row.fund_status)}`}>
                {row.fund_status}
              </span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors flex-shrink-0" aria-label="Close">
              <X className="h-5 w-5 text-[#6B7280]" />
            </button>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1 px-6 pb-3">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    activeTab === t.id
                      ? 'bg-[#F9FAFB] text-[#1E4B7A] border border-[#E5E7EB]'
                      : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F9FAFB]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.id === 'todos' && row.todo_open_count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded-full font-medium">
                      {row.todo_open_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-120px)] px-6 py-6">
          {loadingDetail && activeTab === 'overview' ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-[#6B7280]" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <SidebarOverviewTab fundId={fundId} detail={detail || null} row={row} onSave={onSave} />
              )}
              {activeTab === 'team' && (
                <SidebarTeamTab fundId={fundId} />
              )}
              {activeTab === 'todos' && (
                <SidebarTodosTab fundId={fundId} username={username} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================
// Main Page
// ============================================

export function FundManagerMonitoringPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Get username from auth
  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => res.json())
      .then((data) => {
        setUsername(data.authenticated ? data.username : '');
      })
      .catch(() => setUsername(''));
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fmMonitoring', username],
    queryFn: () => getFundManagerMonitoringList(username || undefined),
    enabled: username !== null,
  });

  const upsertMutation = useMutation({
    mutationFn: (params: { fund_id: string; field: string; value: string }) =>
      upsertFMTracking({ ...params, field: params.field as 'fund_status', updatedBy: username || '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fmMonitoring'] });
    },
  });

  const handleSave = useCallback(
    (fundId: string, field: string, value: string) => {
      upsertMutation.mutate({ fund_id: fundId, field, value });
    },
    [upsertMutation]
  );

  // Filter rows
  const filtered = rows.filter((r: FMMonitoringRow) => {
    if (statusFilter !== 'All' && r.fund_status !== statusFilter) return false;
    if (debouncedSearch && !r.fund_id.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

  const selectedRow = rows.find((r: FMMonitoringRow) => r.fund_id === selectedFundId) || null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#111827]">Fund Manager Monitoring</h2>
          <div className="flex items-center gap-3">
            {/* Status filter pills */}
            <div className="flex items-center gap-1 bg-[#F9FAFB] rounded-lg p-0.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === s
                      ? 'bg-white text-[#1E4B7A] shadow-sm border border-[#E5E7EB]'
                      : 'text-[#6B7280] hover:text-[#374151]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fund manager..."
                className="pl-8 pr-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white placeholder:text-[#D1D5DB] outline-none focus:border-[#1E4B7A] w-56"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#6B7280]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading fund managers...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[#6B7280] text-sm">
            {rows.length === 0 ? 'No fund managers found.' : 'No matches for current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280]">Fund Manager</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280]">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap">Days Since Meeting</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap">Last Meeting</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap">Next Meeting</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap">Quarterly Report</th>
                  <th className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap">Primary Contact</th>
                  <th className="text-center px-3 py-2 font-medium text-[#6B7280]">Portal</th>
                  <th className="text-center px-3 py-2 font-medium text-[#6B7280]">TODOs</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row: FMMonitoringRow) => (
                  <tr
                    key={row.fund_id}
                    onClick={() => setSelectedFundId(row.fund_id)}
                    className={cn(
                      'border-b border-[#E5E7EB] cursor-pointer transition-colors',
                      selectedFundId === row.fund_id ? 'bg-blue-50' : 'hover:bg-[#FAFBFC]'
                    )}
                  >
                    {/* Fund Manager */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FundAvatar fundId={row.fund_id} logoUrl={row.logo_url} />
                        <span className="font-medium text-[#111827] truncate max-w-[200px]">{row.fund_id}</span>
                        {row.relationship_type === 'primary' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#1E4B7A] text-white rounded font-medium flex-shrink-0">1st</span>
                        )}
                        {row.relationship_type === 'secondary' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#E5E7EB] text-[#374151] rounded font-medium flex-shrink-0">2nd</span>
                        )}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown value={row.fund_status} fundId={row.fund_id} onSave={handleSave} />
                    </td>
                    {/* Days Since Meeting */}
                    <td className="px-3 py-2">
                      <span className={`text-sm font-medium ${daysSinceColor(row.days_since_meeting)}`}>
                        {row.days_since_meeting !== null ? `${row.days_since_meeting}d` : '—'}
                      </span>
                    </td>
                    {/* Last Meeting */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <EditableDateCell value={row.last_meeting_date} fundId={row.fund_id} field="last_meeting_date" onSave={handleSave} />
                    </td>
                    {/* Next Meeting */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <EditableDateCell value={row.next_meeting_date} fundId={row.fund_id} field="next_meeting_date" onSave={handleSave} />
                    </td>
                    {/* Quarterly Report */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <EditableDateCell value={row.quarterly_report_date} fundId={row.fund_id} field="quarterly_report_date" onSave={handleSave} />
                    </td>
                    {/* Primary Contact */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <EditableTextCell
                        value={row.primary_contact}
                        fundId={row.fund_id}
                        field="primary_contact"
                        placeholder="Contact name"
                        onSave={handleSave}
                      />
                    </td>
                    {/* Portal */}
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      {row.investor_portal_url ? (
                        <a
                          href={row.investor_portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[#1E4B7A] hover:text-[#163D63]"
                          title={row.investor_portal_url}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-[#D1D5DB]">—</span>
                      )}
                    </td>
                    {/* TODOs */}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        row.todo_open_count > 0
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-gray-50 text-[#6B7280] border border-[#E5E7EB]'
                      }`}>
                        {row.todo_open_count > 0 ? `${row.todo_open_count} open` : row.todo_count > 0 ? 'done' : '0'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-[#E5E7EB] text-xs text-[#9CA3AF]">
            Showing {filtered.length} of {rows.length} fund managers
            {statusFilter !== 'All' && ` (filtered by ${statusFilter})`}
            . Click a row to view details. Click any cell to edit inline.
          </div>
        )}
      </div>

      {/* Sidebar */}
      {selectedFundId && selectedRow && (
        <FundManagerSidebar
          fundId={selectedFundId}
          row={selectedRow}
          isOpen={!!selectedFundId}
          onClose={() => setSelectedFundId(null)}
          username={username || ''}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
