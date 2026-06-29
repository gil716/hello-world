import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { formatCurrency } from '../utils/formatters';
import { calculateNetWorth } from '../engine/financialCalculations';

export function NetWorth() {
  const { profile, assets, cashFlows, updateAssets } = useFinancialStore();

  const netWorth = useMemo(() => calculateNetWorth(assets), [assets]);

  const netWorthTrend = useMemo(() =>
    cashFlows.filter((_, i) => i % 2 === 0).map(f => ({
      age: f.age,
      netWorth: f.netWorth,
      traditional: f.traditionalBalance,
      roth: f.rothBalance,
      taxable: f.taxableBalance,
      cash: f.cashBalance,
    })), [cashFlows]);

  const components = [
    { label: 'Traditional IRA', key: 'traditionalIRA' as const, value: assets.traditionalIRA, color: '#3b82f6' },
    { label: '401k', key: 'k401' as const, value: assets.k401, color: '#6366f1' },
    { label: 'Roth IRA', key: 'rothIRA' as const, value: assets.rothIRA, color: '#8b5cf6' },
    { label: 'HSA', key: 'hsa' as const, value: assets.hsa, color: '#a78bfa' },
    { label: 'Taxable Brokerage', key: 'taxableBrokerage' as const, value: assets.taxableBrokerage, color: '#10b981' },
    { label: '529 College', key: 'college529' as const, value: assets.college529, color: '#34d399' },
    { label: 'Cash', key: 'cash' as const, value: assets.cash, color: '#f59e0b' },
    { label: 'Home Value', key: 'homeValue' as const, value: assets.homeValue, color: '#f97316' },
    { label: 'Mortgage (liability)', key: 'mortgage' as const, value: -assets.mortgage, color: '#ef4444' },
  ];

  const InputField = ({ label, field, value }: { label: string; field: keyof typeof assets; value: number }) => (
    <div>
      <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-gray-500 text-sm">$</span>
        <input
          type="number"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
          value={value}
          onChange={e => updateAssets({ [field]: Math.max(0, +e.target.value) })}
          step={1000}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Total */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Net Worth</p>
            <p className="text-3xl font-bold text-blue-400 mt-1">{formatCurrency(netWorth)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right">
            <div>
              <p className="text-xs text-gray-400">Investable Assets</p>
              <p className="text-lg font-bold text-white">{formatCurrency(assets.traditionalIRA + assets.k401 + assets.rothIRA + assets.hsa + assets.taxableBrokerage + assets.cash, true)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Home Equity</p>
              <p className="text-lg font-bold text-white">{formatCurrency(assets.homeValue - assets.mortgage, true)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Asset Breakdown */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Asset Breakdown</h3>
          <div className="space-y-2.5">
            {components.map(c => {
              const pct = Math.abs(c.value) / Math.max(1, netWorth + assets.mortgage);
              return (
                <div key={c.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{c.label}</span>
                    <span className={c.value < 0 ? 'text-red-400' : 'text-white'} style={{ color: c.value < 0 ? undefined : c.color }}>
                      {c.value < 0 ? '-' : ''}{formatCurrency(Math.abs(c.value), true)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, pct * 100)}%`, background: c.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Net Worth Chart */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Net Worth Projection</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={netWorthTrend}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any, name: any) => [formatCurrency(v, true), name as string]}
                labelFormatter={v => `Age ${v}`}
              />
              <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#3b82f6" fill="url(#nwGrad)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Edit Assets */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Update Asset Values</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <InputField label="Traditional IRA" field="traditionalIRA" value={assets.traditionalIRA} />
          <InputField label="401k" field="k401" value={assets.k401} />
          <InputField label="Roth IRA" field="rothIRA" value={assets.rothIRA} />
          <InputField label="HSA" field="hsa" value={assets.hsa} />
          <InputField label="Taxable Brokerage" field="taxableBrokerage" value={assets.taxableBrokerage} />
          <InputField label="529 College Savings" field="college529" value={assets.college529} />
          <InputField label="Cash & Savings" field="cash" value={assets.cash} />
          <InputField label="Home Value" field="homeValue" value={assets.homeValue} />
          <InputField label="Mortgage Balance" field="mortgage" value={assets.mortgage} />
        </div>
      </Card>
    </div>
  );
}
