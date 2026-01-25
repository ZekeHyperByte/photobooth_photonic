import React, { useEffect, useCallback, lazy, Suspense } from 'react';
import { useUIStore } from './stores/uiStore';
import { usePhotoStore } from './stores/photoStore';
import { useSessionStore } from './stores/sessionStore';
import { useInactivity } from './hooks/useInactivity';
import { Toast } from './components/ui/Toast';
import { SessionTimer } from './components/SessionTimer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { devLog } from './utils/logger';

// Lazy load all screens for better initial load performance
const IdleScreen = lazy(() => import('./screens/IdleScreen'));
const PaymentMethodScreen = lazy(() => import('./screens/PaymentMethodScreen'));
const CodeVerificationScreen = lazy(() => import('./screens/CodeVerificationScreen'));
const SessionNoticeScreen = lazy(() => import('./screens/SessionNoticeScreen'));
const FrameSelectionScreen = lazy(() => import('./screens/FrameSelectionScreen'));
const MirrorSelectionScreen = lazy(() => import('./screens/MirrorSelectionScreen'));
const CaptureScreen = lazy(() => import('./screens/CaptureScreen'));
const PhotoReviewScreen = lazy(() => import('./screens/PhotoReviewScreen'));
const FilterSelectionScreen = lazy(() => import('./screens/FilterSelectionScreen'));
const ProcessingScreen = lazy(() => import('./screens/ProcessingScreen'));
const PreviewScreen = lazy(() => import('./screens/PreviewScreen'));
const DeliveryScreen = lazy(() => import('./screens/DeliveryScreen'));
const ErrorScreen = lazy(() => import('./screens/ErrorScreen'));

// Simple loading fallback for screen transitions
const ScreenLoader = () => (
  <div className="w-full h-full flex items-center justify-center bg-gray-100">
    <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  devLog('App component rendering...');

  const { currentScreen, resetToIdle } = useUIStore();
  const { resetPhotos } = usePhotoStore();
  const { resetSession } = useSessionStore();
  devLog('Current screen:', currentScreen);

  // Combined reset function that clears all state when returning to idle
  const resetAllState = useCallback(() => {
    devLog('Resetting all state (UI, photos, session)');
    resetToIdle();
    resetPhotos();
    resetSession();
  }, [resetToIdle, resetPhotos, resetSession]);

  // Auto-reset to idle after 60 seconds of inactivity
  useInactivity(60000, resetAllState);

  // Reset all state on mount (fresh start)
  useEffect(() => {
    devLog('App mounted, resetting to idle');
    resetAllState();
  }, []);

  // Simple screen router based on currentScreen state
  const renderScreen = () => {
    devLog('Rendering screen:', currentScreen);
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
      devLog('Error rendering screen:', error);
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
        <Suspense fallback={<ScreenLoader />}>
          {renderScreen()}
        </Suspense>
        <Toast />
        <SessionTimer />
      </div>
    </ErrorBoundary>
  );
};

export default App;
