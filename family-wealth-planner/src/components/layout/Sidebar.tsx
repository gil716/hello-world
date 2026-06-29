import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ScaleIcon,
  ChartPieIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  CalculatorIcon,
  ShieldCheckIcon,
  BuildingLibraryIcon,
  DocumentDuplicateIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  BoltIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { path: '/', label: 'Dashboard', icon: HomeIcon },
  { path: '/net-worth', label: 'Net Worth', icon: ScaleIcon },
  { path: '/portfolio', label: 'Portfolio', icon: ChartPieIcon },
  { path: '/retirement', label: 'Retirement', icon: ClockIcon },
  { path: '/monte-carlo', label: 'Monte Carlo', icon: ArrowTrendingUpIcon },
  { path: '/taxes', label: 'Taxes', icon: CalculatorIcon },
  { path: '/social-security', label: 'Social Security', icon: ShieldCheckIcon },
  { path: '/estate', label: 'Estate', icon: BuildingLibraryIcon },
  { path: '/scenarios', label: 'Scenarios', icon: DocumentDuplicateIcon },
  { path: '/decisions', label: 'Decision Center', icon: BoltIcon },
  { path: '/cash-flow', label: 'Cash Flow', icon: ChartBarIcon },
  { path: '/ai-advisor', label: 'AI Advisor', icon: ChatBubbleLeftRightIcon },
  { path: '/settings', label: 'Settings', icon: Cog6ToothIcon },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'tween', duration: 0.22 }}
        className={`
          fixed top-0 left-0 h-full w-64 z-30 flex flex-col
          bg-gray-950 border-r border-gray-800
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">FW</span>
              </div>
              <span className="font-bold text-white text-sm tracking-wide">Family Wealth</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 ml-9">Financial Planner</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                ${isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                  <span className="truncate">{label}</span>
                  {label === 'AI Advisor' && (
                    <span className="ml-auto text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full border border-violet-500/20">AI</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">All data stored locally</p>
        </div>
      </motion.aside>
    </>
  );
}
