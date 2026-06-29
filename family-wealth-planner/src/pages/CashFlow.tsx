import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { formatCurrency } from '../utils/formatters';

export function CashFlow() {
  const { cashFlows, assumptions } = useFinancialStore();
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const chartData = cashFlows.filter((_, i) => i % 2 === 0).map(f => ({
    age: f.age,
    income: f.salary + f.bonus + f.socialSecurity,
    expenses: f.taxes + f.healthcareCosts + f.mortgagePayment + f.collegeCosts,
    netWorth: f.netWorth / 10, // Scale for readability
    withdrawals: f.withdrawals,
    growth: f.investmentGrowth / 5,
  }));

  const working = cashFlows.filter(f => f.salary > 0);
  const retired = cashFlows.filter(f => f.salary === 0 && f.age < assumptions.lifeExpectancy);

  const totalSalary = working.reduce((s, f) => s + f.salary + f.bonus, 0);
  const totalSS = retired.reduce((s, f) => s + f.socialSecurity, 0);
  const totalTaxes = cashFlows.reduce((s, f) => s + f.taxes, 0);
  const totalHealthcare = cashFlows.reduce((s, f) => s + f.healthcareCosts, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Lifetime Earnings', value: formatCurrency(totalSalary, true), color: 'text-emerald-400' },
            { label: 'Lifetime SS', value: formatCurrency(totalSS, true), color: 'text-blue-400' },
            { label: 'Lifetime Taxes', value: formatCurrency(totalTaxes, true), color: 'text-red-400' },
            { label: 'Lifetime Healthcare', value: formatCurrency(totalHealthcare, true), color: 'text-amber-400' },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-2 ml-4 flex-shrink-0">
          {(['chart', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Income & Expense Timeline</h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <defs>
                {[
                  { id: 'incomeGrad', color: '#10b981' },
                  { id: 'expGrad', color: '#ef4444' },
                  { id: 'wdGrad', color: '#f59e0b' },
                ].map(g => (
                  <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={g.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={g.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any, name: any) => [formatCurrency(v, true), name as string]}
                labelFormatter={v => `Age ${v}`}
              />
              <Legend />
              <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="withdrawals" name="Withdrawals" stroke="#f59e0b" fill="url(#wdGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {view === 'table' && (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Age', 'Year', 'Salary', 'SS', 'Taxes', 'Healthcare', 'Mortgage', 'Withdrawals', 'Roth Conv.', 'Investment Growth', 'Net Worth'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {cashFlows.map(f => (
                  <tr key={f.age} className={`hover:bg-gray-800/30 transition-colors ${f.age === assumptions.retirementAge ? 'bg-blue-500/5 border-l-2 border-blue-500' : ''}`}>
                    <td className="px-2 py-1.5 font-bold text-white">{f.age}</td>
                    <td className="px-2 py-1.5 text-gray-500">{f.year}</td>
                    <td className="px-2 py-1.5 text-emerald-400">{f.salary > 0 ? formatCurrency(f.salary + f.bonus, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-blue-400">{f.socialSecurity > 0 ? formatCurrency(f.socialSecurity, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-red-400">{formatCurrency(f.taxes, true)}</td>
                    <td className="px-2 py-1.5 text-amber-400">{formatCurrency(f.healthcareCosts, true)}</td>
                    <td className="px-2 py-1.5 text-orange-400">{f.mortgagePayment > 0 ? formatCurrency(f.mortgagePayment, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-yellow-400">{f.withdrawals > 0 ? formatCurrency(f.withdrawals, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-violet-400">{f.rothConversion > 0 ? formatCurrency(f.rothConversion, true) : '—'}</td>
                    <td className="px-2 py-1.5 text-blue-300">{formatCurrency(f.investmentGrowth, true)}</td>
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
