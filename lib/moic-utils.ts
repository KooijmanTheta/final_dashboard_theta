/**
 * MOIC bucket utilities for color coding
 */

/**
 * Calculate MOIC safely, handling zero/negative cost edge cases.
 * Returns Infinity when cost <= 0 but MV > 0 (formatMOIC renders as ∞).
 * Returns 0 when both cost and MV are zero or MV is zero.
 */
export function calculateMOIC(totalMV: number, cost: number): number {
  if (cost > 0) return totalMV / cost;
  if (totalMV > 0) return Infinity;
  return 0;
}

/**
 * Get MOIC bucket for color coding
 */
export function getMOICBucket(moic: number | null | undefined): string {
  // Handle edge cases
  if (moic === null || moic === undefined || isNaN(moic) || !isFinite(moic)) {
    return 'unknown';
  }
  if (moic >= 10) return 'grand_slam';
  if (moic >= 5) return 'home_run';
  if (moic >= 2) return 'doubles';
  if (moic > 1) return 'base_hit';
  if (moic === 1) return 'cost';
  if (moic === 0) return 'write_off';
  return 'loss';
}

/**
 * Get MOIC bucket color class
 */
export function getMOICColorClass(moic: number | null | undefined): string {
  const bucket = getMOICBucket(moic);
  const colors: Record<string, string> = {
    grand_slam: 'bg-emerald-900 text-white',
    home_run: 'bg-emerald-700 text-white',
    doubles: 'bg-emerald-500 text-white',
    base_hit: 'bg-green-300 text-gray-900',
    cost: 'bg-gray-200 text-gray-900',
    loss: 'bg-red-300 text-gray-900',
    write_off: 'bg-red-900 text-white',
    unknown: 'bg-gray-100 text-gray-500',
  };
  return colors[bucket] || 'bg-gray-100';
}
