'use client';

import { cn } from '@/lib/utils';
import { NoteCategory, getCategoryConfig } from '@/lib/note-categories';

interface NoteCategoryBadgeProps {
  category: NoteCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function NoteCategoryBadge({
  category,
  size = 'sm',
  className,
}: NoteCategoryBadgeProps) {
  const config = getCategoryConfig(category);

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md',
        config.bgColor,
        config.textColor,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </span>
  );
}

// Compact version for lists
export function NoteCategoryDot({
  category,
  className,
}: {
  category: NoteCategory;
  className?: string;
}) {
  const config = getCategoryConfig(category);

  // Map bg colors to fill colors
  const dotColors: Record<string, string> = {
    'bg-orange-100': 'bg-orange-500',
    'bg-blue-100': 'bg-blue-500',
    'bg-purple-100': 'bg-purple-500',
    'bg-red-100': 'bg-red-500',
    'bg-yellow-100': 'bg-yellow-500',
    'bg-cyan-100': 'bg-cyan-500',
    'bg-green-100': 'bg-green-500',
    'bg-gray-100': 'bg-gray-500',
    'bg-indigo-100': 'bg-indigo-500',
    'bg-slate-100': 'bg-slate-500',
  };

  const dotColor = dotColors[config.bgColor] || 'bg-gray-500';

  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full', dotColor, className)}
      title={config.label}
    />
  );
}
