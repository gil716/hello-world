import { useState } from 'react';
import { motion } from 'framer-motion';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';
import { DocumentDuplicateIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

export function Scenarios() {
  const {
    scenarios, activeScenarioId, monteCarloResult,
    saveScenario, loadScenario, deleteScenario, duplicateScenario, renameScenario,
    assumptions
  } = useFinancialStore();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSave = () => {
    if (!newName.trim()) return;
    saveScenario(newName.trim());
    setNewName('');
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameScenario(id, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      {/* Save Current Scenario */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Save Current Scenario</h3>
        <p className="text-xs text-gray-400 mb-3">
          Capture the current plan as a named scenario to compare different strategies.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
            placeholder='e.g., "Retire at 58, SS at 70"'
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <Button variant="primary" onClick={handleSave} disabled={!newName.trim()}>
            Save Scenario
          </Button>
        </div>
      </Card>

      {/* Current Plan Summary */}
      <Card className="p-4 border-blue-500/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-blue-400">Current Active Plan</h3>
          {activeScenarioId && (
            <span className="text-xs text-gray-400">
              Based on: {scenarios.find(s => s.id === activeScenarioId)?.name}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-gray-400">Retire Age</p>
            <p className="text-white font-bold text-sm">{assumptions.retirementAge}</p>
          </div>
          <div>
            <p className="text-gray-400">SS Claim Age</p>
            <p className="text-white font-bold text-sm">{assumptions.ssClaimAge}</p>
          </div>
          <div>
            <p className="text-gray-400">Success Prob.</p>
            <p className={`font-bold text-sm ${getSuccessColor(monteCarloResult?.probabilityOfSuccess ?? 0)}`}>
              {formatPercent(monteCarloResult?.probabilityOfSuccess ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-gray-400">Median Estate</p>
            <p className="text-white font-bold text-sm">{formatCurrency(monteCarloResult?.medianEndingWealth ?? 0, true)}</p>
          </div>
        </div>
      </Card>

      {/* Saved Scenarios */}
      {scenarios.length === 0 ? (
        <Card className="p-8 text-center">
          <DocumentDuplicateIcon className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No saved scenarios yet.</p>
          <p className="text-gray-500 text-xs mt-1">Save your current plan above to start comparing scenarios.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Saved Scenarios ({scenarios.length})</h3>
          {scenarios.map((scenario, i) => (
            <motion.div key={scenario.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={`p-4 ${scenario.id === activeScenarioId ? 'border-blue-500/40 bg-blue-500/5' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingId === scenario.id ? (
                      <div className="flex gap-2 mb-2">
                        <input
                          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRename(scenario.id)}
                          autoFocus
                        />
                        <Button size="sm" variant="primary" onClick={() => handleRename(scenario.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1.5">
                        <h4 className="text-sm font-semibold text-white truncate">{scenario.name}</h4>
                        {scenario.id === activeScenarioId && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 flex-shrink-0">Active</span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-gray-400">
                      <div>Retire: <span className="text-white">{scenario.assumptions.retirementAge}</span></div>
                      <div>SS: <span className="text-white">{scenario.assumptions.ssClaimAge}</span></div>
                      <div>Return: <span className="text-white">{scenario.assumptions.expectedReturn}%</span></div>
                      <div>Spending: <span className="text-white">{formatCurrency(scenario.profile.retirementSpendingBeforeSS, true)}</span></div>
                      <div>Saved: <span className="text-white">{new Date(scenario.updatedAt).toLocaleDateString()}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant={scenario.id === activeScenarioId ? 'ghost' : 'primary'}
                      onClick={() => loadScenario(scenario.id)}
                    >
                      {scenario.id === activeScenarioId ? 'Loaded' : 'Load'}
                    </Button>
                    <button
                      onClick={() => { setEditingId(scenario.id); setEditName(scenario.name); }}
                      className="text-gray-500 hover:text-gray-300 p-1 transition-colors"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => duplicateScenario(scenario.id)}
                      className="text-gray-500 hover:text-gray-300 p-1 transition-colors"
                      title="Duplicate"
                    >
                      <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteScenario(scenario.id)}
                      className="text-red-500/50 hover:text-red-400 p-1 transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {scenarios.length >= 2 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Scenario Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-2 text-left text-xs text-gray-400">Scenario</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">Retire Age</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">SS Age</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">Spending</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">Return</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">Legacy Goal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {scenarios.map(s => (
                  <tr key={s.id} className={s.id === activeScenarioId ? 'bg-blue-500/5' : 'hover:bg-gray-800/30'}>
                    <td className="px-3 py-2 font-medium text-white text-xs truncate max-w-[160px]">{s.name}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{s.assumptions.retirementAge}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{s.assumptions.ssClaimAge}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{formatCurrency(s.profile.retirementSpendingBeforeSS, true)}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{s.assumptions.expectedReturn}%</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{formatCurrency(s.assumptions.legacyGoalPerDaughter, true)}</td>
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
