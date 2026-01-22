import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { sessionService } from '../services/sessionService';

export const useSession = () => {
  const { session, selectedPackage, setSession, setSelectedPackage, resetSession } = useSessionStore();
  const { showToast } = useUIStore();

  const createSession = async (packageId: string) => {
    try {
      const newSession = await sessionService.createSession(packageId);
      setSession(newSession);
      return newSession;
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Gagal membuat sesi. Silakan coba lagi.',
      });
      throw error;
    }
  };

  const updateSession = async (sessionId: string, updates: any) => {
    try {
      const updatedSession = await sessionService.updateSession(
        sessionId,
        updates
      );
      setSession(updatedSession);
      return updatedSession;
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  };

  return {
    session,
    selectedPackage,
    setSelectedPackage,
    createSession,
    updateSession,
    resetSession,
  };
};
