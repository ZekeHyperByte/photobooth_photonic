import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useUIStore } from './stores/uiStore';
import { useInactivity } from './hooks/useInactivity';
import { Toast } from './components/ui/Toast';
// Import all screens
import IdleScreen from './screens/IdleScreen';
import PackageScreen from './screens/PackageScreen';
import PaymentScreen from './screens/PaymentScreen';
import CaptureScreen from './screens/CaptureScreen';
import ProcessingScreen from './screens/ProcessingScreen';
import PreviewScreen from './screens/PreviewScreen';
import DeliveryScreen from './screens/DeliveryScreen';
import ErrorScreen from './screens/ErrorScreen';
const App = () => {
    const { currentScreen, resetToIdle } = useUIStore();
    // Auto-reset to idle after 60 seconds of inactivity
    useInactivity(60000, resetToIdle);
    // Reset all state on mount (fresh start)
    useEffect(() => {
        resetToIdle();
    }, []);
    // Simple screen router based on currentScreen state
    const renderScreen = () => {
        switch (currentScreen) {
            case 'idle':
                return _jsx(IdleScreen, {});
            case 'package':
                return _jsx(PackageScreen, {});
            case 'payment':
                return _jsx(PaymentScreen, {});
            case 'capture':
                return _jsx(CaptureScreen, {});
            case 'processing':
                return _jsx(ProcessingScreen, {});
            case 'preview':
                return _jsx(PreviewScreen, {});
            case 'delivery':
                return _jsx(DeliveryScreen, {});
            case 'error':
                return _jsx(ErrorScreen, {});
            default:
                return _jsx(IdleScreen, {});
        }
    };
    return (_jsxs("div", { className: "w-screen h-screen overflow-hidden bg-gray-100", children: [renderScreen(), _jsx(Toast, {})] }));
};
export default App;
