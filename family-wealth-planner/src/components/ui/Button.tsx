import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  icon?: ReactNode;
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border-transparent',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-gray-200 border-transparent',
  danger: 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border-red-600/30',
};

const sizes = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export function Button({ variant = 'secondary', size = 'md', children, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-lg border
        transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/40
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
