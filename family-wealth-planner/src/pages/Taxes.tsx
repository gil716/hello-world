import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Slider } from '../components/ui/Slider';
import { formatCurrency, formatPercent } from '../utils/formatters';

const BRACKETS = [
  { rate: '10%', min: 0, max: 23200, color: '#10b981' },
  { rate: '12%', min: 23200, max: 94300, color: '#3b82f6' },
  { rate: '22%', min: 94300, max: 201050, color: '#8b5cf6' },
  { rate: '24%', min: 201050, max: 383900, color: '#f59e0b' },
  { rate: '32%', min: 383900, max: 487450, color: '#f97316' },
  { rate: '35%', min: 487450, max: 731200, color: '#ef4444' },
  { rate: '37%', min: 731200, max: Infinity, color: '#dc2626' },
];

export function Taxes() {
  const { taxAnalysis, profile, assets, assumptions, rothConversionAmount, setRothConversionAmount } = useFinancialStore();
  const [activeTab, setActiveTab] = useState<'current' | 'roth'>('current');

  if (!taxAnalysis) {
    return <Card className="p-8 text-center text-gray-400">Calculating tax analysis...</Card>;
  }

  const { federalTax, ficaTax, effectiveRate, marginalRate, taxableIncome, irmaaRisk, rmdAge73, optimalRothConversion, lifetimeTaxSavingsFromRoth } = taxAnalysis;

  const taxBreakdown = [
    { name: 'Federal Income', value: federalTax, color: '#3b82f6' },
    { name: 'FICA (SS/Medicare)', value: ficaTax, color: '#8b5cf6' },
    { name: 'State (est.)', value: taxableIncome * 0.05, color: '#10b981' },
  ];

  const totalTax = taxBreakdown.reduce((s, t) => s + t.value, 0);

  // Roth conversion tax impact
  const conversionTax = rothConversionAmount * marginalRate;
  const rmdReduction = rmdAge73 * (rothConversionAmount / (assets.traditionalIRA + assets.k401)) * 0.5;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['current', 'roth'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            {tab === 'current' ? 'Current Year Taxes' : 'Roth Optimizer'}
          </button>
        ))}
      </div>

      {activeTab === 'current' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Tax Estimate', value: formatCurrency(totalTax, true), color: 'text-red-400' },
              { label: 'Effective Rate', value: formatPercent(effectiveRate), color: 'text-orange-400' },
              { label: 'Marginal Rate', value: formatPercent(marginalRate), color: 'text-yellow-400' },
              { label: 'Taxable Income', value: formatCurrency(taxableIncome, true), color: 'text-white' },
            ].map(s => (
              <Card key={s.label} className="p-4">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </Card>
            ))}
          </div>

          {/* Tax Breakdown Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Tax Breakdown</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={taxBreakdown} layout="vertical" barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => formatCurrency(v, true)} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} formatter={(v: any) => [formatCurrency(v), ""]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {taxBreakdown.map(t => <Cell key={t.name} fill={t.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Tax Brackets */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">2024 Tax Brackets (MFJ)</h3>
              <div className="space-y-1.5">
                {BRACKETS.filter(b => b.max < Infinity || taxableIncome > b.min).map(b => {
                  const isActive = taxableIncome > b.min;
                  const isMarginal = taxableIncome > b.min && taxableIncome <= b.max;
                  const fill = Math.min(1, Math.max(0, (taxableIncome - b.min) / (b.max - b.min)));
                  return (
                    <div key={b.rate} className={`relative h-6 rounded overflow-hidden ${isActive ? 'opacity-100' : 'opacity-30'}`}>
                      <div className="absolute inset-0 bg-gray-800 rounded" />
                      <div
                        className="absolute inset-y-0 left-0 rounded transition-all"
                        style={{ width: `${(isMarginal ? fill : isActive ? 1 : 0) * 100}%`, background: b.color, opacity: 0.8 }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2">
                        <span className="text-xs font-bold text-white">{b.rate}</span>
                        <span className="text-xs text-gray-300">{formatCurrency(b.min, true)} — {b.max === Infinity ? '∞' : formatCurrency(b.max, true)}</span>
                        {isMarginal && <span className="text-xs font-bold" style={{ color: b.color }}>← You are here</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* RMD & IRMAA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Required Minimum Distributions</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400">Estimated RMD at Age 73</p>
                  <p className="text-xl font-bold text-amber-400 mt-0.5">{formatCurrency(rmdAge73, true)}</p>
                  <p className="text-xs text-gray-500 mt-1">Based on current traditional balance growth</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400 font-medium">⚠ RMD Tax Impact</p>
                  <p className="text-xs text-gray-400 mt-1">
                    At age 73, RMDs of {formatCurrency(rmdAge73, true)}/year will push your marginal rate to 32%+,
                    potentially triggering IRMAA surcharges. Consider Roth conversions now to reduce this liability.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">IRMAA Alert</h3>
              <div className={`p-3 rounded-lg border ${irmaaRisk ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                <p className={`text-sm font-bold ${irmaaRisk ? 'text-red-400' : 'text-emerald-400'}`}>
                  {irmaaRisk ? '⚠ IRMAA Risk Detected' : '✓ Below IRMAA Threshold'}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  2024 IRMAA threshold (MFJ): $206,000 MAGI<br />
                  Your estimated MAGI: {formatCurrency((profile.salary + profile.annualBonus) - profile.employee401kContribution, true)}<br />
                  {irmaaRisk ? 'Medicare Part B surcharges will apply. Consider maximizing pre-tax 401k contributions.' : 'No Medicare premium surcharges at this income level.'}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-xs text-gray-400">Capital Gains Tax Estimate</p>
                <p className="text-base font-bold text-white mt-0.5">{formatCurrency(taxAnalysis.capitalGains, true)}</p>
                <p className="text-xs text-gray-500">Estimated 15% rate on taxable account growth</p>
              </div>
            </Card>
          </div>
        </motion.div>
      )}

      {activeTab === 'roth' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-5">Roth Conversion Optimizer</h3>
            <Slider
              label="Annual Roth Conversion Amount"
              value={rothConversionAmount}
              min={0}
              max={500000}
              step={5000}
              format={v => formatCurrency(v, true)}
              onChange={setRothConversionAmount}
              accent="#8b5cf6"
            />

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Conversion Tax Cost', value: formatCurrency(conversionTax, true), color: 'text-red-400', sub: `At ${formatPercent(marginalRate)} marginal rate` },
                { label: 'Est. RMD Reduction', value: formatCurrency(rmdReduction, true) + '/yr', color: 'text-emerald-400', sub: 'At age 73' },
                { label: 'Lifetime Tax Savings', value: formatCurrency(lifetimeTaxSavingsFromRoth, true), color: 'text-violet-400', sub: 'Over 20 years of RMDs' },
                { label: 'Optimal Conversion', value: formatCurrency(optimalRothConversion, true), color: 'text-blue-400', sub: 'To fill 24% bracket' },
              ].map(s => (
                <Card key={s.label} className="p-3">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className={`text-base font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                </Card>
              ))}
            </div>

            <div className="mt-5 p-4 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <h4 className="text-sm font-semibold text-violet-400 mb-2">Roth Conversion Strategy</h4>
              <div className="space-y-2 text-xs text-gray-300">
                <p>• <strong>Recommended:</strong> Convert {formatCurrency(optimalRothConversion, true)}/year in early retirement (ages {assumptions.retirementAge}–72) to fill the 24% bracket</p>
                <p>• This converts your traditional balance before RMDs force higher-rate distributions</p>
                <p>• Roth assets grow tax-free and heirs inherit them tax-free (with 10-year distribution rule)</p>
                <p>• Monitor MAGI each year to avoid IRMAA surcharges (&lt;$206K threshold)</p>
                <p>• Consider spreading conversions to stay in the 22-24% bracket: sweet spot for most retirees</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
