import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useFinancialStore } from '../../store/useFinancialStore';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/net-worth': 'Net Worth',
  '/portfolio': 'Portfolio',
  '/retirement': 'Retirement Planner',
  '/monte-carlo': 'Monte Carlo Simulation',
  '/taxes': 'Tax Planner',
  '/social-security': 'Social Security',
  '/estate': 'Estate Planner',
  '/scenarios': 'Scenario Manager',
  '/decisions': 'Decision Center',
  '/cash-flow': 'Cash Flow Timeline',
  '/year-by-year': 'Year by Year',
  '/ai-advisor': 'AI Advisor',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { recalculate, cashFlows } = useFinancialStore();

  useEffect(() => {
    if (cashFlows.length === 0) {
      recalculate();
    }
  }, []);

  const title = PAGE_TITLES[location.pathname] ?? 'Family Wealth Planner';

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
