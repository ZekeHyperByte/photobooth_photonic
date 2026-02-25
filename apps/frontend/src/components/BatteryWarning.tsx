import { useEffect, useState, memo } from "react";
import { X, BatteryWarning } from "./icons";

interface BatteryWarningToastProps {
  level: number;
  threshold?: number;
  onDismiss?: () => void;
}

/**
 * Battery Warning Toast Component
 * Shows a dismissible warning when battery is low
 */
export const BatteryWarningToast = memo(function BatteryWarningToast({
  level,
  threshold = 20,
  onDismiss,
}: BatteryWarningToastProps) {
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Reset visibility when battery drops below threshold again
    if (level <= threshold && dismissed) {
      setDismissed(false);
      setVisible(true);
    }
  }, [level, threshold, dismissed]);

  if (!visible || dismissed || level > threshold) {
    return null;
  }

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="bg-amber-50 border-2 border-amber-400 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <BatteryWarning className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-900">
              Low Battery Warning
            </h3>
            <p className="mt-1 text-sm text-amber-800">
              Camera battery is at {level}%. Please charge soon to avoid
              interruption.
            </p>
            <div className="mt-2 w-full bg-amber-200 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${level}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-amber-600 hover:text-amber-800 transition-colors"
            aria-label="Dismiss warning"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default BatteryWarningToast;
