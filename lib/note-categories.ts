// Note category definitions and colors

export type NoteCategory =
  | 'action_item'
  | 'observation'
  | 'conclusion'
  | 'risk_flag'
  | 'follow_up'
  | 'question'
  | 'positive_signal'
  | 'update'
  | 'reference'
  | 'internal';

export interface NoteCategoryConfig {
  value: NoteCategory;
  label: string;
  description: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const NOTE_CATEGORIES: Record<NoteCategory, NoteCategoryConfig> = {
  action_item: {
    value: 'action_item',
    label: 'Action Item',
    description: 'Task that needs to be completed',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    borderColor: 'border-orange-300',
  },
  observation: {
    value: 'observation',
    label: 'Observation',
    description: 'Factual observation about data',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300',
  },
  conclusion: {
    value: 'conclusion',
    label: 'Conclusion',
    description: 'Summary or conclusion',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-300',
  },
  risk_flag: {
    value: 'risk_flag',
    label: 'Risk Flag',
    description: 'Potential risk or concern',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    borderColor: 'border-red-300',
  },
  follow_up: {
    value: 'follow_up',
    label: 'Follow-up',
    description: 'Item to follow up on later',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
  },
  question: {
    value: 'question',
    label: 'Question',
    description: 'Open question to be answered',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-800',
    borderColor: 'border-cyan-300',
  },
  positive_signal: {
    value: 'positive_signal',
    label: 'Positive Signal',
    description: 'Good news or positive development',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-300',
  },
  update: {
    value: 'update',
    label: 'Update',
    description: 'General status update',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    borderColor: 'border-gray-300',
  },
  reference: {
    value: 'reference',
    label: 'Reference',
    description: 'Link to external information',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-800',
    borderColor: 'border-indigo-300',
  },
  internal: {
    value: 'internal',
    label: 'Internal',
    description: 'Internal team communication',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-300',
  },
};

// Get category config by value
export function getCategoryConfig(category: NoteCategory): NoteCategoryConfig {
  return NOTE_CATEGORIES[category] || NOTE_CATEGORIES.update;
}

// Get all categories as array for dropdowns
export function getCategoryOptions(): NoteCategoryConfig[] {
  return Object.values(NOTE_CATEGORIES);
}

// Validate if a string is a valid category
export function isValidCategory(category: string): category is NoteCategory {
  return category in NOTE_CATEGORIES;
}
