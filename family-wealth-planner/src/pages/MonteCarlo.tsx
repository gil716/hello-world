import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';
import { runMonteCarlo } from '../engine/monteCarlo';

export function MonteCarlo() {
  const { cashFlows, assumptions, monteCarloResult, recalculate } = useFinancialStore();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(monteCarloResult);

  const handleRun = () => {
    setIsRunning(true);
    setTimeout(() => {
      const r = runMonteCarlo(cashFlows, assumptions.expectedReturn, assumptions.expectedVolatility, 10000);
      setResult(r);
      setIsRunning(false);
    }, 100);
  };

  const prob = result?.probabilityOfSuccess ?? 0;
  const probColor = getSuccessColor(prob);

  const stats = result ? [
    { label: 'Probability of Success', value: formatPercent(prob), color: probColor },
    { label: 'Median Ending Wealth', value: formatCurrency(result.medianEndingWealth, true), color: 'text-white' },
    { label: '5th Percentile', value: formatCurrency(result.p5EndingWealth, true), color: 'text-red-400' },
    { label: '25th Percentile', value: formatCurrency(result.p25EndingWealth, true), color: 'text-orange-400' },
    { label: '75th Percentile', value: formatCurrency(result.p75EndingWealth, true), color: 'text-blue-400' },
    { label: '95th Percentile', value: formatCurrency(result.p95EndingWealth, true), color: 'text-emerald-400' },
    { label: 'Worst Case (1%)', value: formatCurrency(result.worstCase, true), color: 'text-red-500' },
    { label: 'Best Case (99%)', value: formatCurrency(result.bestCase, true), color: 'text-emerald-500' },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Monte Carlo Simulation</h2>
          <p className="text-xs text-gray-400 mt-0.5">10,000 simulations with random return sequences</p>
        </div>
        <Button
          variant="primary"
          onClick={handleRun}
          disabled={isRunning || cashFlows.length === 0}
        >
          {isRunning ? 'Running...' : 'Run 10,000 Simulations'}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="p-3">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {result && (
        <>
          {/* Fan Chart */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Portfolio Projection Fan Chart</h3>
            <p className="text-xs text-gray-500 mb-3">Shaded bands show 5th–95th percentile outcomes from 500 sample simulations</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={result.percentileData}>
                <defs>
                  <linearGradient id="p95grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="p75grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Age', position: 'insideBottom', fill: '#6b7280', fontSize: 11, offset: -2 }} />
                <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: any) => [formatCurrency(v, true), name as string]}
                  labelFormatter={v => `Age ${v}`}
                />
                <Area type="monotone" dataKey="p95" name="95th %" fill="url(#p95grad)" stroke="#10b981" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                <Area type="monotone" dataKey="p75" name="75th %" fill="url(#p75grad)" stroke="#3b82f6" strokeWidth={1} dot={false} />
                <Line type="monotone" dataKey="median" name="Median" stroke="#ffffff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p25" name="25th %" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" dot={false} />
                <Line type="monotone" dataKey="p5" name="5th %" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Histogram */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Ending Wealth Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={result.histogram.slice(0, 30)} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="bucket" tickFormatter={v => formatCurrency(v, true)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelFormatter={v => `${formatCurrency(+v, true)}+`}
                  formatter={(v: any) => [String(v), "Simulations"]}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} opacity={0.8} />
                <ReferenceLine x={result.medianEndingWealth} stroke="#ffffff" strokeDasharray="3 3" label={{ value: 'Median', fill: '#9ca3af', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Success Gauge */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Success Rate Gauge</h3>
            <div className="flex items-center gap-6">
              <div className="relative w-32 h-16 flex-shrink-0">
                <svg viewBox="0 0 100 50" className="w-full">
                  <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke="#1f2937" strokeWidth="8" />
                  <path
                    d="M 5 50 A 45 45 0 0 1 95 50"
                    fill="none"
                    stroke={prob >= 0.90 ? '#10b981' : prob >= 0.80 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8"
                    strokeDasharray={`${prob * 141.3} 141.3`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-end justify-center pb-1">
                  <span className={`text-xl font-bold ${probColor}`}>{(prob * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-gray-400">≥90%: Excellent — retire with confidence</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-gray-400">80-89%: Good — minor adjustments may help</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-gray-400">70-79%: Moderate risk — consider working longer or spending less</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-gray-400">&lt;70%: High risk — significant plan adjustments needed</span>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {!result && cashFlows.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-400">No cash flows calculated yet. Go to Retirement to set your assumptions, then run the simulation.</p>
        </Card>
      )}
    </div>
  );
}
