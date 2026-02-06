'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDown, ArrowUp, RefreshCw, Plus, Trash2, Loader2, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamChange, KeyPerson } from '@/actions/team';
import { searchPeople } from '@/actions/team';

type PersonSuggestion = { people_id: string; role: string | null; team: string | null };

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2010 + 2 }, (_, i) => 2010 + i);

interface TeamChangesSectionProps {
  departures: TeamChange[];
  additions: TeamChange[];
  fundId: string;
  vehicleId: string;
  dateOfReview: string;
  reviewPeriodStart: number;
  reviewPeriodEnd: number;
  onYearRangeChange?: (start: number, end: number) => void;
  onPersonClick: (peopleId: string) => void;
  onAddChange?: (changeType: 'departure' | 'addition', data: { name: string; role: string; team: string; year: number }) => Promise<void>;
  onRemoveChange?: (peopleId: string, changeType: 'departure' | 'addition') => Promise<void>;
  onRoleChange?: (peopleId: string, newRole: string, note: string) => Promise<void>;
  activeFundMembers?: KeyPerson[];
  isLoading?: boolean;
}

function ChangeBadge({ type }: { type: 'departure' | 'addition' | 'role_change' }) {
  const config = {
    departure: {
      label: 'Departure',
      className: 'bg-red-100 text-red-700',
      icon: ArrowDown,
    },
    addition: {
      label: 'Addition',
      className: 'bg-green-100 text-green-700',
      icon: ArrowUp,
    },
    role_change: {
      label: 'Role Change',
      className: 'bg-blue-100 text-blue-700',
      icon: RefreshCw,
    },
  };

  const { label, className, icon: Icon } = config[type];

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ChangeTable({
  title,
  changes,
  changeType,
  onPersonClick,
  onAdd,
  onRemove,
  defaultYear,
  suggestions,
  isLoading,
}: {
  title: string;
  changes: TeamChange[];
  changeType: 'departure' | 'addition';
  onPersonClick: (peopleId: string) => void;
  onAdd?: (data: { name: string; role: string; team: string; year: number }) => Promise<void>;
  onRemove?: (peopleId: string) => Promise<void>;
  defaultYear: number;
  suggestions?: PersonSuggestion[];
  isLoading?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', role: '', team: '', year: defaultYear });

  // Combobox state
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [serverResults, setServerResults] = useState<PersonSuggestion[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local filtering of suggestions (for departures — active fund members)
  const localMatches = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    const q = formData.name.toLowerCase().trim();
    const filtered = q
      ? suggestions.filter(s => s.people_id.toLowerCase().includes(q))
      : suggestions;
    return filtered.slice(0, 10);
  }, [formData.name, suggestions]);

  // Server-side search (for additions — search across all people)
  useEffect(() => {
    // If we have local suggestions, don't do server search
    if (suggestions && suggestions.length > 0) return;

    const query = formData.name.trim();
    if (query.length < 2) {
      setServerResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPeople(query);
        setServerResults(results);
      } catch {
        setServerResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [formData.name, suggestions]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Which results to show in the dropdown
  const hasSuggestions = suggestions && suggestions.length > 0;
  const displayResults: PersonSuggestion[] = hasSuggestions ? localMatches : serverResults;
  const exactMatch = displayResults.some(r => r.people_id.toLowerCase() === formData.name.toLowerCase().trim());

  const selectPerson = (person: PersonSuggestion) => {
    setFormData(prev => ({
      ...prev,
      name: person.people_id,
      role: person.role || prev.role,
      team: person.team || prev.team,
    }));
    setShowDropdown(false);
  };

  const resetForm = () => {
    setFormData({ name: '', role: '', team: '', year: defaultYear });
    setShowForm(false);
    setShowDropdown(false);
    setServerResults([]);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !onAdd) return;
    setSaving(true);
    try {
      await onAdd(formData);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (peopleId: string) => {
    if (!onRemove) return;
    setRemovingId(peopleId);
    try {
      await onRemove(peopleId);
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-4 py-3 border-b border-[#E5E7EB]">
          <h4 className="text-sm font-semibold text-[#111827]">{title}</h4>
        </div>
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-[#E5E7EB] rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#111827]">{title}</h4>
        <div className="flex items-center gap-2">
          {changes.length > 0 && (
            <span className="text-xs text-[#6B7280]">{changes.length} total</span>
          )}
          {onAdd && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#1E4B7A] bg-[#EFF6FF] rounded hover:bg-[#DBEAFE] transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Inline Add Form */}
      {showForm && (
        <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#FAFAFA]">
          <div className="grid grid-cols-2 gap-2 mb-2">
            {/* Name combobox */}
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
                <input
                  type="text"
                  placeholder={hasSuggestions ? 'Search existing members...' : 'Search or type new name...'}
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, name: e.target.value }));
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full pl-7 pr-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
                  autoFocus
                />
              </div>

              {/* Dropdown */}
              {showDropdown && (formData.name.trim().length > 0 || hasSuggestions) && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-[#E5E7EB] rounded-lg shadow-lg">
                  {/* Loading indicator */}
                  {searching && (
                    <div className="px-3 py-2 text-xs text-[#9CA3AF] flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Searching...
                    </div>
                  )}

                  {/* Existing person results */}
                  {displayResults.map((person) => (
                    <button
                      key={person.people_id}
                      onClick={() => selectPerson(person)}
                      className="w-full px-3 py-2 text-left hover:bg-[#F3F4F6] border-b border-[#F3F4F6] last:border-b-0"
                    >
                      <div className="text-sm font-medium text-[#111827]">{person.people_id}</div>
                      <div className="text-xs text-[#6B7280]">
                        {[person.role, person.team].filter(Boolean).join(' · ') || 'No role/team'}
                      </div>
                    </button>
                  ))}

                  {/* "Create new" option — shown when typed name doesn't exactly match an existing person */}
                  {formData.name.trim().length > 0 && !exactMatch && (
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-[#EFF6FF] flex items-center gap-2 text-sm"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-[#1E4B7A]" />
                      <span>
                        <span className="text-[#1E4B7A] font-medium">Create new:</span>{' '}
                        <span className="text-[#374151]">{formData.name.trim()}</span>
                      </span>
                    </button>
                  )}

                  {/* Empty state */}
                  {!searching && displayResults.length === 0 && formData.name.trim().length >= 2 && exactMatch && (
                    <div className="px-3 py-2 text-xs text-[#9CA3AF]">No matches found</div>
                  )}

                  {/* Hint when no query */}
                  {!hasSuggestions && formData.name.trim().length < 2 && (
                    <div className="px-3 py-2 text-xs text-[#9CA3AF]">Type at least 2 characters to search</div>
                  )}
                </div>
              )}
            </div>

            <input
              type="text"
              placeholder="Role"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="px-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
            />
            <select
              value={formData.team}
              onChange={(e) => setFormData(prev => ({ ...prev, team: e.target.value }))}
              className="px-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
            >
              <option value="">Team (optional)</option>
              <option value="Leadership Team">Leadership Team</option>
              <option value="Investment Team">Investment Team</option>
              <option value="Operations Team">Operations Team</option>
            </select>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) || defaultYear }))}
              className="px-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#1E4B7A] rounded hover:bg-[#163d63] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {saving ? 'Saving...' : `Add ${changeType === 'departure' ? 'Departure' : 'Addition'}`}
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-[#6B7280] bg-white border border-[#D1D5DB] rounded hover:bg-[#F9FAFB] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {changes.length === 0 && !showForm ? (
        <div className="p-6 text-center text-[#6B7280] text-sm">
          No {changeType === 'departure' ? 'departures' : 'additions'} in this period
        </div>
      ) : changes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E5E7EB]">
                <th className="px-4 py-2 text-left font-medium text-[#6B7280]">Name</th>
                <th className="px-4 py-2 text-left font-medium text-[#6B7280]">Role</th>
                <th className="px-4 py-2 text-left font-medium text-[#6B7280]">Team</th>
                <th className="px-4 py-2 text-center font-medium text-[#6B7280]">Year</th>
                <th className="px-4 py-2 text-left font-medium text-[#6B7280]">Status</th>
                {onRemove && <th className="px-4 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {changes.map((person) => (
                <tr
                  key={person.people_id}
                  className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA] group"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onPersonClick(person.people_id)}
                      className="text-[#1E4B7A] hover:underline font-medium text-left"
                    >
                      {person.people_id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[#6B7280]">{person.role || '-'}</td>
                  <td className="px-4 py-3 text-[#6B7280]">{person.team || '-'}</td>
                  <td className="px-4 py-3 text-center font-mono tabular-nums">
                    {person.change_year}
                  </td>
                  <td className="px-4 py-3">
                    <ChangeBadge type={changeType} />
                  </td>
                  {onRemove && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemove(person.people_id)}
                        disabled={removingId === person.people_id}
                        className="opacity-0 group-hover:opacity-100 text-[#9CA3AF] hover:text-red-500 transition-all disabled:opacity-50"
                        title="Remove this entry"
                      >
                        {removingId === person.people_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function RoleChangesSection({
  activeFundMembers,
  onRoleChange,
}: {
  activeFundMembers?: KeyPerson[];
  onRoleChange?: (peopleId: string, newRole: string, note: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [newRole, setNewRole] = useState('');
  const [note, setNote] = useState('');
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const personDropdownRef = useRef<HTMLDivElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Filter active members by search query
  const personMatches = useMemo(() => {
    if (!activeFundMembers) return [];
    const q = (selectedPerson ? '' : personQuery).toLowerCase().trim();
    const filtered = q
      ? activeFundMembers.filter(m => m.people_id.toLowerCase().includes(q))
      : activeFundMembers;
    return filtered.slice(0, 8);
  }, [personQuery, selectedPerson, activeFundMembers]);

  // Get distinct existing roles from active members
  const existingRoles = useMemo(() => {
    if (!activeFundMembers) return [];
    const roles = new Set(
      activeFundMembers
        .map(m => m.role)
        .filter((r): r is string => !!r && r.trim() !== '')
    );
    return Array.from(roles).sort();
  }, [activeFundMembers]);

  // Filter roles by typed query
  const roleMatches = useMemo(() => {
    const q = newRole.toLowerCase().trim();
    if (!q) return existingRoles.slice(0, 8);
    return existingRoles.filter(r => r.toLowerCase().includes(q)).slice(0, 8);
  }, [newRole, existingRoles]);

  const roleExactMatch = roleMatches.some(r => r.toLowerCase() === newRole.toLowerCase().trim());

  // Click outside handlers
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (personDropdownRef.current && !personDropdownRef.current.contains(e.target as Node)) {
        setShowPersonDropdown(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const resetForm = () => {
    setSelectedPerson('');
    setPersonQuery('');
    setNewRole('');
    setNote('');
    setShowForm(false);
    setShowPersonDropdown(false);
    setShowRoleDropdown(false);
  };

  const handleSubmit = async () => {
    if (!selectedPerson || !newRole.trim() || !onRoleChange) return;
    setSaving(true);
    try {
      await onRoleChange(selectedPerson, newRole.trim(), note.trim());
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#111827]">Role Changes / Promotions</h4>
        {onRoleChange && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#1E4B7A] bg-[#EFF6FF] rounded hover:bg-[#DBEAFE] transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      {/* Role Change Form */}
      {showForm && (
        <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#FAFAFA] space-y-2">
          {/* Employee picker */}
          <div className="relative" ref={personDropdownRef}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Select employee..."
                value={selectedPerson || personQuery}
                onChange={(e) => {
                  setPersonQuery(e.target.value);
                  if (selectedPerson) setSelectedPerson('');
                  setShowPersonDropdown(true);
                }}
                onFocus={() => setShowPersonDropdown(true)}
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
                autoFocus
              />
            </div>
            {showPersonDropdown && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white border border-[#E5E7EB] rounded-lg shadow-lg">
                {personMatches.map((person) => (
                  <button
                    key={person.people_id}
                    onClick={() => {
                      setSelectedPerson(person.people_id);
                      setPersonQuery('');
                      setShowPersonDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#F3F4F6] border-b border-[#F3F4F6] last:border-b-0"
                  >
                    <div className="text-sm font-medium text-[#111827]">{person.people_id}</div>
                    <div className="text-xs text-[#6B7280]">{person.role || 'No current role'}</div>
                  </button>
                ))}
                {personMatches.length === 0 && (
                  <div className="px-3 py-2 text-xs text-[#9CA3AF]">No matching members</div>
                )}
              </div>
            )}
          </div>

          {/* Role picker */}
          <div className="relative" ref={roleDropdownRef}>
            <input
              type="text"
              placeholder="New role (select or type new)..."
              value={newRole}
              onChange={(e) => {
                setNewRole(e.target.value);
                setShowRoleDropdown(true);
              }}
              onFocus={() => setShowRoleDropdown(true)}
              className="w-full px-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A]"
            />
            {showRoleDropdown && (roleMatches.length > 0 || (newRole.trim() && !roleExactMatch)) && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white border border-[#E5E7EB] rounded-lg shadow-lg">
                {roleMatches.map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setNewRole(role);
                      setShowRoleDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#F3F4F6] border-b border-[#F3F4F6] last:border-b-0 text-[#111827]"
                  >
                    {role}
                  </button>
                ))}
                {newRole.trim() && !roleExactMatch && (
                  <button
                    onClick={() => setShowRoleDropdown(false)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#EFF6FF] flex items-center gap-1"
                  >
                    <UserPlus className="h-3 w-3 text-[#1E4B7A]" />
                    <span className="text-[#1E4B7A] font-medium">Create:</span>
                    <span className="text-[#374151]">{newRole.trim()}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Note */}
          <textarea
            placeholder="Note about this change (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 text-sm border border-[#D1D5DB] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] focus:border-[#1E4B7A] resize-none"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={!selectedPerson || !newRole.trim() || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#1E4B7A] rounded hover:bg-[#163d63] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {saving ? 'Saving...' : 'Record Change'}
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-[#6B7280] bg-white border border-[#D1D5DB] rounded hover:bg-[#F9FAFB] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <div className="p-6 text-center text-[#6B7280] text-sm">
          No role changes in this period
        </div>
      )}
    </div>
  );
}

export function TeamChangesSection({
  departures,
  additions,
  fundId,
  vehicleId,
  dateOfReview,
  reviewPeriodStart,
  reviewPeriodEnd,
  onYearRangeChange,
  onPersonClick,
  onAddChange,
  onRemoveChange,
  onRoleChange,
  activeFundMembers,
  isLoading,
}: TeamChangesSectionProps) {
  // Map active fund members to suggestion format for departures
  const departureSuggestions = useMemo(() => {
    if (!activeFundMembers) return undefined;
    return activeFundMembers.map(m => ({
      people_id: m.people_id,
      role: m.role,
      team: m.team,
    }));
  }, [activeFundMembers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-[#111827]">Team Changes</h3>
        {onYearRangeChange ? (
          <div className="flex items-center gap-1 text-sm text-[#6B7280]">
            <select
              value={reviewPeriodStart}
              onChange={(e) => {
                const start = parseInt(e.target.value);
                onYearRangeChange(start, Math.max(start, reviewPeriodEnd));
              }}
              className="px-1.5 py-0.5 border border-[#E5E7EB] rounded text-sm bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] cursor-pointer"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span>–</span>
            <select
              value={reviewPeriodEnd}
              onChange={(e) => {
                const end = parseInt(e.target.value);
                onYearRangeChange(Math.min(reviewPeriodStart, end), end);
              }}
              className="px-1.5 py-0.5 border border-[#E5E7EB] rounded text-sm bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#1E4B7A] cursor-pointer"
            >
              {YEAR_OPTIONS.filter(y => y >= reviewPeriodStart).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        ) : (
          <span className="text-sm text-[#6B7280]">({reviewPeriodStart} – {reviewPeriodEnd})</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <ChangeTable
          title="Departures"
          changes={departures}
          changeType="departure"
          onPersonClick={onPersonClick}
          onAdd={onAddChange ? (data) => onAddChange('departure', data) : undefined}
          onRemove={onRemoveChange ? (peopleId) => onRemoveChange(peopleId, 'departure') : undefined}
          defaultYear={reviewPeriodEnd}
          suggestions={departureSuggestions}
          isLoading={isLoading}
        />
        <ChangeTable
          title="Additions"
          changes={additions}
          changeType="addition"
          onPersonClick={onPersonClick}
          onAdd={onAddChange ? (data) => onAddChange('addition', data) : undefined}
          onRemove={onRemoveChange ? (peopleId) => onRemoveChange(peopleId, 'addition') : undefined}
          defaultYear={reviewPeriodEnd}
          isLoading={isLoading}
        />
        <RoleChangesSection
          activeFundMembers={activeFundMembers}
          onRoleChange={onRoleChange}
        />
      </div>
    </div>
  );
}
