import React from 'react';
import clsx from 'clsx';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  className,
}) => {
  const baseClasses = 'rounded-none font-bold border-[3px] border-black shadow-neo transition-all duration-100 touch-manipulation active:translate-x-[5px] active:translate-y-[5px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-neo';

  const variantClasses = {
    primary: 'bg-neo-yellow text-black hover:bg-yellow-300',
    secondary: 'bg-neo-cyan text-black hover:bg-cyan-300',
    danger: 'bg-neo-magenta text-black hover:bg-pink-400',
    success: 'bg-neo-lime text-black hover:bg-lime-300',
  };

  const sizeClasses = {
    small: 'min-w-[100px] min-h-[48px] text-base px-4 py-2',
    medium: 'min-w-[130px] min-h-[56px] text-lg px-5 py-3',
    large: 'min-w-[160px] min-h-[64px] text-xl px-6 py-3',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
