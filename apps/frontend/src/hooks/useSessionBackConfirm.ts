import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';

/**
 * useSessionBackConfirm
 * Hook to handle back navigation with confirmation when session is active
 *
 * When the session timer is active and user tries to go back, shows a
 * confirmation dialog warning that the token will be counted as used.
 *
 * @param targetScreen - The screen to navigate to when going back
 * @returns Object containing handleBack function and dialog state
 */
export const useSessionBackConfirm = (targetScreen: string = 'code-entry') => {
  const { sessionTimer, resetSession } = useSessionStore();
  const { setScreen } = useUIStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleBack = () => {
    // If session timer is active, show confirmation dialog
    if (sessionTimer.isActive) {
      setShowConfirmDialog(true);
    } else {
      // If session hasn't started, navigate immediately
      setScreen(targetScreen);
    }
  };

  const handleConfirm = () => {
    setShowConfirmDialog(false);
    resetSession(); // Stops timer and clears session data
    setScreen(targetScreen);
  };

  const handleCancel = () => {
    setShowConfirmDialog(false);
  };

  return {
    handleBack,
    showConfirmDialog,
    handleConfirm,
    handleCancel,
  };
};
