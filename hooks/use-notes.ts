'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Note,
  NoteVersion,
  CreateNoteParams,
  UpdateNoteParams,
  GetNotesParams,
  createNote,
  updateNote,
  deleteNote,
  restoreNote,
  getNote,
  getNotesForEntity,
  getNotesForProject,
  getNotesForVehicle,
  getNotesForSection,
  getNotesForSectionByFund,
  getNotesForTbvFund,
  getNotesForProjectUpdate,
  getGeneralNotesForProject,
  getGeneralNotesForVehicle,
  getNotesForVehicleUpdate,
  getNotesForPerson,
  getGeneralNotesForPerson,
  getNoteVersions,
  revertToVersion,
  getRecordIdForProject,
  refreshRecordIdMappings,
} from '@/actions/notes';

// ============================================
// Query Keys
// ============================================

export const noteKeys = {
  all: ['notes'] as const,
  entity: (params: GetNotesParams) => [...noteKeys.all, 'entity', params] as const,
  project: (projectId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'project', projectId, dateOfReview] as const,
  projectGeneral: (projectId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'projectGeneral', projectId, dateOfReview] as const,
  projectUpdate: (projectUpdateId: string) =>
    [...noteKeys.all, 'projectUpdate', projectUpdateId] as const,
  vehicle: (vehicleId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'vehicle', vehicleId, dateOfReview] as const,
  vehicleGeneral: (vehicleId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'vehicleGeneral', vehicleId, dateOfReview] as const,
  vehicleUpdate: (vehicleUpdateId: string) =>
    [...noteKeys.all, 'vehicleUpdate', vehicleUpdateId] as const,
  person: (peopleId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'person', peopleId, dateOfReview] as const,
  personGeneral: (peopleId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'personGeneral', peopleId, dateOfReview] as const,
  section: (sectionCode: string, vehicleId: string, dateOfReview: string) =>
    [...noteKeys.all, 'section', sectionCode, vehicleId, dateOfReview] as const,
  sectionByFund: (sectionCode: string, fundManagerId: string, dateOfReview: string) =>
    [...noteKeys.all, 'sectionByFund', sectionCode, fundManagerId, dateOfReview] as const,
  tbvFund: (tbvFund: string, vehicleId: string, dateOfReview?: string) =>
    [...noteKeys.all, 'tbvFund', tbvFund, vehicleId, dateOfReview] as const,
  single: (noteId: string) => [...noteKeys.all, 'single', noteId] as const,
  versions: (noteId: string) => [...noteKeys.all, 'versions', noteId] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch notes for a generic entity
 */
export function useNotesForEntity(params: GetNotesParams, enabled: boolean = true) {
  return useQuery({
    queryKey: noteKeys.entity(params),
    queryFn: () => getNotesForEntity(params),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch notes for a project
 */
export function useNotesForProject(
  projectId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.project(projectId, dateOfReview),
    queryFn: () => getNotesForProject(projectId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!projectId,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a vehicle
 */
export function useNotesForVehicle(
  vehicleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.vehicle(vehicleId, dateOfReview),
    queryFn: () => getNotesForVehicle(vehicleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!vehicleId,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a section
 */
export function useNotesForSection(
  sectionCode: string,
  vehicleId: string,
  dateOfReview: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.section(sectionCode, vehicleId, dateOfReview),
    queryFn: () => getNotesForSection(sectionCode, vehicleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!sectionCode && !!vehicleId && !!dateOfReview,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a section scoped by fund_manager_id (for team-level notes)
 */
export function useNotesForSectionByFund(
  sectionCode: string,
  fundManagerId: string,
  dateOfReview: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.sectionByFund(sectionCode, fundManagerId, dateOfReview),
    queryFn: () => getNotesForSectionByFund(sectionCode, fundManagerId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!sectionCode && !!fundManagerId && !!dateOfReview,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a TBV fund
 */
export function useNotesForTbvFund(
  tbvFund: string,
  vehicleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.tbvFund(tbvFund, vehicleId, dateOfReview),
    queryFn: () => getNotesForTbvFund(tbvFund, vehicleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!tbvFund && !!vehicleId,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a specific project update
 * Used in the per-update notes thread in Project Updates timeline
 */
export function useNotesForProjectUpdate(
  projectUpdateId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.projectUpdate(projectUpdateId),
    queryFn: () => getNotesForProjectUpdate(projectUpdateId),
    enabled: enabled && !!projectUpdateId,
    staleTime: 30000,
  });
}

/**
 * Fetch general notes for a project (excluding update-specific notes)
 * Used in the "General Notes" section of Project Card
 */
export function useGeneralNotesForProject(
  projectId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.projectGeneral(projectId, dateOfReview),
    queryFn: () => getGeneralNotesForProject(projectId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!projectId,
    staleTime: 30000,
  });
}

/**
 * Fetch general notes for a vehicle (excluding update-specific notes)
 * Used in the "General Notes" section of Vehicle Card
 */
export function useGeneralNotesForVehicle(
  vehicleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.vehicleGeneral(vehicleId, dateOfReview),
    queryFn: () => getGeneralNotesForVehicle(vehicleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!vehicleId,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a specific vehicle update
 * Used in the per-update notes thread in Vehicle Updates timeline
 */
export function useNotesForVehicleUpdate(
  vehicleUpdateId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.vehicleUpdate(vehicleUpdateId),
    queryFn: () => getNotesForVehicleUpdate(vehicleUpdateId),
    enabled: enabled && !!vehicleUpdateId,
    staleTime: 30000,
  });
}

/**
 * Fetch notes for a person
 */
export function useNotesForPerson(
  peopleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.person(peopleId, dateOfReview),
    queryFn: () => getNotesForPerson(peopleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!peopleId,
    staleTime: 30000,
  });
}

/**
 * Fetch general notes for a person (excluding update-specific notes)
 * Used in the "General Notes" section of People Card
 */
export function useGeneralNotesForPerson(
  peopleId: string,
  dateOfReview?: string,
  includePreviousReviews: boolean = true,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: noteKeys.personGeneral(peopleId, dateOfReview),
    queryFn: () => getGeneralNotesForPerson(peopleId, dateOfReview, includePreviousReviews),
    enabled: enabled && !!peopleId,
    staleTime: 30000,
  });
}

/**
 * Fetch a single note by ID
 */
export function useNote(noteId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: noteKeys.single(noteId),
    queryFn: () => getNote(noteId),
    enabled: enabled && !!noteId,
    staleTime: 30000,
  });
}

/**
 * Fetch version history for a note
 */
export function useNoteVersions(noteId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: noteKeys.versions(noteId),
    queryFn: () => getNoteVersions(noteId),
    enabled: enabled && !!noteId,
    staleTime: 60000, // 1 minute
  });
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new note
 */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateNoteParams) => createNote(params),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: noteKeys.all });

      // If we have specific identifiers, invalidate those specific queries
      if (variables.project_id || variables.record_id_project) {
        const projectId = variables.project_id || variables.record_id_project || '';
        queryClient.invalidateQueries({
          queryKey: noteKeys.project(projectId),
        });
        // Also invalidate general project notes
        queryClient.invalidateQueries({
          queryKey: noteKeys.projectGeneral(projectId),
        });
      }
      if (variables.vehicle_id || variables.record_id_vehicle) {
        const vehicleId = variables.vehicle_id || variables.record_id_vehicle || '';
        queryClient.invalidateQueries({
          queryKey: noteKeys.vehicle(vehicleId),
        });
        // Also invalidate general vehicle notes
        queryClient.invalidateQueries({
          queryKey: noteKeys.vehicleGeneral(vehicleId),
        });
      }
      if (variables.entity_code) {
        queryClient.invalidateQueries({
          queryKey: ['notes', 'section', variables.entity_code],
        });
      }
      // Invalidate project/vehicle update notes if linked to an update
      if (variables.project_update_id) {
        queryClient.invalidateQueries({
          queryKey: noteKeys.projectUpdate(variables.project_update_id),
        });
        // Also invalidate vehicle update (they share the same update ID space)
        queryClient.invalidateQueries({
          queryKey: noteKeys.vehicleUpdate(variables.project_update_id),
        });
      }
      // Invalidate person notes if linked to a person
      if (variables.people_id) {
        queryClient.invalidateQueries({
          queryKey: noteKeys.person(variables.people_id),
        });
        queryClient.invalidateQueries({
          queryKey: noteKeys.personGeneral(variables.people_id),
        });
      }
    },
  });
}

