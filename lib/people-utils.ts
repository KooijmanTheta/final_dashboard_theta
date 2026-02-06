/**
 * Utility functions for people card and team features
 */

/**
 * Format experience duration from timePeriod object
 */
export function formatExperienceDuration(
  startDate?: { year: number; month?: number },
  endDate?: { year: number; month?: number } | null
): string {
  if (!startDate?.year) return '';

  const startStr = startDate.month
    ? `${startDate.month}/${startDate.year}`
    : `${startDate.year}`;

  if (!endDate) {
    return `${startStr} - Present`;
  }

  const endStr = endDate.month
    ? `${endDate.month}/${endDate.year}`
    : `${endDate.year}`;

  return `${startStr} - ${endStr}`;
}

/**
 * Get status label for a person
 */
export function getPersonStatus(leavingYear: number | null): {
  label: string;
  isActive: boolean;
} {
  if (leavingYear === null) {
    return { label: 'Active', isActive: true };
  }
  return { label: `Departed (${leavingYear})`, isActive: false };
}

/**
 * Calculate review period years from date range
 */
export function getReviewPeriodYears(
  dateOfReview: string,
  yearsBack: number = 2
): { start: number; end: number } {
  const endYear = new Date(dateOfReview).getFullYear();
  const startYear = endYear - yearsBack;
  return { start: startYear, end: endYear };
}
