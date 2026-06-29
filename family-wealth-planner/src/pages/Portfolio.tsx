import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { Holding } from '../types';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const ASSET_COLORS: Record<string, string> = {
  'US Equity': '#3b82f6',
  'International': '#8b5cf6',
  'Fixed Income': '#10b981',
  'Cash': '#f59e0b',
  'Alternatives': '#ec4899',
  'REIT': '#f97316',
};

const LOC_COLORS: Record<string, string> = {
  Taxable: '#10b981',
  Traditional: '#3b82f6',
  Roth: '#8b5cf6',
  HSA: '#f59e0b',
  '529': '#ec4899',
};

export function Portfolio() {
  const { holdings, updateHolding, addHolding, removeHolding } = useFinancialStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Partial<Holding>>({});
  const [sortField, setSortField] = useState<keyof Holding>('marketValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const totalValue = useMemo(() => holdings.reduce((s, h) => s + h.marketValue, 0), [holdings]);
  const totalCost = useMemo(() => holdings.reduce((s, h) => s + h.costBasis, 0), [holdings]);
  const totalGain = totalValue - totalCost;

  const assetAllocation = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      map[h.assetClass] = (map[h.assetClass] ?? 0) + h.marketValue;
    }
    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      pct: value / totalValue,
    })).sort((a, b) => b.value - a.value);
  }, [holdings, totalValue]);

  const locationAllocation = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      map[h.taxLocation] = (map[h.taxLocation] ?? 0) + h.marketValue;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: value / totalValue }));
  }, [holdings, totalValue]);

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const av = a[sortField] as number | string;
      const bv = b[sortField] as number | string;
      return sortDir === 'asc'
        ? av < bv ? -1 : av > bv ? 1 : 0
        : av > bv ? -1 : av < bv ? 1 : 0;
    });
  }, [holdings, sortField, sortDir]);

  const handleSort = (field: keyof Holding) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const startEdit = (h: Holding) => {
    setEditingId(h.id);
    setEditBuffer({ ...h });
  };

  const saveEdit = () => {
    if (editingId && editBuffer) {
      updateHolding(editingId, editBuffer);
    }
    setEditingId(null);
    setEditBuffer({});
  };

  const addNew = () => {
    const newHolding: Holding = {
      id: Date.now().toString(),
      ticker: 'NEW',
      name: 'New Holding',
      shares: 0,
      costBasis: 0,
      marketValue: 0,
      dividendYield: 0,
      expenseRatio: 0,
      taxLocation: 'Taxable',
      assetClass: 'US Equity',
    };
    addHolding(newHolding);
    startEdit(newHolding);
  };

  const Th = ({ label, field }: { label: string; field?: keyof Holding }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${field ? 'cursor-pointer hover:text-gray-200' : ''}`}
      onClick={field ? () => handleSort(field) : undefined}
    >
      {label} {field && sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Value', value: formatCurrency(totalValue, true) },
          { label: 'Total Cost Basis', value: formatCurrency(totalCost, true) },
          { label: 'Total Gain/Loss', value: formatCurrency(totalGain, true), color: totalGain >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Return', value: formatPercent(totalGain / Math.max(totalCost, 1)), color: totalGain >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color ?? 'text-white'}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Allocation Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Asset Allocation</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={assetAllocation} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                  {assetAllocation.map(entry => (
                    <Cell key={entry.name} fill={ASSET_COLORS[entry.name] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} formatter={(v: any) => formatCurrency(v, true)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 flex-1">
              {assetAllocation.map(a => (
                <div key={a.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: ASSET_COLORS[a.name] ?? '#6b7280' }} />
                    <span className="text-gray-400">{a.name}</span>
                  </div>
                  <span className="text-white font-medium">{formatPercent(a.pct, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Tax Location</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={locationAllocation} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                  {locationAllocation.map(entry => (
                    <Cell key={entry.name} fill={LOC_COLORS[entry.name] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} formatter={(v: any) => formatCurrency(v, true)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 flex-1">
              {locationAllocation.map(a => (
                <div key={a.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: LOC_COLORS[a.name] ?? '#6b7280' }} />
                    <span className="text-gray-400">{a.name}</span>
                  </div>
                  <span className="text-white font-medium">{formatPercent(a.pct, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Holdings ({holdings.length})</h3>
          <Button size="sm" variant="primary" onClick={addNew} icon={<PlusIcon />}>Add</Button>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-800">
                <Th label="Ticker" field="ticker" />
                <Th label="Name" />
                <Th label="Shares" field="shares" />
                <Th label="Cost Basis" field="costBasis" />
                <Th label="Mkt Value" field="marketValue" />
                <Th label="Gain/Loss" />
                <Th label="Div Yield" field="dividendYield" />
                <Th label="Exp Ratio" field="expenseRatio" />
                <Th label="Location" field="taxLocation" />
                <Th label="Class" field="assetClass" />
                <Th label="" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {sorted.map(h => {
                const isEditing = editingId === h.id;
                const gain = h.marketValue - h.costBasis;
                return (
                  <tr key={h.id} className={`hover:bg-gray-800/30 transition-colors ${isEditing ? 'bg-blue-500/5' : ''}`}>
                    {isEditing ? (
                      <>
                        <td className="px-3 py-2"><input className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-20 text-xs text-white" value={editBuffer.ticker ?? ''} onChange={e => setEditBuffer(b => ({ ...b, ticker: e.target.value.toUpperCase() }))} /></td>
                        <td className="px-3 py-2"><input className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-32 text-xs text-white" value={editBuffer.name ?? ''} onChange={e => setEditBuffer(b => ({ ...b, name: e.target.value }))} /></td>
                        <td className="px-3 py-2"><input type="number" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-20 text-xs text-white" value={editBuffer.shares ?? 0} onChange={e => setEditBuffer(b => ({ ...b, shares: +e.target.value }))} /></td>
                        <td className="px-3 py-2"><input type="number" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-24 text-xs text-white" value={editBuffer.costBasis ?? 0} onChange={e => setEditBuffer(b => ({ ...b, costBasis: +e.target.value }))} /></td>
                        <td className="px-3 py-2"><input type="number" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-24 text-xs text-white" value={editBuffer.marketValue ?? 0} onChange={e => setEditBuffer(b => ({ ...b, marketValue: +e.target.value }))} /></td>
                        <td className="px-3 py-2 text-xs text-gray-500">—</td>
                        <td className="px-3 py-2"><input type="number" step="0.1" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-16 text-xs text-white" value={editBuffer.dividendYield ?? 0} onChange={e => setEditBuffer(b => ({ ...b, dividendYield: +e.target.value }))} /></td>
                        <td className="px-3 py-2"><input type="number" step="0.01" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-16 text-xs text-white" value={editBuffer.expenseRatio ?? 0} onChange={e => setEditBuffer(b => ({ ...b, expenseRatio: +e.target.value }))} /></td>
                        <td className="px-3 py-2">
                          <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white" value={editBuffer.taxLocation ?? 'Taxable'} onChange={e => setEditBuffer(b => ({ ...b, taxLocation: e.target.value as Holding['taxLocation'] }))}>
                            {['Taxable', 'Traditional', 'Roth', 'HSA', '529'].map(l => <option key={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white" value={editBuffer.assetClass ?? 'US Equity'} onChange={e => setEditBuffer(b => ({ ...b, assetClass: e.target.value as Holding['assetClass'] }))}>
                            {['US Equity', 'International', 'Fixed Income', 'Cash', 'Alternatives', 'REIT'].map(l => <option key={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="primary" onClick={saveEdit}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-blue-400">{h.ticker}</td>
                        <td className="px-3 py-2 text-xs text-gray-300 max-w-[140px] truncate">{h.name}</td>
                        <td className="px-3 py-2 text-xs text-gray-300 tabular-nums">{h.shares.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs text-gray-300 tabular-nums">{formatCurrency(h.costBasis, true)}</td>
                        <td className="px-3 py-2 text-xs text-white font-medium tabular-nums">{formatCurrency(h.marketValue, true)}</td>
                        <td className={`px-3 py-2 text-xs tabular-nums font-medium ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(gain, true)}</td>
                        <td className="px-3 py-2 text-xs text-gray-300 tabular-nums">{h.dividendYield > 0 ? `${h.dividendYield.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-300 tabular-nums">{h.expenseRatio > 0 ? `${h.expenseRatio.toFixed(2)}%` : '—'}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${LOC_COLORS[h.taxLocation] ?? '#6b7280'}20`, color: LOC_COLORS[h.taxLocation] ?? '#6b7280' }}>
                            {h.taxLocation}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{h.assetClass}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(h)}>Edit</Button>
                            <button onClick={() => removeHolding(h.id)} className="text-red-500/50 hover:text-red-400 p-1 transition-colors">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
