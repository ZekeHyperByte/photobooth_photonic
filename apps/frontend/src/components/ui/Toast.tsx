import React, { useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import clsx from 'clsx';

export const Toast: React.FC = () => {
  const { toast, hideToast } = useUIStore();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        hideToast();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  if (!toast) return null;

  const variantClasses = {
    success: 'bg-neo-lime text-black',
    error: 'bg-neo-magenta text-black',
    info: 'bg-neo-cyan text-black',
    warning: 'bg-neo-yellow text-black',
  };

  return (
    <div className="fixed top-8 right-8 z-50 animate-slide-in-right">
      <div
        className={clsx(
          'px-8 py-4 rounded-none border-4 border-black shadow-neo text-xl font-bold',
          variantClasses[toast.type]
        )}
      >
        {toast.message}
      </div>
    </div>
  );
};
