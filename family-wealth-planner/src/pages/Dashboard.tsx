import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { StatCard } from '../components/ui/Card';
import { Card } from '../components/ui/Card';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';
import {
  calculateNetWorth, calculateRetirementAssets,
  calculateFreedomNumber, getSocialSecurityBenefit
} from '../engine/financialCalculations';
import {
  BanknotesIcon, ChartBarIcon, ClockIcon,
  SparklesIcon, TrophyIcon, BuildingLibraryIcon
} from '@heroicons/react/24/outline';

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export function Dashboard() {
  const { profile, assets, assumptions, cashFlows, monteCarloResult } = useFinancialStore();

  const netWorth = useMemo(() => calculateNetWorth(assets), [assets]);
  const retirementAssets = useMemo(() => calculateRetirementAssets(assets), [assets]);
  const ssIncome = getSocialSecurityBenefit(assumptions.ssClaimAge);
  const freedomNumber = calculateFreedomNumber(
    profile.retirementSpendingBeforeSS,
    0,
    assumptions.inflationRate,
    assumptions.expectedReturn
  );

  const successProb = monteCarloResult?.probabilityOfSuccess ?? 0;
  const medianEstate = monteCarloResult?.medianEndingWealth ?? 0;

  // Tax diversification — HSA is triple-tax-advantaged, not Roth; company equity & ESPP are taxable
  const totalRetirement = assets.traditionalIRA + assets.k401 + assets.rothIRA + assets.hsa
    + assets.taxableBrokerage + assets.companyEquity + assets.espp + assets.cash;
  const taxDiversification = [
    { name: 'Traditional (pre-tax)', value: assets.traditionalIRA + assets.k401, color: '#3b82f6' },
    { name: 'Roth (after-tax)', value: assets.rothIRA, color: '#8b5cf6' },
    { name: 'HSA (triple tax-free)', value: assets.hsa, color: '#a78bfa' },
    { name: 'Taxable', value: assets.taxableBrokerage + assets.companyEquity + assets.espp, color: '#10b981' },
    { name: 'Cash', value: assets.cash, color: '#f59e0b' },
  ];

  // Net worth trend data from cash flows
  const netWorthData = cashFlows
    .filter((_, i) => i % 2 === 0)
    .slice(0, 25)
    .map(f => ({ age: f.age, value: f.netWorth }));

  // Retirement readiness score (0-100)
  const readinessScore = Math.min(100, Math.round(
    (retirementAssets / freedomNumber) * 40 +
    successProb * 40 +
    (assumptions.retirementAge <= 60 ? 10 : 5) +
    (assumptions.ssClaimAge === 70 ? 10 : 5)
  ));

  const readinessColor = readinessScore >= 80 ? 'text-emerald-400' : readinessScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  const topStats = [
    {
      label: 'Current Net Worth',
      value: formatCurrency(netWorth, true),
      sub: `${formatCurrency(retirementAssets, true)} investable`,
      accent: 'text-blue-400',
      icon: <BanknotesIcon className="w-5 h-5" />,
    },
    {
      label: 'Retirement Assets',
      value: formatCurrency(retirementAssets, true),
      sub: `${formatPercent(retirementAssets / freedomNumber)} of Freedom Number`,
      accent: 'text-violet-400',
      icon: <ChartBarIcon className="w-5 h-5" />,
    },
    {
      label: 'Retirement Readiness',
      value: `${readinessScore}/100`,
      sub: readinessScore >= 80 ? 'Excellent position' : readinessScore >= 60 ? 'On track' : 'Needs attention',
      accent: readinessColor,
      icon: <TrophyIcon className="w-5 h-5" />,
    },
    {
      label: 'Freedom Number',
      value: formatCurrency(freedomNumber, true),
      sub: `${formatCurrency(retirementAssets - freedomNumber, true)} ${retirementAssets >= freedomNumber ? 'above' : 'to go'}`,
      accent: retirementAssets >= freedomNumber ? 'text-emerald-400' : 'text-amber-400',
      icon: <SparklesIcon className="w-5 h-5" />,
    },
    {
      label: 'Probability of Success',
      value: formatPercent(successProb),
      sub: successProb >= 0.90 ? 'Very high confidence' : successProb >= 0.80 ? 'Good confidence' : 'Moderate risk',
      accent: getSuccessColor(successProb),
      icon: <ClockIcon className="w-5 h-5" />,
    },
    {
      label: 'Projected Estate',
      value: formatCurrency(medianEstate, true),
      sub: `${formatCurrency(assumptions.legacyGoalPerDaughter * 2, true)} legacy goal`,
      accent: medianEstate >= assumptions.legacyGoalPerDaughter * 2 ? 'text-emerald-400' : 'text-amber-400',
      icon: <BuildingLibraryIcon className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* CFO Summary */}
      <motion.div {...fadeIn} transition={{ duration: 0.3 }}>
        <Card className="p-5 border-blue-500/20 bg-gradient-to-r from-blue-900/20 to-violet-900/10">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <SparklesIcon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">CFO Executive Summary</h2>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-gray-300">
                <div className="flex gap-2">
                  <span className={successProb >= 0.85 ? 'text-emerald-400' : 'text-yellow-400'}>
                    {successProb >= 0.85 ? '✓' : '⚠'}
                  </span>
                  <span>Work optional at age {retirementAssets >= freedomNumber ? profile.age : profile.age + Math.ceil((freedomNumber - retirementAssets) / ((profile.salary * 0.3) + retirementAssets * (assumptions.expectedReturn / 100)))}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Delay SS to 70: +{formatCurrency(ssIncome - getSocialSecurityBenefit(62), true)}/yr</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400">→</span>
                  <span>Convert $175K/yr to Roth to reduce RMDs</span>
                </div>
                <div className="flex gap-2">
                  <span className={medianEstate >= assumptions.legacyGoalPerDaughter * 2 ? 'text-emerald-400' : 'text-yellow-400'}>
                    {medianEstate >= assumptions.legacyGoalPerDaughter * 2 ? '✓' : '⚠'}
                  </span>
                  <span>${formatCurrency(assumptions.legacyGoalPerDaughter, true)} per daughter legacy {medianEstate >= assumptions.legacyGoalPerDaughter * 2 ? 'on track' : 'at risk'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-violet-400">→</span>
                  <span>Each year working adds ~{formatCurrency((profile.salary * 0.3 + retirementAssets * (assumptions.expectedReturn / 100)), true)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-400">⚠</span>
                  <span>Healthcare gap: ACA costs ~$18-24K/yr pre-Medicare</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {topStats.map((stat, i) => (
          <motion.div key={stat.label} {...fadeIn} transition={{ duration: 0.3, delay: i * 0.05 }}>
            <StatCard {...stat} />
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Net Worth Chart */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.3 }} className="lg:col-span-2">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Net Worth Projection</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={netWorthData}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v: any) => [formatCurrency(v, true), "Net Worth"]}
                  labelFormatter={v => `Age ${v}`}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#netWorthGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Tax Diversification */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.35 }}>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Tax Diversification</h3>
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={taxDiversification}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {taxDiversification.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: any) => [formatCurrency(v, true), ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full mt-2">
                {taxDiversification.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-gray-400">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-medium">{formatCurrency(item.value, true)}</span>
                      <span className="text-gray-500 ml-1">({formatPercent(item.value / totalRetirement, 0)})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions / Recommendations */}
      <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.4 }}>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Top Recommendations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { priority: 'High', text: 'Convert $175K to Roth annually in early retirement to reduce RMDs by ~$95K at age 73', color: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
              { priority: 'High', text: 'Delay Social Security to age 70 — adds $18,522/year vs claiming at 67', color: 'text-violet-400 border-violet-500/20 bg-violet-500/5' },
              { priority: 'Medium', text: 'Maximize HSA contributions ($8,300/yr) — triple tax advantage vehicle', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
              { priority: 'Medium', text: 'Plan ACA healthcare strategy for pre-Medicare years at ~$20K/year', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
              { priority: 'Low', text: 'Review portfolio concentration — NVDA position now exceeds 10% of taxable assets', color: 'text-orange-400 border-orange-500/20 bg-orange-500/5' },
              { priority: 'Low', text: 'Consider 529 beneficiary changes or Roth IRA rollovers as college funding winds down', color: 'text-pink-400 border-pink-500/20 bg-pink-500/5' },
            ].map((rec, i) => (
              <div key={i} className={`rounded-lg border p-3 ${rec.color}`}>
                <span className={`text-xs font-bold uppercase tracking-wide ${rec.color.split(' ')[0]}`}>{rec.priority}</span>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">{rec.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
