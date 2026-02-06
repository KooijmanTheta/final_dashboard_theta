'use client';

import { useProjectUpdates } from '@/hooks/use-project-updates';
import { UpdateCard } from './update-card';
import { FileText, Loader2 } from 'lucide-react';

interface ProjectUpdatesTimelineProps {
  projectId: string;  // Human-readable project name (e.g., "Polymarket (dba: Blockratize)")
  dateOfReview: string;
  author: string;
}

export function ProjectUpdatesTimeline({
  projectId,
  dateOfReview,
  author,
}: ProjectUpdatesTimelineProps) {
  // Query using projectId (human-readable name) to match at_processed_notes.project_id
  const { data: updates, isLoading, error } = useProjectUpdates(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-[#6B7280]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading updates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500 text-sm">
        Failed to load project updates
      </div>
    );
  }

  if (!updates || updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[#6B7280]">
        <FileText className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No project updates available</p>
      </div>
    );
  }

  return (
    <div className="relative max-h-[400px] overflow-y-auto pr-2">
      {/* Vertical timeline line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-[#E5E7EB]" />

      {/* Update cards */}
      <div className="space-y-4 pl-6">
        {updates.map((update, index) => (
          <UpdateCard
            key={update.id}
            update={update}
            projectId={projectId}
            dateOfReview={dateOfReview}
            author={author}
            isFirst={index === 0}
            isLast={index === updates.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
