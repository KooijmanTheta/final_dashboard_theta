export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';

  const absValue = Math.abs(numValue);
  if (absValue >= 1e9) return `$${(numValue / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(numValue / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(numValue / 1e3).toFixed(0)}K`;
  return `$${numValue.toFixed(0)}`;
}

export function formatPercentage(value: number | string | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return '-';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';

  return `${numValue.toFixed(decimals)}%`;
}

export function formatMOIC(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';

  // Handle special cases
  if (numValue === -1) {
    return 'Loan'; // Loan position: cost < 0
  }
  if (!isFinite(numValue)) {
    return '\u221E'; // Infinity symbol: zero cost with MV > 0
  }

  return `${numValue.toFixed(2)}x`;
}

export function formatNumber(value: number | string | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined) return '-';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';

  return numValue.toFixed(decimals);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
