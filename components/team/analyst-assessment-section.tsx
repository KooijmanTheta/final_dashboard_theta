'use client';

import { useState } from 'react';
import { Users, AlertTriangle, Clock, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { NotesSection } from '@/components/notes/notes-section';

interface AnalystAssessmentSectionProps {
  vehicleId: string;
  fundId?: string;
  dateOfReview: string;
  isLoading?: boolean;
}

const DEFAULT_AUTHOR = 'Dashboard User';

export function AnalystAssessmentSection({
  vehicleId,
  fundId,
  dateOfReview,
  isLoading,
}: AnalystAssessmentSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-[#6B7280]" />
          ) : (
            <ChevronRight className="h-5 w-5 text-[#6B7280]" />
          )}
          <ClipboardList className="h-5 w-5 text-[#1E4B7A]" />
          <h3 className="text-lg font-semibold text-[#111827]">Analyst Assessment</h3>
        </div>
        <span className="text-xs text-[#9CA3AF]">3 sections</span>
      </button>

      {isExpanded && isLoading && (
        <div className="p-6 border-t border-[#E5E7EB]">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-[#E5E7EB] rounded"></div>
            ))}
          </div>
        </div>
      )}

      {isExpanded && !isLoading && (
        <div className="p-6 space-y-6 border-t border-[#E5E7EB]">
        {/* Gaps in Team */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[#111827]">
            <Users className="h-4 w-4 text-[#6B7280]" />
            Gaps in Team
          </div>
          <p className="text-xs text-[#6B7280] mb-2">
            Identify any critical skill gaps, missing roles, or understaffed areas
          </p>
          <NotesSection
            sectionCode="team_gaps_in_team"
            sectionTitle="Gaps in Team Notes"
            vehicleId={vehicleId}
            fundManagerId={fundId}
            dateOfReview={dateOfReview}
            author={DEFAULT_AUTHOR}
            showPreviousReviews={true}
            defaultExpanded={true}
            maxHeight="200px"
          />
        </div>

        {/* Key Person Risk */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[#111827]">
            <AlertTriangle className="h-4 w-4 text-[#6B7280]" />
            Key Person Risk
          </div>
          <p className="text-xs text-[#6B7280] mb-2">
            Assess risks related to dependency on specific individuals
          </p>
          <NotesSection
            sectionCode="team_key_person_risk"
            sectionTitle="Key Person Risk Notes"
            vehicleId={vehicleId}
            fundManagerId={fundId}
            dateOfReview={dateOfReview}
            author={DEFAULT_AUTHOR}
            showPreviousReviews={true}
            defaultExpanded={true}
            maxHeight="200px"
          />
        </div>

        {/* Time Allocation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[#111827]">
            <Clock className="h-4 w-4 text-[#6B7280]" />
            Time Allocation
          </div>
          <p className="text-xs text-[#6B7280] mb-2">
            Notes on how team members allocate time across funds and activities
          </p>
          <NotesSection
            sectionCode="team_time_allocation"
            sectionTitle="Time Allocation Notes"
            vehicleId={vehicleId}
            fundManagerId={fundId}
            dateOfReview={dateOfReview}
            author={DEFAULT_AUTHOR}
            showPreviousReviews={true}
            defaultExpanded={true}
            maxHeight="200px"
          />
        </div>
      </div>
      )}
    </div>
  );
}
