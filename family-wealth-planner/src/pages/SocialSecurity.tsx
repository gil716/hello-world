import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine
} from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { SS_BENEFITS, getSocialSecurityBenefit } from '../engine/financialCalculations';
import { formatCurrency } from '../utils/formatters';

export function SocialSecurity() {
  const { assumptions, updateAssumptions } = useFinancialStore();

  // Break-even analysis
  const breakEvenData = useMemo(() => {
    const years = Array.from({ length: 45 }, (_, i) => {
      const age = 62 + i;
      const data: Record<string, number | string> = { age };
      for (const b of SS_BENEFITS) {
        const startAge = b.claimAge;
        const yearsCollected = Math.max(0, age - startAge);
        data[`age${startAge}`] = yearsCollected * b.annualBenefit;
      }
      return data;
    });
    return years;
  }, []);

  // Lifetime income by claim age
  const lifetimeIncome = useMemo(() => {
    return SS_BENEFITS.map(b => ({
      age: `Age ${b.claimAge}`,
      monthly: b.monthlyBenefit,
      annual: b.annualBenefit,
      lifetime30: b.annualBenefit * Math.max(0, 30 - (b.claimAge - 62)),
      lifetime20: b.annualBenefit * Math.max(0, 20 - (b.claimAge - 62)),
    }));
  }, []);

  const breakEven62to70 = useMemo(() => {
    const b62 = getSocialSecurityBenefit(62);
    const b70 = getSocialSecurityBenefit(70);
    return Math.round(70 + (b62 * 8) / (b70 - b62));
  }, []);

  const colors: Record<number, string> = {
    62: '#ef4444',
    65: '#f59e0b',
    66: '#f97316',
    67: '#3b82f6',
    70: '#10b981',
  };

  const ssIncome = getSocialSecurityBenefit(assumptions.ssClaimAge);

  return (
    <div className="space-y-5">
      {/* Benefit Options */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {SS_BENEFITS.map(b => (
          <Card
            key={b.claimAge}
            className={`p-4 cursor-pointer transition-all ${assumptions.ssClaimAge === b.claimAge ? 'border-blue-500 bg-blue-500/10' : ''}`}
            onClick={() => updateAssumptions({ ssClaimAge: b.claimAge as 62 | 65 | 66 | 67 | 70 })}
            hover
          >
            <p className="text-xs text-gray-400">Claim at</p>
            <p className="text-lg font-bold text-white mt-0.5">Age {b.claimAge}</p>
            <p className="text-sm font-semibold mt-1" style={{ color: colors[b.claimAge] }}>
              {formatCurrency(b.annualBenefit, true)}/yr
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(b.monthlyBenefit, true)}/mo</p>
            {assumptions.ssClaimAge === b.claimAge && (
              <div className="mt-2 text-xs text-blue-400 font-medium">✓ Selected</div>
            )}
          </Card>
        ))}
      </div>

      {/* Selected Strategy Summary */}
      <Card className="p-4 border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400">Selected Strategy: Claim at Age {assumptions.ssClaimAge}</p>
            <p className="text-2xl font-bold text-blue-400 mt-0.5">{formatCurrency(ssIncome, true)}/year</p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400">vs Claiming at 62</p>
              <p className={`text-sm font-bold ${ssIncome > getSocialSecurityBenefit(62) ? 'text-emerald-400' : 'text-red-400'}`}>
                {ssIncome > getSocialSecurityBenefit(62) ? '+' : ''}{formatCurrency(ssIncome - getSocialSecurityBenefit(62), true)}/yr
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Break-even vs 62</p>
              <p className="text-sm font-bold text-white">Age {breakEven62to70}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">30-yr Lifetime Income</p>
              <p className="text-sm font-bold text-white">{formatCurrency(ssIncome * (100 - assumptions.ssClaimAge), true)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cumulative Income Chart */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Break-Even Analysis (Cumulative Income)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={breakEvenData.filter((_, i) => i % 2 === 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any, name: any) => [formatCurrency(v, true), String(name).replace("age", "Claim at ")]}
                labelFormatter={v => `Age ${v}`}
              />
              <Legend formatter={v => `Claim at ${v.replace('age', '')}`} />
              {SS_BENEFITS.map(b => (
                <Line
                  key={b.claimAge}
                  type="monotone"
                  dataKey={`age${b.claimAge}`}
                  name={`age${b.claimAge}`}
                  stroke={colors[b.claimAge]}
                  strokeWidth={b.claimAge === assumptions.ssClaimAge ? 3 : 1.5}
                  dot={false}
                  strokeDasharray={b.claimAge === assumptions.ssClaimAge ? undefined : '4 2'}
                />
              ))}
              <ReferenceLine x={breakEven62to70} stroke="#ffffff" strokeDasharray="3 3" label={{ value: `62/70 break-even: ${breakEven62to70}`, fill: '#9ca3af', fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Annual Benefit Comparison */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Annual Benefit by Claim Age</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={lifetimeIncome} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any) => [formatCurrency(v), "Annual Benefit"]}
              />
              <Bar dataKey="annual" radius={[4, 4, 0, 0]}>
                {SS_BENEFITS.map(b => (
                  <Bar key={b.claimAge} dataKey="annual" />
                ))}
                {lifetimeIncome.map((entry, i) => {
                  const claimAge = SS_BENEFITS[i].claimAge;
                  return <rect key={entry.age} fill={assumptions.ssClaimAge === claimAge ? '#3b82f6' : colors[claimAge]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Key insights */}
          <div className="mt-3 p-3 rounded-lg bg-gray-800/50 space-y-1">
            <p className="text-xs font-semibold text-gray-300">Key Insight</p>
            <p className="text-xs text-gray-400">
              Delaying from 62 → 70 increases annual income by {formatCurrency(getSocialSecurityBenefit(70) - getSocialSecurityBenefit(62), true)} ({Math.round((getSocialSecurityBenefit(70) / getSocialSecurityBenefit(62) - 1) * 100)}%).
              With your portfolio supporting pre-SS spending, delaying to 70 adds the most lifetime value assuming you live past age {breakEven62to70}.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
