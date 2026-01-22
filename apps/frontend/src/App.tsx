import React, { useEffect, useCallback } from 'react';
import { useUIStore } from './stores/uiStore';
import { usePhotoStore } from './stores/photoStore';
import { useSessionStore } from './stores/sessionStore';
import { useInactivity } from './hooks/useInactivity';
import { Toast } from './components/ui/Toast';
import { SessionTimer } from './components/SessionTimer';
import { ErrorBoundary } from './components/ErrorBoundary';

// Import all screens
import IdleScreen from './screens/IdleScreen';
import PaymentMethodScreen from './screens/PaymentMethodScreen';
import CodeVerificationScreen from './screens/CodeVerificationScreen';
import SessionNoticeScreen from './screens/SessionNoticeScreen';
import FrameSelectionScreen from './screens/FrameSelectionScreen';
import MirrorSelectionScreen from './screens/MirrorSelectionScreen';
import CaptureScreen from './screens/CaptureScreen';
import PhotoReviewScreen from './screens/PhotoReviewScreen';
import FilterSelectionScreen from './screens/FilterSelectionScreen';
import ProcessingScreen from './screens/ProcessingScreen';
import PreviewScreen from './screens/PreviewScreen';
import DeliveryScreen from './screens/DeliveryScreen';
import ErrorScreen from './screens/ErrorScreen';

const App: React.FC = () => {
  console.log('App component rendering...');

  const { currentScreen, resetToIdle } = useUIStore();
  const { resetPhotos } = usePhotoStore();
  const { resetSession } = useSessionStore();
  console.log('Current screen:', currentScreen);

  // Combined reset function that clears all state when returning to idle
  const resetAllState = useCallback(() => {
    console.log('Resetting all state (UI, photos, session)');
    resetToIdle();
    resetPhotos();
    resetSession();
  }, [resetToIdle, resetPhotos, resetSession]);

  // Auto-reset to idle after 60 seconds of inactivity
  useInactivity(60000, resetAllState);

  // Reset all state on mount (fresh start)
  useEffect(() => {
    console.log('App mounted, resetting to idle');
    resetAllState();
  }, []);

  // Simple screen router based on currentScreen state
  const renderScreen = () => {
    console.log('Rendering screen:', currentScreen);
    try {
      switch (currentScreen) {
        case 'idle':
          return <IdleScreen />;
        case 'payment-method':
          return <PaymentMethodScreen />;
        case 'code-entry':
          return <CodeVerificationScreen />;
        case 'session-notice':
          return <SessionNoticeScreen />;
        case 'frame-selection':
          return <FrameSelectionScreen />;
        case 'mirror-selection':
          return <MirrorSelectionScreen />;
        case 'capture':
          return <CaptureScreen />;
        case 'photo-review':
          return <PhotoReviewScreen />;
        case 'filter-selection':
          return <FilterSelectionScreen />;
        case 'processing':
          return <ProcessingScreen />;
        case 'preview':
          return <PreviewScreen />;
        case 'delivery':
          return <DeliveryScreen />;
        case 'error':
          return <ErrorScreen />;
        default:
          return <IdleScreen />;
      }
    } catch (error) {
      console.error('Error rendering screen:', error);
      return (
        <div style={{ padding: '2rem', color: 'red' }}>
          <h1>Error rendering screen: {currentScreen}</h1>
          <pre>{error instanceof Error ? error.message : String(error)}</pre>
        </div>
      );
    }
  };

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen overflow-hidden bg-gray-100">
        {renderScreen()}
        <Toast />
        <SessionTimer />
      </div>
    </ErrorBoundary>
  );
};

export default App;