/**
 * Update an existing note
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, params }: { noteId: string; params: UpdateNoteParams }) =>
      updateNote(noteId, params),
    onSuccess: (data, variables) => {
      // Invalidate all notes queries to refresh data
      queryClient.invalidateQueries({ queryKey: noteKeys.all });

      // Invalidate the specific note
      queryClient.invalidateQueries({ queryKey: noteKeys.single(variables.noteId) });

      // Invalidate versions
      queryClient.invalidateQueries({ queryKey: noteKeys.versions(variables.noteId) });
    },
  });
}

/**
 * Delete a note (soft delete)
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, deletedBy }: { noteId: string; deletedBy: string }) =>
      deleteNote(noteId, deletedBy),
    onSuccess: () => {
      // Invalidate all notes queries
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

/**
 * Restore a deleted note
 */
export function useRestoreNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => restoreNote(noteId),
    onSuccess: (data, noteId) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.single(noteId) });
    },
  });
}

/**
 * Revert a note to a previous version
 */
export function useRevertToVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      noteId,
      versionId,
      revertedBy,
    }: {
      noteId: string;
      versionId: string;
      revertedBy: string;
    }) => revertToVersion(noteId, versionId, revertedBy),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.single(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.versions(variables.noteId) });
    },
  });
}

/**
 * Refresh all record ID mappings
 */
export function useRefreshMappings() {
  return useMutation({
    mutationFn: () => refreshRecordIdMappings(),
  });
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook to manage notes refresh
 */
export function useRefreshNotes() {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: noteKeys.all });
  };

  return { refresh };
}

/**
 * Hook to get record_id for a project (with caching)
 */
export function useRecordIdForProject(projectId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['recordId', 'project', projectId],
    queryFn: () => getRecordIdForProject(projectId),
    enabled: enabled && !!projectId,
    staleTime: 300000, // 5 minutes (record IDs don't change often)
  });
}

// ============================================
// Helper to group notes by date_of_review
// ============================================

export function groupNotesByReviewDate(notes: Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();

  for (const note of notes) {
    const key = note.date_of_review;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(note);
  }

  // Sort keys by date (newest first)
  const sortedMap = new Map<string, Note[]>();
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  for (const key of sortedKeys) {
    sortedMap.set(key, grouped.get(key)!);
  }

  return sortedMap;
}
