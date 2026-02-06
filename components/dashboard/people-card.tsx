'use client';

import { useEffect, useCallback, useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Linkedin,
  Twitter,
  MapPin,
  Calendar,
  Briefcase,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Star,
  User,
} from 'lucide-react';
import {
  getPersonInfo,
  getPersonExperience,
  getPersonEducation,
  getPersonUpdates,
  type PersonInfo,
  type ExperienceEntry,
  type EducationEntry,
  type PersonUpdate,
} from '@/actions/people-card';
import { formatExperienceDuration, getPersonStatus } from '@/lib/people-utils';
import { cn } from '@/lib/utils';
import { NoteCard } from '@/components/notes/note-card';
import { NoteEditor, NoteEditorInline } from '@/components/notes/note-editor';
import { NoteVersionHistory } from '@/components/notes/note-version-history';
import { UndoToast } from '@/components/notes/undo-toast';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import {
  useGeneralNotesForPerson,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useRestoreNote,
} from '@/hooks/use-notes';

interface PeopleCardProps {
  peopleId: string;
  portfolioDate: string;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// Section Components
// ============================================================================

function PersonInfoSection({ data }: { data: PersonInfo | null }) {
  if (!data) return null;

  const status = getPersonStatus(data.leaving_year);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {data.linkedin_profile_pic_url ? (
          <img
            src={data.linkedin_profile_pic_url}
            alt={data.people_id}
            className="w-16 h-16 rounded-full object-cover bg-[#F9FAFB]"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <User className="h-8 w-8 text-[#9CA3AF]" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-[#111827]">{data.people_id}</h3>
          {data.linkedin_headline && (
            <p className="text-sm text-[#6B7280] mt-1">{data.linkedin_headline}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                status.isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {status.label}
            </span>
            {data.key_member && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                <Star className="h-3 w-3" />
                Key Member
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Fund Manager</span>
          <span className="text-[#111827] font-medium">{data.fund_id || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Role</span>
          <span className="text-[#111827] font-medium">{data.role || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Team</span>
          <span className="text-[#111827] font-medium">{data.team || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Hierarchy Level</span>
          <span className="text-[#111827] font-medium">
            {data.hierarchy_level ? `Level ${data.hierarchy_level}` : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Joining Year</span>
          <span className="text-[#111827] font-medium font-mono tabular-nums">
            {data.joining_year || '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B7280]">Leaving Year</span>
          <span className="text-[#111827] font-medium font-mono tabular-nums">
            {data.leaving_year || 'Active'}
          </span>
        </div>
        {data.nationality && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Nationality</span>
            <span className="text-[#111827] font-medium">{data.nationality}</span>
          </div>
        )}
      </div>

      {/* Social Links */}
      <div className="flex flex-wrap gap-3 pt-2">
        {data.linkedin_profile_url && (
          <a
            href={data.linkedin_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#0A66C2] hover:underline"
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
        )}
        {data.twitter_handle && (
          <a
            href={`https://twitter.com/${data.twitter_handle.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#1DA1F2] hover:underline"
          >
            <Twitter className="h-4 w-4" />
            @{data.twitter_handle.replace('@', '')}
          </a>
        )}
      </div>

      {/* Location */}
      {data.linkedin_location && (
        <div className="flex items-center gap-2 text-sm text-[#6B7280]">
          <MapPin className="h-4 w-4" />
          {data.linkedin_location}
        </div>
      )}

      {/* Database Notes */}
      {data.notes && (
        <div className="mt-4 p-3 bg-[#FAFAFA] rounded-lg">
          <p className="text-xs font-medium text-[#6B7280] mb-1">Notes</p>
          <p className="text-sm text-[#111827]">{data.notes}</p>
        </div>
      )}
    </div>
  );
}

function ExperienceSection({
  experience,
  showAllInitially = false,
}: {
  experience: ExperienceEntry[];
  showAllInitially?: boolean;
}) {
  const [showAll, setShowAll] = useState(showAllInitially);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  if (experience.length === 0) {
    return <p className="text-sm text-[#6B7280]">No experience data available</p>;
  }

  // Show only recent entries (last 3) unless showAll is true
  const displayedExperience = showAll ? experience : experience.slice(0, 3);

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="space-y-3">
      {displayedExperience.map((exp, idx) => {
        const isExpanded = expandedItems[idx];
        const companyName = exp.company?.name || 'Unknown Company';
        const companyLogo = exp.company?.logo;

        // Handle both single position and multiple positions format
        const positions = exp.positions || (exp.title ? [exp] : []);

        return (
          <div key={idx} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <button
              onClick={() => toggleItem(idx)}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[#FAFAFA] transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-[#6B7280] flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#6B7280] flex-shrink-0" />
              )}
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-8 h-8 rounded object-contain bg-[#F9FAFB]"
                />
              )}
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-[#111827]">{companyName}</p>
                {exp.totalDuration && (
                  <p className="text-xs text-[#6B7280]">{exp.totalDuration}</p>
                )}
              </div>
            </button>

            {isExpanded && positions.length > 0 && (
              <div className="px-3 pb-3 pl-10 space-y-2">
                {positions.map((pos: any, posIdx: number) => (
                  <div key={posIdx} className="text-sm border-l-2 border-[#E5E7EB] pl-3">
                    <p className="font-medium text-[#111827]">{pos.title || 'Role'}</p>
                    <p className="text-xs text-[#6B7280]">
                      {formatExperienceDuration(
                        pos.timePeriod?.startDate,
                        pos.timePeriod?.endDate
                      )}
                      {pos.totalDuration && ` (${pos.totalDuration})`}
                    </p>
                    {pos.description && (
                      <p className="text-xs text-[#6B7280] mt-1">{pos.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {experience.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-[#1E4B7A] hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${experience.length} positions`}
        </button>
      )}
    </div>
  );
}

function EducationSection({ education }: { education: EducationEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  if (education.length === 0) {
    return <p className="text-sm text-[#6B7280]">No education data available</p>;
  }

  // Show only 3 items by default
  const displayedEducation = showAll ? education : education.slice(0, 3);

  return (
    <div className="space-y-3">
      {displayedEducation.map((edu, idx) => (
        <div key={idx} className="flex items-start gap-3 p-3 bg-[#FAFAFA] rounded-lg">
          {edu.schoolLogo ? (
            <img
              src={edu.schoolLogo}
              alt={edu.schoolName}
              className="w-10 h-10 rounded object-contain bg-white"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-[#E5E7EB] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-[#6B7280]" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-[#111827]">{edu.schoolName}</p>
            {(edu.degreeName || edu.fieldOfStudy) && (
              <p className="text-xs text-[#6B7280]">
                {[edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(' - ')}
              </p>
            )}
            {edu.timePeriod?.startDate?.year && (
              <p className="text-xs text-[#9CA3AF]">
                {edu.timePeriod.startDate.year}
                {edu.timePeriod?.endDate?.year &&
                  edu.timePeriod.endDate.year !== edu.timePeriod.startDate.year &&
                  ` - ${edu.timePeriod.endDate.year}`}
              </p>
            )}
          </div>
        </div>
      ))}

      {education.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-[#1E4B7A] hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${education.length} education entries`}
        </button>
      )}
    </div>
  );
}

function PersonUpdatesSection({ updates }: { updates: PersonUpdate[] }) {
  if (updates.length === 0) {
    return (
      <div className="text-center py-4 text-[#6B7280] text-sm">
        No updates mentioning this person
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {updates.map((update) => (
        <div
          key={update.id}
          className="p-3 bg-[#FAFAFA] rounded-lg border border-[#E5E7EB]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-3 w-3 text-[#6B7280]" />
            <span className="text-xs text-[#6B7280]">{update.note_date}</span>
            {update.source_name && (
              <span className="text-xs text-[#9CA3AF]">| {update.source_name}</span>
            )}
          </div>
          <p className="text-sm text-[#111827] line-clamp-3">
            {update.summary || update.note_text}
          </p>
        </div>
      ))}
    </div>
  );
}

// Inline Notes Section for Person
function InlineNotesSection({
  peopleId,
  portfolioDate,
  author,
}: {
  peopleId: string;
  portfolioDate: string;
  author: string;
}) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingHistoryNote, setViewingHistoryNote] = useState<Note | null>(null);
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null);

  // Fetch general notes for person
  const { data: notes, isLoading } = useGeneralNotesForPerson(
    peopleId,
    portfolioDate,
    true, // include previous reviews
    true // enabled
  );

  // Mutations
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const restoreNoteMutation = useRestoreNote();

  const handleSaveNote = async (params: CreateNoteParams | UpdateNoteParams) => {
    if (editingNote) {
      await updateNoteMutation.mutateAsync({
        noteId: editingNote.note_id,
        params: params as UpdateNoteParams,
      });
      setEditingNote(null);
    } else {
      await createNoteMutation.mutateAsync(params as CreateNoteParams);
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (note: Note) => {
    await deleteNoteMutation.mutateAsync({
      noteId: note.note_id,
      deletedBy: author,
    });
    setDeletedNoteId(note.note_id);
  };

  const handleUndoDelete = async () => {
    if (deletedNoteId) {
      await restoreNoteMutation.mutateAsync(deletedNoteId);
      setDeletedNoteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Note Section */}
      {isAddingNote ? (
        <NoteEditor
          entityType="person"
          peopleId={peopleId}
          dateOfReview={portfolioDate}
          author={author}
          onSave={handleSaveNote}
          onCancel={() => setIsAddingNote(false)}
          isLoading={createNoteMutation.isPending}
        />
      ) : (
        <NoteEditorInline onAddClick={() => setIsAddingNote(true)} />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-4 text-[#6B7280] text-sm">Loading notes...</div>
      )}

      {/* Empty State */}
      {!isLoading && (!notes || notes.length === 0) && (
        <div className="text-center py-4 text-[#6B7280] text-sm">
          No notes yet. Add your first note above.
        </div>
      )}

      {/* Notes List */}
      {!isLoading && notes && notes.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {notes.map((note) =>
            editingNote?.note_id === note.note_id ? (
              <NoteEditor
                key={note.note_id}
                entityType="person"
                peopleId={peopleId}
                dateOfReview={portfolioDate}
                existingNote={note}
                author={author}
                onSave={handleSaveNote}
                onCancel={() => setEditingNote(null)}
                isLoading={updateNoteMutation.isPending}
              />
            ) : (
              <NoteCard
                key={note.note_id}
                note={note}
                onEdit={(n) => setEditingNote(n)}
                onDelete={handleDeleteNote}
                onViewHistory={(n) => setViewingHistoryNote(n)}
                isEditable={true}
              />
            )
          )}
        </div>
      )}

      {/* Version History Modal */}
      {viewingHistoryNote && (
        <NoteVersionHistory
          noteId={viewingHistoryNote.note_id}
          isOpen={!!viewingHistoryNote}
          onClose={() => setViewingHistoryNote(null)}
          currentAuthor={author}
        />
      )}

      {/* Undo Delete Toast */}
      {deletedNoteId && (
        <UndoToast
          message="Note deleted"
          onUndo={handleUndoDelete}
          onDismiss={() => setDeletedNoteId(null)}
          duration={5000}
        />
      )}
    </div>
  );
}

// ============================================================================
// Section Wrapper Component
// ============================================================================

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#E5E7EB] pb-6 mb-6 last:border-b-0 last:pb-0 last:mb-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#111827] uppercase tracking-wide mb-4">
        {Icon && <Icon className="h-4 w-4 text-[#6B7280]" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

// ============================================================================
// Main People Card Component
// ============================================================================

const DEFAULT_AUTHOR = 'Dashboard User';

export function PeopleCard({ peopleId, portfolioDate, isOpen, onClose }: PeopleCardProps) {
  // Handle Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

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

  // Fetch person info
  const { data: personInfo, isLoading: loadingInfo } = useQuery({
    queryKey: ['personInfo', peopleId],
    queryFn: () => getPersonInfo(peopleId),
    enabled: isOpen && !!peopleId,
  });

  // Fetch experience
  const { data: experience, isLoading: loadingExperience } = useQuery({
    queryKey: ['personExperience', peopleId],
    queryFn: () => getPersonExperience(peopleId),
    enabled: isOpen && !!peopleId,
  });

  // Fetch education
  const { data: education, isLoading: loadingEducation } = useQuery({
    queryKey: ['personEducation', peopleId],
    queryFn: () => getPersonEducation(peopleId),
    enabled: isOpen && !!peopleId,
  });

  // Fetch updates
  const { data: updates, isLoading: loadingUpdates } = useQuery({
    queryKey: ['personUpdates', peopleId],
    queryFn: () => getPersonUpdates(peopleId),
    enabled: isOpen && !!peopleId,
  });

  if (!isOpen) return null;

  const isLoading = loadingInfo || loadingExperience || loadingEducation;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">{peopleId}</h2>
            {personInfo?.fund_id && (
              <p className="text-sm text-[#6B7280]">{personInfo.fund_id}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[#6B7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-73px)] px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-[#6B7280]">Loading person data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: General Info */}
              <Section title="General Info" icon={User}>
                <PersonInfoSection data={personInfo || null} />
              </Section>

              {/* Section 2: Background - Experience */}
              <Section title="Experience" icon={Briefcase}>
                <ExperienceSection experience={experience || []} />
              </Section>

              {/* Section 3: Background - Education */}
              <Section title="Education" icon={GraduationCap}>
                <EducationSection education={education || []} />
              </Section>

              {/* Section 4: Person Updates (if available) */}
              {updates && updates.length > 0 && (
                <Section title="Person Updates" icon={Calendar}>
                  <PersonUpdatesSection updates={updates} />
                </Section>
              )}

              {/* Section 5: General Notes */}
              <Section title="General Notes">
                <InlineNotesSection
                  peopleId={peopleId}
                  portfolioDate={portfolioDate}
                  author={DEFAULT_AUTHOR}
                />
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
