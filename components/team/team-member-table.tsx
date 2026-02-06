'use client';

import { useState } from 'react';
import { Linkedin, ChevronDown, ChevronRight, Star, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeyPerson } from '@/actions/team';

interface TeamMemberTableProps {
  title: string;
  members: KeyPerson[];
  onPersonClick: (peopleId: string) => void;
  onScrape?: (member: KeyPerson) => void;
  scrapingMembers?: Set<string>;
  isLoading?: boolean;
  defaultExpanded?: boolean;
}

function KeyMemberBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
      <Star className="h-3 w-3" />
      Key
    </span>
  );
}

function HierarchyBadge({ level }: { level: number | null }) {
  if (level === null) return <span className="text-[#9CA3AF]">-</span>;

  const colors: Record<number, string> = {
    1: 'bg-purple-100 text-purple-700',
    2: 'bg-blue-100 text-blue-700',
    3: 'bg-green-100 text-green-700',
    4: 'bg-orange-100 text-orange-700',
    5: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', colors[level] || colors[5])}>
      L{level}
    </span>
  );
}

export function TeamMemberTable({
  title,
  members,
  onPersonClick,
  onScrape,
  scrapingMembers,
  isLoading,
  defaultExpanded = true,
}: TeamMemberTableProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const toggleNotes = (peopleId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [peopleId]: !prev[peopleId] }));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
        </div>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-[#E5E7EB] rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-[#6B7280]" />
          ) : (
            <ChevronRight className="h-5 w-5 text-[#6B7280]" />
          )}
          <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
        </div>
        <span className="text-sm text-[#6B7280]">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <>
          {members.length === 0 ? (
            <div className="p-6 text-center text-[#6B7280] text-sm">
              No team members found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E5E7EB]">
                    <th className="px-4 py-3 text-left font-medium text-[#6B7280]">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-[#6B7280]">Role</th>
                    <th className="px-4 py-3 text-center font-medium text-[#6B7280]">Level</th>
                    <th className="px-4 py-3 text-center font-medium text-[#6B7280]">Key</th>
                    <th className="px-4 py-3 text-center font-medium text-[#6B7280]">Joined</th>
                    <th className="px-4 py-3 text-center font-medium text-[#6B7280]">LinkedIn</th>
                    <th className="px-4 py-3 text-left font-medium text-[#6B7280]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((person) => {
                    const isNotesExpanded = expandedNotes[person.people_id];
                    // Use notes if available, otherwise fall back to text_chunks
                    const notesContent = person.notes || person.text_chunks || '';
                    const hasNotes = notesContent.length > 0;

                    return (
                      <tr
                        key={person.people_id}
                        className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {person.linkedin_profile_pic_url && (
                              <img
                                src={person.linkedin_profile_pic_url}
                                alt={person.people_id}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <button
                              onClick={() => onPersonClick(person.people_id)}
                              className="text-[#1E4B7A] hover:underline font-medium text-left"
                            >
                              {person.people_id}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#6B7280]">{person.role || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <HierarchyBadge level={person.hierarchy_level} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {person.key_member && <KeyMemberBadge />}
                        </td>
                        <td className="px-4 py-3 text-center font-mono tabular-nums text-[#6B7280]">
                          {person.joining_year || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {person.linkedin_profile_url ? (
                            <div className="flex items-center justify-center gap-1">
                              <a
                                href={person.linkedin_profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center p-1.5 hover:bg-[#E5E7EB] rounded-lg transition-colors"
                                title="View LinkedIn Profile"
                              >
                                <Linkedin className={cn(
                                  'h-4 w-4',
                                  person.linkedin_last_scraped ? 'text-green-600' : 'text-[#0A66C2]'
                                )} />
                              </a>
                              {person.linkedin_last_scraped && (
                                <span title={`Scraped: ${person.linkedin_last_scraped}`}>
                                  <Check className="h-3 w-3 text-green-600" />
                                </span>
                              )}
                              {onScrape && (
                                <button
                                  onClick={() => onScrape(person)}
                                  disabled={scrapingMembers?.has(person.people_id)}
                                  className="inline-flex items-center justify-center p-1 text-xs text-[#6B7280] hover:text-[#0A66C2] hover:bg-[#F3F4F6] rounded disabled:opacity-50 transition-colors"
                                  title={person.linkedin_last_scraped ? 'Re-scrape profile' : 'Scrape profile'}
                                >
                                  {scrapingMembers?.has(person.people_id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <span className="text-[10px] font-medium">Scrape</span>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#9CA3AF]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#6B7280] max-w-xs">
                          {hasNotes ? (
                            <div>
                              <p className={cn('text-sm', !isNotesExpanded && 'line-clamp-1')}>
                                {notesContent}
                              </p>
                              {notesContent.length > 100 && (
                                <button
                                  onClick={() => toggleNotes(person.people_id)}
                                  className="text-xs text-[#1E4B7A] hover:underline mt-1"
                                >
                                  {isNotesExpanded ? 'Show less' : 'Show more'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#9CA3AF]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
