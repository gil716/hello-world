import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { formatCurrency } from '../utils/formatters';
import { projectCashFlows, calculateNetWorth } from '../engine/financialCalculations';

export function CashFlow() {
  const { cashFlows: storeCashFlows, profile, assets, assumptions } = useFinancialStore();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [localReturn, setLocalReturn] = useState(assumptions.expectedReturn);

  // Recompute cash flows locally when return rate dial changes
  const cashFlows = useMemo(() => {
    if (localReturn === assumptions.expectedReturn) return storeCashFlows;
    return projectCashFlows(profile, assets, { ...assumptions, expectedReturn: localReturn });
  }, [localReturn, assumptions, profile, assets, storeCashFlows]);

  // Enrich each row with computed living expenses and total expenses
  const enriched = useMemo(() => cashFlows.map(f => {
    const living = f.salary > 0
      ? profile.retirementSpendingBeforeSS
      : (f.socialSecurity > 0 ? profile.retirementSpendingAfterSS : profile.retirementSpendingBeforeSS);
    const totalExpenses = living + f.taxes + f.healthcareCosts + f.mortgagePayment + f.collegeCosts;
    // endingBalance = traditional + roth + taxable + cash (excludes home equity)
    const liquidAssets = f.endingBalance;
    return { ...f, living, totalExpenses, liquidAssets };
  }), [cashFlows, profile]);

  const currentNetWorth = calculateNetWorth(assets);
  const currentLiquid = assets.traditionalIRA + assets.k401 + assets.rothIRA + assets.hsa +
    assets.taxableBrokerage + assets.companyEquity + assets.espp + assets.cash;

  // Sample every 2 years for chart readability
  const chartData = enriched.filter((_, i) => i % 2 === 0).map(f => ({
    age: f.age,
    income: f.salary + f.bonus + f.socialSecurity,
    expenses: f.totalExpenses,
    withdrawals: f.withdrawals,
    liquidAssets: f.liquidAssets,
    netWorth: f.netWorth,
  }));

  const working = enriched.filter(f => f.salary > 0);
  const retired = enriched.filter(f => f.salary === 0 && f.age < assumptions.lifeExpectancy);

  const totalSalary = working.reduce((s, f) => s + f.salary + f.bonus, 0);
  const totalSS = retired.reduce((s, f) => s + f.socialSecurity, 0);
  const totalTaxes = enriched.reduce((s, f) => s + f.taxes, 0);
  const totalExpenses = enriched.reduce((s, f) => s + f.totalExpenses, 0);

  return (
    <div className="space-y-5">
      {/* Current balances + return dial */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex gap-3 flex-shrink-0">
          <Card className="p-3">
            <p className="text-xs text-gray-400">Net Worth (Today)</p>
            <p className="text-lg font-bold text-white">{formatCurrency(currentNetWorth, true)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-gray-400">Liquid Assets (Today)</p>
            <p className="text-lg font-bold text-blue-400">{formatCurrency(currentLiquid, true)}</p>
          </Card>
        </div>

        <Card className="p-3 flex-1">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400 whitespace-nowrap">Annual Investment Return</p>
            <input
              type="range"
              min={2}
              max={12}
              step={0.5}
              value={localReturn}
              onChange={e => setLocalReturn(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-bold text-blue-400 w-12 text-right">{localReturn}%</span>
          </div>
        </Card>
      </div>

      {/* Summary cards */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Lifetime Earnings', value: formatCurrency(totalSalary, true), color: 'text-emerald-400' },
            { label: 'Lifetime SS', value: formatCurrency(totalSS, true), color: 'text-blue-400' },
            { label: 'Lifetime Taxes', value: formatCurrency(totalTaxes, true), color: 'text-red-400' },
            { label: 'Lifetime Expenses', value: formatCurrency(totalExpenses, true), color: 'text-amber-400' },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-2 ml-4 flex-shrink-0">
          {(['chart', 'table'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Income, Expenses, Liquid Assets & Net Worth</h3>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tickFormatter={v => formatCurrency(v, true)}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={v => formatCurrency(v, true)}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any, name: any) => [formatCurrency(v as number, true), name as string]}
                labelFormatter={v => `Age ${v}`}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="income" name="Income" fill="#10b981" opacity={0.8} />
              <Bar yAxisId="left" dataKey="expenses" name="Expenses" fill="#ef4444" opacity={0.8} />
              <Bar yAxisId="left" dataKey="withdrawals" name="Withdrawals" fill="#f59e0b" opacity={0.8} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="liquidAssets"
                name="Liquid Assets"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="netWorth"
                name="Net Worth"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {view === 'table' && (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1050px]">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Age', 'Year', 'Income', 'SS', 'Expenses', 'Taxes', 'Mortgage', 'Withdrawals', 'Roth Conv.', 'Inv. Growth', 'Liquid Assets', 'Net Worth'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {enriched.map(f => (
                  <tr
                    key={f.age}
                    className={`hover:bg-gray-800/30 transition-colors ${f.age === assumptions.retirementAge ? 'bg-blue-500/5 border-l-2 border-blue-500' : ''}`}
                  >
                    <td className="px-2 py-1.5 font-bold text-white">{f.age}</td>
                    <td className="px-2 py-1.5 text-gray-500">{f.year}</td>
                    <td className="px-2 py-1.5 text-emerald-400">{f.salary > 0 ? formatCurrency(f.salary + f.bonus, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-blue-400">{f.socialSecurity > 0 ? formatCurrency(f.socialSecurity, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-amber-400">{formatCurrency(f.totalExpenses, true)}</td>
                    <td className="px-2 py-1.5 text-red-400">{formatCurrency(f.taxes, true)}</td>
                    <td className="px-2 py-1.5 text-orange-400">{f.mortgagePayment > 0 ? formatCurrency(f.mortgagePayment, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-yellow-400">{f.withdrawals > 0 ? formatCurrency(f.withdrawals, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-violet-400">{f.rothConversion > 0 ? formatCurrency(f.rothConversion, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-blue-300">{formatCurrency(f.investmentGrowth, true)}</td>
                    <td className="px-2 py-1.5 font-medium text-purple-300">{formatCurrency(f.liquidAssets, true)}</td>
                    <td className="px-2 py-1.5 font-medium text-white">{formatCurrency(f.netWorth, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
