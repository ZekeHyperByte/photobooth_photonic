import React from 'react';
import clsx from 'clsx';

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'medium', className }) => {
  const blockSize = {
    small: 'w-3 h-3',
    medium: 'w-5 h-5',
    large: 'w-8 h-8',
  };

  return (
    <div className={clsx('flex gap-2', className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={clsx(
            blockSize[size],
            'bg-black border-2 border-black',
            'animate-bounce'
          )}
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.6s',
          }}
        />
      ))}
    </div>
  );
};
