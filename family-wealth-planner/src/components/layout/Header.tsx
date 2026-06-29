import { Bars3Icon, SunIcon, MoonIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useFinancialStore } from '../../store/useFinancialStore';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { theme, toggleTheme, exportData, isCalculating } = useFinancialStore();

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `family-wealth-plan-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-gray-400 hover:text-white transition-colors"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-semibold text-white">{title}</h1>
        {isCalculating && (
          <span className="text-xs text-blue-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Calculating...
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-gray-800 rounded-lg"
          title="Export data as JSON"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
        </button>
        <button
          onClick={toggleTheme}
          className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-gray-800 rounded-lg"
          title="Toggle theme"
        >
          {theme.mode === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
