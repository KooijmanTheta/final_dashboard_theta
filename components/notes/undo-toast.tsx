'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number; // in milliseconds
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  duration = 5000,
}: UndoToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  // Auto-dismiss after duration
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setIsVisible(false);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  const handleUndo = useCallback(() => {
    setIsVisible(false);
    onUndo();
  }, [onUndo]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    onDismiss();
  }, [onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-[#1F2937] text-white rounded-lg shadow-lg',
        'flex items-center gap-3 px-4 py-3 min-w-[300px]',
        'animate-in slide-in-from-bottom-4 fade-in duration-200'
      )}
    >
      {/* Message */}
      <span className="text-sm flex-1">{message}</span>

      {/* Undo Button */}
      <button
        onClick={handleUndo}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 rounded',
          'bg-white/10 hover:bg-white/20 transition-colors',
          'text-sm font-medium'
        )}
      >
        <Undo2 className="w-3.5 h-3.5" />
        Undo
      </button>

      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-b-lg overflow-hidden">
        <div
          className="h-full bg-white/30 transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Hook to manage undo toasts
interface DeletedNote {
  noteId: string;
  message: string;
}

export function useUndoToast() {
  const [deletedNote, setDeletedNote] = useState<DeletedNote | null>(null);

  const showUndoToast = useCallback((noteId: string, message: string = 'Note deleted') => {
    setDeletedNote({ noteId, message });
  }, []);

  const clearToast = useCallback(() => {
    setDeletedNote(null);
  }, []);

  return {
    deletedNote,
    showUndoToast,
    clearToast,
  };
}
