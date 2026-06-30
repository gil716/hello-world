import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { formatCurrency } from '../utils/formatters';

type Phase = 'all' | 'working' | 'retirement';

export function YearByYear() {
  const { cashFlows, profile, assumptions } = useFinancialStore();
  const [phase, setPhase] = useState<Phase>('all');
  const [showTable, setShowTable] = useState(true);

  // Augment each cash flow row with derived fields
  const enriched = useMemo(() => cashFlows.map(f => {
    const inflFactor = Math.pow(1 + assumptions.inflationRate / 100, f.age - profile.age);
    // Living expenses: working = pre-retirement spending target; retired = back-out from withdrawals
    const living = f.salary > 0
      ? profile.retirementSpendingBeforeSS * inflFactor
      : Math.max(0, f.withdrawals - f.taxes + f.socialSecurity - f.healthcareCosts - f.mortgagePayment - f.collegeCosts);
    // Savings contributions (working years only)
    const savings = f.salary > 0
      ? f.contribution401k + f.employerMatch + f.iraContribution + f.rothContribution + f.hsaContribution
      : 0;
    const totalIncome = f.salary + f.bonus + f.socialSecurity;
    const totalOut = living + f.taxes + f.healthcareCosts + f.mortgagePayment + f.collegeCosts + savings;
    return { ...f, living, savings, totalIncome, totalOut };
  }), [cashFlows, profile, assumptions]);

  // Charts sample every 2 years for readability; table shows all
  const chartData = useMemo(() => {
    const base = enriched.filter((_, i) => i % 2 === 0);
    if (phase === 'working') return base.filter(f => f.salary > 0);
    if (phase === 'retirement') return base.filter(f => f.salary === 0);
    return base;
  }, [enriched, phase]);

  const tableRows = useMemo(() => {
    if (phase === 'working') return enriched.filter(f => f.salary > 0);
    if (phase === 'retirement') return enriched.filter(f => f.salary === 0);
    return enriched;
  }, [enriched, phase]);

  // Lifetime summary stats
  const stats = useMemo(() => ({
    totalW2: enriched.filter(f => f.salary > 0).reduce((s, f) => s + f.salary + f.bonus, 0),
    totalSS: enriched.reduce((s, f) => s + f.socialSecurity, 0),
    totalTaxes: enriched.reduce((s, f) => s + f.taxes, 0),
    totalHealthcare: enriched.reduce((s, f) => s + f.healthcareCosts, 0),
    totalSavings: enriched.reduce((s, f) => s + f.savings, 0),
    totalLiving: enriched.reduce((s, f) => s + f.living, 0),
  }), [enriched]);

  const ttStyle = { background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 };
  const ttFmt = (v: any, name: any) => [formatCurrency(v as number, true), name as string];
  const ttLabel = (v: any) => `Age ${v}`;
  const axStyle = { fill: '#6b7280', fontSize: 11 };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'W-2 Income', value: stats.totalW2, color: 'text-emerald-400' },
          { label: 'SS Income', value: stats.totalSS, color: 'text-blue-400' },
          { label: 'Taxes Paid', value: stats.totalTaxes, color: 'text-red-400' },
          { label: 'Healthcare', value: stats.totalHealthcare, color: 'text-amber-400' },
          { label: 'Contributions', value: stats.totalSavings, color: 'text-violet-400' },
          { label: 'Living Expenses', value: stats.totalLiving, color: 'text-purple-400' },
        ].map(s => (
          <Card key={s.label} className="p-3">
            <p className="text-xs text-gray-400 truncate">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{formatCurrency(s.value, true)}</p>
            <p className="text-xs text-gray-600 mt-0.5">lifetime</p>
          </Card>
        ))}
      </div>

      {/* Phase + table toggle controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['all', 'working', 'retirement'] as Phase[]).map(p => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all capitalize ${phase === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {p === 'all' ? 'All Years' : p === 'working' ? 'Working' : 'Retirement'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowTable(t => !t)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${showTable ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          {showTable ? 'Hide Table' : 'Show Table'}
        </button>
      </div>

      {/* Income by source */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Income by Source</h3>
        <p className="text-xs text-gray-500 mb-4">Salary, bonus & Social Security — net worth line on right axis</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 60, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="age" tick={axStyle} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={axStyle} axisLine={false} tickLine={false} width={55} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={axStyle} axisLine={false} tickLine={false} width={50} />
            <Tooltip contentStyle={ttStyle} formatter={ttFmt as any} labelFormatter={ttLabel} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="salary" name="Salary" stackId="inc" fill="#10b981" />
            <Bar yAxisId="l" dataKey="bonus" name="Bonus" stackId="inc" fill="#34d399" />
            <Bar yAxisId="l" dataKey="socialSecurity" name="Social Security" stackId="inc" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="netWorth" name="Net Worth" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Spending & savings breakdown */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Spending & Savings by Category</h3>
        <p className="text-xs text-gray-500 mb-4">Outflows each year — contributions counted as savings, not spending</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 60, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="age" tick={axStyle} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={axStyle} axisLine={false} tickLine={false} width={55} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={axStyle} axisLine={false} tickLine={false} width={50} />
            <Tooltip contentStyle={ttStyle} formatter={ttFmt as any} labelFormatter={ttLabel} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="living" name="Living Expenses" stackId="out" fill="#8b5cf6" />
            <Bar yAxisId="l" dataKey="taxes" name="Taxes" stackId="out" fill="#ef4444" />
            <Bar yAxisId="l" dataKey="healthcareCosts" name="Healthcare" stackId="out" fill="#f59e0b" />
            <Bar yAxisId="l" dataKey="mortgagePayment" name="Mortgage" stackId="out" fill="#f97316" />
            <Bar yAxisId="l" dataKey="collegeCosts" name="College" stackId="out" fill="#06b6d4" />
            <Bar yAxisId="l" dataKey="savings" name="Contributions (savings)" stackId="out" fill="#22c55e" radius={[2, 2, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="netWorth" name="Net Worth" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Account balances over time */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Account Balances Over Time</h3>
        <p className="text-xs text-gray-500 mb-4">How each bucket grows and is drawn down</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
            <defs>
              {[['tG', '#3b82f6'], ['rG', '#8b5cf6'], ['xG', '#10b981'], ['cG', '#f59e0b']].map(([id, color]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="age" tick={axStyle} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={axStyle} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={ttStyle} formatter={ttFmt as any} labelFormatter={ttLabel} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="traditionalBalance" name="Traditional" stroke="#3b82f6" fill="url(#tG)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="rothBalance" name="Roth" stroke="#8b5cf6" fill="url(#rG)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="taxableBalance" name="Taxable" stroke="#10b981" fill="url(#xG)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="cashBalance" name="Cash" stroke="#f59e0b" fill="url(#cG)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Year-by-year table */}
      {showTable && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Year-by-Year Detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1200px]">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 uppercase tracking-wide">
                  <th className="px-2 py-2 text-left">Age</th>
                  <th className="px-2 py-2 text-left">Year</th>
                  <th className="px-2 py-2 text-left">Phase</th>
                  <th className="px-2 py-2 text-right text-emerald-500">Salary+Bonus</th>
                  <th className="px-2 py-2 text-right text-blue-500">Soc. Sec.</th>
                  <th className="px-2 py-2 text-right text-blue-400">Inv. Growth</th>
                  <th className="px-2 py-2 text-right text-violet-400">Living</th>
                  <th className="px-2 py-2 text-right text-red-500">Taxes</th>
                  <th className="px-2 py-2 text-right text-amber-500">Healthcare</th>
                  <th className="px-2 py-2 text-right text-orange-500">Mortgage</th>
                  <th className="px-2 py-2 text-right text-cyan-500">College</th>
                  <th className="px-2 py-2 text-right text-green-500">Contributions</th>
                  <th className="px-2 py-2 text-right text-purple-400">Roth Conv.</th>
                  <th className="px-2 py-2 text-right text-white">Net Worth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {tableRows.map(f => {
                  const isRetireYear = f.age === assumptions.retirementAge;
                  const isSSYear = f.age === assumptions.ssClaimAge;
                  const rowCls = isRetireYear
                    ? 'bg-blue-500/10 border-l-2 border-blue-500'
                    : isSSYear
                    ? 'bg-violet-500/10 border-l-2 border-violet-500'
                    : f.salary === 0
                    ? 'bg-gray-900/20'
                    : '';
                  return (
                    <tr key={f.age} className={`hover:bg-gray-800/30 transition-colors ${rowCls}`}>
                      <td className="px-2 py-1.5 font-bold text-white">{f.age}</td>
                      <td className="px-2 py-1.5 text-gray-500">{f.year}</td>
                      <td className="px-2 py-1.5">
                        {isRetireYear ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Retire</span>
                        ) : isSSYear ? (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">SS Start</span>
                        ) : f.salary > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Working</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400">Retired</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-emerald-400">{f.salary > 0 ? formatCurrency(f.salary + f.bonus, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-blue-400">{f.socialSecurity > 0 ? formatCurrency(f.socialSecurity, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-blue-300">{formatCurrency(f.investmentGrowth, true)}</td>
                      <td className="px-2 py-1.5 text-right text-violet-400">{formatCurrency(f.living, true)}</td>
                      <td className="px-2 py-1.5 text-right text-red-400">{formatCurrency(f.taxes, true)}</td>
                      <td className="px-2 py-1.5 text-right text-amber-400">{formatCurrency(f.healthcareCosts, true)}</td>
                      <td className="px-2 py-1.5 text-right text-orange-400">{f.mortgagePayment > 0 ? formatCurrency(f.mortgagePayment, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-cyan-400">{f.collegeCosts > 0 ? formatCurrency(f.collegeCosts, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-green-400">{f.savings > 0 ? formatCurrency(f.savings, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-purple-400">{f.rothConversion > 0 ? formatCurrency(f.rothConversion, true) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-white">{formatCurrency(f.netWorth, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
