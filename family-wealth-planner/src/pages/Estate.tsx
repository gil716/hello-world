import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Slider } from '../components/ui/Slider';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';

const LEGACY_PRESETS = [500000, 1000000, 1500000, 2000000, 3000000];

export function Estate() {
  const { cashFlows, assumptions, monteCarloResult, updateAssumptions } = useFinancialStore();

  const legacyTotal = assumptions.legacyGoalPerDaughter * 2;

  const estateData = useMemo(() => {
    return cashFlows
      .filter(f => f.age >= assumptions.retirementAge)
      .filter((_, i) => i % 2 === 0)
      .map(f => ({
        age: f.age,
        netWorth: f.netWorth,
        traditional: f.traditionalBalance,
        roth: f.rothBalance,
        taxable: f.taxableBalance,
      }));
  }, [cashFlows, assumptions.retirementAge]);

  const finalEstimate = cashFlows.length > 0 ? cashFlows[cashFlows.length - 1]?.netWorth ?? 0 : 0;
  const legacyProbability = monteCarloResult ? monteCarloResult.probabilityOfSuccess * (finalEstimate >= legacyTotal ? 1 : finalEstimate / legacyTotal) : 0;

  const estateAtDeathAge = cashFlows.find(f => f.age === assumptions.lifeExpectancy)?.netWorth ?? finalEstimate;

  return (
    <div className="space-y-5">
      {/* Legacy Goal Selector */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Legacy Goal Per Daughter</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {LEGACY_PRESETS.map(amount => (
            <button
              key={amount}
              onClick={() => updateAssumptions({ legacyGoalPerDaughter: amount })}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                assumptions.legacyGoalPerDaughter === amount
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {formatCurrency(amount, true)}
            </button>
          ))}
        </div>
        <Slider
          label="Custom Legacy Goal Per Daughter"
          value={assumptions.legacyGoalPerDaughter}
          min={0}
          max={5000000}
          step={100000}
          format={v => formatCurrency(v, true)}
          onChange={v => updateAssumptions({ legacyGoalPerDaughter: v })}
          accent="#8b5cf6"
        />
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Legacy Goal', value: formatCurrency(legacyTotal, true), color: 'text-violet-400' },
          { label: 'Projected Estate', value: formatCurrency(estateAtDeathAge, true), color: estateAtDeathAge >= legacyTotal ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Legacy Surplus/Deficit', value: formatCurrency(estateAtDeathAge - legacyTotal, true), color: estateAtDeathAge >= legacyTotal ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Goal Achievement Prob.', value: formatPercent(Math.min(1, legacyProbability)), color: getSuccessColor(Math.min(1, legacyProbability)) },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Estate Timeline Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Estate Value Timeline</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={estateData}>
            <defs>
              <linearGradient id="tradGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rothGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="taxableGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Age', position: 'insideBottom', fill: '#6b7280', fontSize: 11, offset: -2 }} />
            <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v: any, name: any) => [formatCurrency(v, true), name as string]}
              labelFormatter={v => `Age ${v}`}
            />
            <Area type="monotone" dataKey="traditional" name="Traditional" stackId="1" stroke="#3b82f6" fill="url(#tradGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="roth" name="Roth" stackId="1" stroke="#8b5cf6" fill="url(#rothGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="taxable" name="Taxable" stackId="1" stroke="#10b981" fill="url(#taxableGrad)" strokeWidth={2} dot={false} />
            <ReferenceLine y={legacyTotal} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: `Legacy Goal: ${formatCurrency(legacyTotal, true)}`, fill: '#f59e0b', fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Estate Planning Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Estate Planning Checklist</h3>
          <div className="space-y-2">
            {[
              { item: 'Will and Testament', status: 'action', note: 'Essential — designate heirs and executor' },
              { item: 'Revocable Living Trust', status: 'consider', note: 'Avoids probate, maintains privacy' },
              { item: 'Beneficiary Designations', status: 'action', note: 'Update on all retirement accounts and life insurance' },
              { item: 'Power of Attorney', status: 'action', note: 'Financial and healthcare POA' },
              { item: 'Healthcare Directive', status: 'action', note: 'Living will / advanced directive' },
              { item: 'Life Insurance', status: 'consider', note: 'Review adequacy and beneficiary alignment' },
              { item: '529 Successor Owner', status: 'consider', note: 'Designate if parents predecease children' },
              { item: 'Roth IRA Beneficiary', status: 'action', note: 'Heirs get 10-yr tax-free withdrawal window' },
            ].map(item => (
              <div key={item.item} className="flex items-start gap-2">
                <span className={`mt-0.5 text-sm flex-shrink-0 ${item.status === 'action' ? 'text-amber-400' : 'text-blue-400'}`}>
                  {item.status === 'action' ? '⚠' : '→'}
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-300">{item.item}</p>
                  <p className="text-xs text-gray-500">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Inheritance Tax Efficiency</h3>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400">Step-Up in Basis</p>
              <p className="text-xs text-gray-400 mt-1">Taxable brokerage assets receive a new cost basis at death, eliminating all embedded capital gains tax for heirs.</p>
            </div>
            <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <p className="text-xs font-semibold text-violet-400">Roth IRA Inheritance</p>
              <p className="text-xs text-gray-400 mt-1">Daughters inherit Roth IRA tax-free. Must distribute within 10 years, but no income tax on withdrawals.</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs font-semibold text-amber-400">Traditional IRA Inheritance</p>
              <p className="text-xs text-gray-400 mt-1">Heirs pay income tax on withdrawals. 10-year rule applies. Consider converting more to Roth to reduce this burden.</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs font-semibold text-blue-400">Federal Estate Tax</p>
              <p className="text-xs text-gray-400 mt-1">2024 exemption: $13.61M per person ($27.22M MFJ). Your projected estate of {formatCurrency(estateAtDeathAge, true)} is well within limits.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
