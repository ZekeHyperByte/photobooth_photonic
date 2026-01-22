import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick }) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-none border-[3px] border-black shadow-neo-lg p-4',
        onClick && 'cursor-pointer hover:translate-x-1 hover:translate-y-1 hover:shadow-neo transition-all duration-100 active:translate-x-2 active:translate-y-2 active:shadow-neo-sm',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
