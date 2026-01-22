import React from 'react';
import clsx from 'clsx';

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  onSubmit?: () => void;
  disabled?: boolean;
  showConfirm?: boolean;
  compact?: boolean;
}

export const NumPad: React.FC<NumPadProps> = ({
  value,
  onChange,
  maxLength = 10,
  onSubmit,
  disabled = false,
  showConfirm = true,
  compact = false,
}) => {
  const handleDigit = (digit: string) => {
    if (disabled) return;
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const handleConfirm = () => {
    if (disabled) return;
    onSubmit?.();
  };

  const buttonBaseClasses = clsx(
    'font-bold border-black shadow-neo transition-all duration-100 touch-manipulation active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-neo select-none',
    compact
      ? 'min-h-[54px] text-2xl border-[2px]'
      : 'min-h-[72px] text-3xl border-[3px]'
  );

  const digitButtonClasses = clsx(
    buttonBaseClasses,
    'bg-white hover:bg-gray-100'
  );

  const actionButtonClasses = clsx(
    buttonBaseClasses,
    'bg-neo-yellow hover:bg-yellow-300'
  );

  const confirmButtonClasses = clsx(
    buttonBaseClasses,
    'bg-neo-lime hover:bg-lime-300'
  );

  const renderButton = (
    content: React.ReactNode,
    onClick: () => void,
    className: string,
    ariaLabel?: string
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );

  return (
    <div className={clsx('grid grid-cols-3', compact ? 'gap-2' : 'gap-3')}>
      {/* Row 1: 1, 2, 3 */}
      {renderButton('1', () => handleDigit('1'), digitButtonClasses)}
      {renderButton('2', () => handleDigit('2'), digitButtonClasses)}
      {renderButton('3', () => handleDigit('3'), digitButtonClasses)}

      {/* Row 2: 4, 5, 6 */}
      {renderButton('4', () => handleDigit('4'), digitButtonClasses)}
      {renderButton('5', () => handleDigit('5'), digitButtonClasses)}
      {renderButton('6', () => handleDigit('6'), digitButtonClasses)}

      {/* Row 3: 7, 8, 9 */}
      {renderButton('7', () => handleDigit('7'), digitButtonClasses)}
      {renderButton('8', () => handleDigit('8'), digitButtonClasses)}
      {renderButton('9', () => handleDigit('9'), digitButtonClasses)}

      {/* Row 4: Backspace, 0, Confirm */}
      {renderButton('⌫', handleBackspace, actionButtonClasses, 'Backspace')}
      {renderButton('0', () => handleDigit('0'), digitButtonClasses)}
      {showConfirm ? (
        renderButton('✓', handleConfirm, confirmButtonClasses, 'Confirm')
      ) : (
        <div /> // Empty placeholder
      )}
    </div>
  );
};
