import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = '', onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-gray-900/80 border border-gray-700/50 rounded-xl backdrop-blur-sm
        dark:bg-gray-900/80 light:bg-white/90
        ${hover ? 'hover:border-blue-500/50 hover:bg-gray-800/80 cursor-pointer transition-all duration-200' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  accent?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, sub, accent = 'text-blue-400', icon }: StatCardProps) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider truncate">{label}</p>
          <p className={`text-xl sm:text-2xl font-bold mt-1 ${accent} truncate`}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1 truncate">{sub}</p>}
        </div>
        {icon && <div className="ml-3 flex-shrink-0 text-gray-600">{icon}</div>}
      </div>
    </Card>
  );
}
