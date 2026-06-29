import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Slider } from '../components/ui/Slider';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';
import { compareRetirementAges } from '../engine/financialCalculations';
import { runMonteCarloForProbability } from '../engine/monteCarlo';

export function Retirement() {
  const { profile, assets, assumptions, monteCarloResult, updateAssumptions, updateProfile } = useFinancialStore();
  const [activeTab, setActiveTab] = useState<'inputs' | 'optimizer'>('inputs');

  const comparison = useMemo(() => {
    return compareRetirementAges(profile, assets, assumptions, runMonteCarloForProbability);
  }, [profile, assets, assumptions]);

  const ssOptions: Array<{ age: 62 | 65 | 66 | 67 | 70; benefit: number }> = [
    { age: 62, benefit: 53568 },
    { age: 65, benefit: 66114 },
    { age: 66, benefit: 71262 },
    { age: 67, benefit: 76410 },
    { age: 70, benefit: 94932 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['inputs', 'optimizer'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab === 'inputs' ? 'Assumptions' : 'Retire Age Optimizer'}
          </button>
        ))}
      </div>

      {activeTab === 'inputs' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-5">
            <h3 className="text-sm font-semibold text-gray-300">Retirement Parameters</h3>
            <Slider
              label="Retirement Age"
              value={assumptions.retirementAge}
              min={55} max={70}
              onChange={v => updateAssumptions({ retirementAge: v })}
            />
            <Slider
              label="Inflation Rate"
              value={assumptions.inflationRate}
              min={1} max={5} step={0.5}
              format={v => `${v.toFixed(1)}%`}
              onChange={v => updateAssumptions({ inflationRate: v })}
            />
            <Slider
              label="Expected Return"
              value={assumptions.expectedReturn}
              min={4} max={10} step={0.5}
              format={v => `${v.toFixed(1)}%`}
              onChange={v => updateAssumptions({ expectedReturn: v })}
            />
            <Slider
              label="Expected Volatility"
              value={assumptions.expectedVolatility}
              min={5} max={25}
              format={v => `${v}%`}
              onChange={v => updateAssumptions({ expectedVolatility: v })}
            />
            <Slider
              label="Life Expectancy"
              value={assumptions.lifeExpectancy}
              min={80} max={105}
              format={v => `Age ${v}`}
              onChange={v => updateAssumptions({ lifeExpectancy: v })}
            />
            <Slider
              label="Legacy Goal Per Daughter"
              value={assumptions.legacyGoalPerDaughter}
              min={0} max={5000000} step={100000}
              format={v => formatCurrency(v, true)}
              onChange={v => updateAssumptions({ legacyGoalPerDaughter: v })}
            />
          </Card>

          <Card className="p-5 space-y-5">
            <h3 className="text-sm font-semibold text-gray-300">Social Security & Spending</h3>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">SS Claim Age</p>
              <div className="flex flex-wrap gap-2">
                {ssOptions.map(opt => (
                  <button
                    key={opt.age}
                    onClick={() => updateAssumptions({ ssClaimAge: opt.age })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      assumptions.ssClaimAge === opt.age
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-bold">Age {opt.age}</div>
                    <div className="text-xs opacity-75">{formatCurrency(opt.benefit, true)}/yr</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Spending Before SS</label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
                    value={profile.retirementSpendingBeforeSS}
                    onChange={e => updateProfile({ retirementSpendingBeforeSS: +e.target.value })}
                    step={1000}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Spending After SS</label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
                    value={profile.retirementSpendingAfterSS}
                    onChange={e => updateProfile({ retirementSpendingAfterSS: +e.target.value })}
                    step={1000}
                  />
                </div>
              </div>
            </div>

            {monteCarloResult && (
              <div className="mt-4 p-4 rounded-lg bg-gray-800/50 space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Current Plan Summary</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Success Rate', value: formatPercent(monteCarloResult.probabilityOfSuccess), color: getSuccessColor(monteCarloResult.probabilityOfSuccess) },
                    { label: 'Median Estate', value: formatCurrency(monteCarloResult.medianEndingWealth, true), color: 'text-white' },
                    { label: '5th Percentile', value: formatCurrency(monteCarloResult.p5EndingWealth, true), color: 'text-red-400' },
                    { label: '95th Percentile', value: formatCurrency(monteCarloResult.p95EndingWealth, true), color: 'text-emerald-400' },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {activeTab === 'optimizer' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Retirement Age Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Retire Age', 'Success %', 'Median Estate', 'Median Taxes', 'Max Safe Spending', 'Legacy Prob'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {comparison.map(row => (
                    <tr
                      key={row.retireAge}
                      className={`transition-colors ${row.retireAge === assumptions.retirementAge ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-gray-800/30'}`}
                    >
                      <td className="px-3 py-3 font-bold text-white">
                        Age {row.retireAge}
                        {row.retireAge === assumptions.retirementAge && <span className="ml-2 text-xs text-blue-400">(current)</span>}
                      </td>
                      <td className={`px-3 py-3 font-bold ${getSuccessColor(row.probabilityOfSuccess)}`}>
                        {formatPercent(row.probabilityOfSuccess)}
                      </td>
                      <td className="px-3 py-3 text-gray-300">{formatCurrency(row.medianEstate, true)}</td>
                      <td className="px-3 py-3 text-gray-300">{formatCurrency(row.medianTaxes, true)}</td>
                      <td className="px-3 py-3 text-gray-300">{formatCurrency(row.maxSafeSpending, true)}/yr</td>
                      <td className={`px-3 py-3 font-medium ${getSuccessColor(row.legacyProbability)}`}>
                        {formatPercent(row.legacyProbability)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h4 className="text-xs text-gray-400 uppercase tracking-wide mb-3">Success Rate by Retirement Age</h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={comparison} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="retireAge" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `${v}`} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 1]} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: any) => [formatPercent(Number(v)), "Success Rate"]}
                    labelFormatter={v => `Retire at ${v}`}
                  />
                  <Bar dataKey="probabilityOfSuccess" radius={[4, 4, 0, 0]}>
                    {comparison.map(row => (
                      <Cell
                        key={row.retireAge}
                        fill={row.probabilityOfSuccess >= 0.90 ? '#10b981' : row.probabilityOfSuccess >= 0.80 ? '#f59e0b' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
