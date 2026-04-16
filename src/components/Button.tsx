import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'emerald' | 'secondary' | 'red' | 'blue' | 'zinc' | 'ghost';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'zinc',
  icon,
  loading,
  className,
  disabled,
  ...props
}) => {
  const variants = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    secondary: 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    zinc: 'bg-zinc-600 hover:bg-zinc-700 text-white',
    ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white',
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100',
        variants[variant as keyof typeof variants] || variants.zinc,
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          {icon && <span>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

export default Button;
