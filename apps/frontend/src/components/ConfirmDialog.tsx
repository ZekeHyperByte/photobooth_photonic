import React from 'react';
import { Button } from './ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * ConfirmDialog
 * Brutalist-style confirmation dialog with backdrop
 * Used for warning users about important actions
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  // Handle ESC key press
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, isLoading, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={isLoading ? undefined : onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-neo-cream border-[4px] border-black shadow-neo-lg p-6 max-w-md w-full">
        {/* Header */}
        <div className="bg-black px-4 py-2 mb-4 -mx-6 -mt-6">
          <h2 className="text-xl font-bold text-neo-yellow">{title}</h2>
        </div>

        {/* Message */}
        <p className="text-base text-black mb-6 leading-relaxed">{message}</p>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            onClick={onCancel}
            variant="secondary"
            size="medium"
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            variant="danger"
            size="medium"
            disabled={isLoading}
            loading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
