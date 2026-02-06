'use client';

import { useQuery } from '@tanstack/react-query';
import { getProjectUpdates, getProjectUpdate, countProjectUpdates, ProjectUpdate } from '@/actions/project-updates';

// ============================================
// Query Keys
// ============================================

export const projectUpdateKeys = {
  all: ['projectUpdates'] as const,
  project: (projectId: string) => [...projectUpdateKeys.all, 'project', projectId] as const,
  single: (updateId: string) => [...projectUpdateKeys.all, 'single', updateId] as const,
  count: (projectId: string) => [...projectUpdateKeys.all, 'count', projectId] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch all project updates for a project
 * @param projectId - The project ID (human-readable name like "Polymarket (dba: Blockratize)")
 * @param enabled - Whether the query should run
 */
export function useProjectUpdates(
  projectId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: projectUpdateKeys.project(projectId),
    queryFn: () => getProjectUpdates(projectId),
    enabled: enabled && !!projectId,
    staleTime: 60000, // 1 minute - updates don't change often
    gcTime: 300000, // 5 minutes
  });
}

/**
 * Fetch a single project update by ID
 * @param updateId - The update ID
 * @param enabled - Whether the query should run
 */
export function useProjectUpdate(
  updateId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: projectUpdateKeys.single(updateId),
    queryFn: () => getProjectUpdate(updateId),
    enabled: enabled && !!updateId,
    staleTime: 60000,
    gcTime: 300000,
  });
}

/**
 * Count project updates for a project
 * @param projectId - The project ID (human-readable name)
 * @param enabled - Whether the query should run
 */
export function useProjectUpdatesCount(
  projectId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: projectUpdateKeys.count(projectId),
    queryFn: () => countProjectUpdates(projectId),
    enabled: enabled && !!projectId,
    staleTime: 60000,
    gcTime: 300000,
  });
}

// Re-export types
export type { ProjectUpdate };
