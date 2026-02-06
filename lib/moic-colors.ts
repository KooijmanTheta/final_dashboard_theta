export const MOIC_BUCKETS = {
  'grand-slam': {
    min: 10,
    max: Infinity,
    label: '>10x (Grand Slam)',
    colorClass: 'moic-grand-slam',
    bgColor: 'bg-emerald-900',
    textColor: 'text-emerald-50',
  },
  'home-run': {
    min: 5,
    max: 10,
    label: '5-10x (Home Run)',
    colorClass: 'moic-home-run',
    bgColor: 'bg-emerald-700',
    textColor: 'text-emerald-50',
  },
  'strong': {
    min: 3,
    max: 5,
    label: '3-5x (Strong)',
    colorClass: 'moic-strong',
    bgColor: 'bg-emerald-500',
    textColor: 'text-white',
  },
  'solid': {
    min: 2,
    max: 3,
    label: '2-3x (Solid)',
    colorClass: 'moic-solid',
    bgColor: 'bg-green-300',
    textColor: 'text-green-900',
  },
  'modest': {
    min: 1,
    max: 2,
    label: '1-2x (Modest)',
    colorClass: 'moic-modest',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  'at-cost': {
    min: 1,
    max: 1,
    label: '1x (At Cost)',
    colorClass: 'moic-at-cost',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
  },
  'loss': {
    min: 0.5,
    max: 1,
    label: '0.5-1x (Loss)',
    colorClass: 'moic-loss',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
  'loss-severe': {
    min: 0,
    max: 0.5,
    label: '<0.5x (Severe Loss)',
    colorClass: 'moic-loss-severe',
    bgColor: 'bg-red-700',
    textColor: 'text-red-50',
  },
  'write-off': {
    min: 0,
    max: 0,
    label: '0x (Write-off)',
    colorClass: 'moic-write-off',
    bgColor: 'bg-red-900',
    textColor: 'text-red-100',
  },
  'missing-cost': {
    min: -1,
    max: -1,
    label: 'Fully Divested / No Cost Basis',
    colorClass: 'moic-missing',
    bgColor: 'bg-gray-200',
    textColor: 'text-gray-600',
  },
  'missing-mv': {
    min: -2,
    max: -2,
    label: 'Write Offs',
    colorClass: 'moic-missing',
    bgColor: 'bg-gray-200',
    textColor: 'text-gray-600',
  },
} as const;

export type MoicBucketKey = keyof typeof MOIC_BUCKETS;

export function getMoicBucket(moic: number | null, hasCost: boolean, hasMV: boolean): MoicBucketKey {
  if (!hasCost) return 'missing-cost';
  if (!hasMV) return 'missing-mv';
  if (moic === null || moic === undefined) return 'missing-cost';

  if (moic === 0) return 'write-off';
  if (moic < 0.5) return 'loss-severe';
  if (moic < 1) return 'loss';
  if (moic === 1) return 'at-cost';
  if (moic < 2) return 'modest';
  if (moic < 3) return 'solid';
  if (moic < 5) return 'strong';
  if (moic < 10) return 'home-run';
  return 'grand-slam';
}

export function getMoicColorClass(moic: number | null, hasCost: boolean = true, hasMV: boolean = true): string {
  const bucket = getMoicBucket(moic, hasCost, hasMV);
  return MOIC_BUCKETS[bucket].colorClass;
}

export function getMoicBgColor(moic: number | null, hasCost: boolean = true, hasMV: boolean = true): string {
  const bucket = getMoicBucket(moic, hasCost, hasMV);
  return `${MOIC_BUCKETS[bucket].bgColor} ${MOIC_BUCKETS[bucket].textColor}`;
}
