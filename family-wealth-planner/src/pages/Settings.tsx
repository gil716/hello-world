import { useRef } from 'react';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ArrowUpTrayIcon, ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline';

export function Settings() {
  const { profile, updateProfile, exportData, importData } = useFinancialStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (ev.target?.result) importData(ev.target.result as string);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `family-wealth-plan-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearStorage = () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      localStorage.removeItem('family-wealth-planner');
      window.location.reload();
    }
  };

  const InputField = ({ label, field, value, type = 'number' }: { label: string; field: keyof typeof profile; value: string | number; type?: string }) => (
    <div>
      <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
        value={value}
        onChange={e => updateProfile({ [field]: type === 'number' ? +e.target.value : e.target.value } as any)}
      />
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Personal Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <InputField label="Your Age" field="age" value={profile.age} />
          <InputField label="Spouse Age" field="spouseAge" value={profile.spouseAge} />
          <InputField label="Number of Children" field="children" value={profile.children} />
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Risk Profile</label>
            <select
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              value={profile.riskProfile}
              onChange={e => updateProfile({ riskProfile: e.target.value as any })}
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
              <option value="flexible">Flexible (reduce spending if markets decline)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Healthcare Coverage</label>
            <select
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              value={profile.healthcareType}
              onChange={e => updateProfile({ healthcareType: e.target.value as any })}
            >
              <option value="Employer">Employer</option>
              <option value="ACA">ACA Marketplace</option>
              <option value="Medicare">Medicare</option>
              <option value="None">None</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Income & Savings</h3>
        <div className="grid grid-cols-2 gap-4">
          <InputField label="Annual Salary" field="salary" value={profile.salary} />
          <InputField label="Annual Bonus" field="annualBonus" value={profile.annualBonus} />
          <InputField label="Employee 401k Contribution" field="employee401kContribution" value={profile.employee401kContribution} />
          <InputField label="Employer Match" field="employerMatch401k" value={profile.employerMatch401k} />
          <InputField label="Retirement Spending (Before SS)" field="retirementSpendingBeforeSS" value={profile.retirementSpendingBeforeSS} />
          <InputField label="Retirement Spending (After SS)" field="retirementSpendingAfterSS" value={profile.retirementSpendingAfterSS} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Data Management</h3>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={handleExport} icon={<ArrowDownTrayIcon />}>
              Export as JSON
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<ArrowUpTrayIcon />}>
              Import JSON
            </Button>
            <input type="file" ref={fileRef} onChange={handleImport} accept=".json" className="hidden" />
          </div>
          <p className="text-xs text-gray-500">
            All data is stored locally in your browser. Export regularly to preserve your plan.
          </p>
          <div className="border-t border-gray-800 pt-3">
            <Button variant="danger" onClick={clearStorage} icon={<TrashIcon />}>
              Reset All Data
            </Button>
            <p className="text-xs text-gray-500 mt-2">Clears all saved data and resets to defaults. Cannot be undone.</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">About</h3>
        <div className="space-y-1 text-xs text-gray-400">
          <p>Family Wealth Planner v1.0</p>
          <p>All calculations are for illustrative purposes only and do not constitute financial advice.</p>
          <p>No data is transmitted to any server. Everything runs in your browser.</p>
          <p className="mt-2 text-gray-500">Built with React, TypeScript, TailwindCSS, Zustand, Recharts, and Framer Motion.</p>
        </div>
      </Card>
    </div>
  );
}
