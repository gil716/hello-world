import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import { formatCurrency, formatPercent, getSuccessColor } from '../utils/formatters';
import {
  calculateNetWorth, calculateRetirementAssets, calculateFreedomNumber, getSocialSecurityBenefit
} from '../engine/financialCalculations';
import {
  BoltIcon, ExclamationTriangleIcon, InformationCircleIcon, CheckCircleIcon
} from '@heroicons/react/24/outline';

type Priority = 'critical' | 'high' | 'medium' | 'low';

interface Decision {
  priority: Priority;
  category: string;
  title: string;
  impact: string;
  action: string;
  quantifiedImpact?: string;
}

export function Decisions() {
  const { profile, assets, assumptions, monteCarloResult, cashFlows } = useFinancialStore();

  const retirementAssets = calculateRetirementAssets(assets);
  const ssAt70 = getSocialSecurityBenefit(70);
  const ssAtCurrent = getSocialSecurityBenefit(assumptions.ssClaimAge);
  const freedomNumber = calculateFreedomNumber(
    profile.retirementSpendingBeforeSS, 0,
    assumptions.inflationRate, assumptions.expectedReturn
  );

  const successProb = monteCarloResult?.probabilityOfSuccess ?? 0;
  const projectedEstate = cashFlows[cashFlows.length - 1]?.netWorth ?? 0;

  const decisions = useMemo<Decision[]>(() => {
    const items: Decision[] = [];

    // Retirement timing
    if (successProb >= 0.90 && retirementAssets >= freedomNumber * 0.95) {
      items.push({
        priority: 'high',
        category: 'Retirement Timing',
        title: 'You may be ready to retire',
        impact: `Portfolio is ${formatPercent(retirementAssets / freedomNumber)} of Freedom Number with ${formatPercent(successProb)} success probability`,
        action: `Consider retiring at age ${assumptions.retirementAge} as planned. Each additional year of work adds ~${formatCurrency(profile.salary * 0.3 + retirementAssets * assumptions.expectedReturn / 100, true)}.`,
        quantifiedImpact: `+${formatCurrency((profile.salary * 0.3) * 2, true)} from working 2 more years`,
      });
    } else if (successProb < 0.85) {
      const yearsNeeded = Math.ceil((freedomNumber - retirementAssets) / (profile.salary * 0.3 + retirementAssets * assumptions.expectedReturn / 100));
      items.push({
        priority: successProb < 0.75 ? 'critical' : 'high',
        category: 'Retirement Timing',
        title: `Consider working ${Math.min(yearsNeeded, 5)} more year${yearsNeeded !== 1 ? 's' : ''}`,
        impact: `Current success probability of ${formatPercent(successProb)} is below 85% target`,
        action: `Retiring at ${assumptions.retirementAge + Math.min(yearsNeeded, 3)} instead of ${assumptions.retirementAge} would improve success probability by ~15%.`,
        quantifiedImpact: `Success rate improves to ~${formatPercent(Math.min(0.99, successProb + 0.15))}`,
      });
    }

    // Social Security
    if (assumptions.ssClaimAge < 70) {
      const extraSS = ssAt70 - ssAtCurrent;
      items.push({
        priority: 'high',
        category: 'Social Security',
        title: 'Delay Social Security to age 70',
        impact: `Claiming at ${assumptions.ssClaimAge} vs 70: ${formatCurrency(extraSS, true)}/year difference`,
        action: `Delay SS to 70 and draw from portfolio instead. Break-even occurs around age ${Math.round(70 + (ssAtCurrent * (70 - assumptions.ssClaimAge)) / extraSS)}.`,
        quantifiedImpact: `+${formatCurrency(extraSS, true)}/year lifetime income`,
      });
    }

    // Roth conversion
    const traditionalTotal = assets.traditionalIRA + assets.k401;
    if (traditionalTotal > 500000) {
      const rmdAt73 = traditionalTotal * Math.pow(1 + assumptions.expectedReturn / 100, 73 - profile.age) / 26.5;
      items.push({
        priority: 'high',
        category: 'Tax Planning',
        title: 'Begin Roth conversion strategy',
        impact: `Traditional IRA/401k balance of ${formatCurrency(traditionalTotal, true)} will generate RMDs of ~${formatCurrency(rmdAt73, true)}/year at age 73`,
        action: 'Convert $150,000-$175,000 annually in early retirement to fill the 24% bracket (before RMDs begin at 73).',
        quantifiedImpact: `Estimated lifetime tax savings: ${formatCurrency(rmdAt73 * 0.32 * 15, true)}`,
      });
    }

    // HSA maximization
    if (profile.age < 65 && profile.healthcareType === 'ACA') {
      items.push({
        priority: 'medium',
        category: 'Tax Planning',
        title: 'Maximize HSA contributions',
        impact: 'HSA is the only triple-tax-advantaged account (pre-tax, grows tax-free, tax-free withdrawals for medical)',
        action: 'Contribute $8,300/year (2024 family limit). Invest HSA funds rather than keeping as cash.',
        quantifiedImpact: `${formatCurrency(8300 * 0.37, true)}/year in tax savings at 37% marginal rate`,
      });
    }

    // 401k maximization
    if (profile.employee401kContribution < 30500) {
      items.push({
        priority: 'medium',
        category: 'Savings',
        title: 'Maximize 401k catch-up contributions',
        impact: `Currently contributing ${formatCurrency(profile.employee401kContribution, true)} vs maximum ${formatCurrency(30500, true)}`,
        action: 'Increase to $30,500 (includes $7,500 catch-up for age 50+). Especially valuable at 37% tax bracket.',
        quantifiedImpact: `${formatCurrency((30500 - profile.employee401kContribution) * 0.37, true)}/year additional tax savings`,
      });
    }

    // Healthcare planning
    items.push({
      priority: 'medium',
      category: 'Healthcare',
      title: 'Plan ACA healthcare bridge strategy',
      impact: `Pre-Medicare healthcare (ages ${assumptions.retirementAge}-64) estimated at $18,000-$24,000/year on ACA marketplace`,
      action: 'Manage MAGI below 400% FPL threshold for ACA subsidies. Roth conversions and capital gains must be managed carefully.',
      quantifiedImpact: `Potential subsidy savings: ${formatCurrency(8000, true)}-${formatCurrency(15000, true)}/year`,
    });

    // Portfolio allocation check
    const equityPct = 0.90; // simplified
    if (profile.age > 55 && equityPct > 0.75) {
      items.push({
        priority: 'low',
        category: 'Portfolio',
        title: 'Review portfolio allocation for retirement',
        impact: 'Portfolio appears equity-heavy for approaching retirement. Sequence-of-returns risk increases near retirement.',
        action: 'Consider a glide path toward 60-70% equity at retirement. Maintain 2-3 year cash buffer to avoid selling in downturns.',
        quantifiedImpact: 'Reduces sequence risk — protects against 30%+ market decline in first years of retirement',
      });
    }

    // Legacy goals
    if (projectedEstate < assumptions.legacyGoalPerDaughter * 2) {
      const gap = assumptions.legacyGoalPerDaughter * 2 - projectedEstate;
      items.push({
        priority: 'medium',
        category: 'Estate Planning',
        title: 'Legacy goal at risk',
        impact: `Projected estate (${formatCurrency(projectedEstate, true)}) is below ${formatCurrency(assumptions.legacyGoalPerDaughter * 2, true)} goal`,
        action: `Consider life insurance to guarantee legacy, or adjust spending to reduce portfolio drawdown. Gap: ${formatCurrency(gap, true)}.`,
        quantifiedImpact: `${formatCurrency(gap, true)} shortfall at life expectancy`,
      });
    } else {
      items.push({
        priority: 'low',
        category: 'Estate Planning',
        title: 'Legacy goals on track',
        impact: `Projected estate of ${formatCurrency(projectedEstate, true)} exceeds ${formatCurrency(assumptions.legacyGoalPerDaughter * 2, true)} total goal`,
        action: 'Consider irrevocable trusts or direct gifting ($18,000/year per person tax-free) to reduce taxable estate and maximize legacy impact.',
        quantifiedImpact: `Surplus: ${formatCurrency(projectedEstate - assumptions.legacyGoalPerDaughter * 2, true)}`,
      });
    }

    return items.sort((a, b) => {
      const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });
  }, [profile, assets, assumptions, monteCarloResult, cashFlows, successProb]);

  const priorityConfig: Record<Priority, { color: string; bg: string; border: string; Icon: typeof BoltIcon; label: string }> = {
    critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: ExclamationTriangleIcon, label: 'Critical' },
    high: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', Icon: BoltIcon, label: 'High Priority' },
    medium: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', Icon: InformationCircleIcon, label: 'Medium' },
    low: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', Icon: CheckCircleIcon, label: 'Low' },
  };

  return (
    <div className="space-y-5">
      {/* CFO Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { q: 'Work Optional?', a: retirementAssets >= freedomNumber ? 'Yes' : 'Not yet', color: retirementAssets >= freedomNumber ? 'text-emerald-400' : 'text-amber-400' },
          { q: 'Freedom Number', a: formatCurrency(freedomNumber, true), color: 'text-blue-400' },
          { q: '1-yr Work Value', a: formatCurrency(profile.salary * 0.3 + retirementAssets * assumptions.expectedReturn / 100, true), color: 'text-violet-400' },
          { q: 'Legacy On Track?', a: projectedEstate >= assumptions.legacyGoalPerDaughter * 2 ? 'Yes' : 'At Risk', color: projectedEstate >= assumptions.legacyGoalPerDaughter * 2 ? 'text-emerald-400' : 'text-amber-400' },
          { q: 'Success Rate', a: formatPercent(successProb), color: getSuccessColor(successProb) },
          { q: 'Top Action', a: decisions[0]?.category ?? '—', color: 'text-white' },
        ].map(item => (
          <Card key={item.q} className="p-3 text-center">
            <p className="text-xs text-gray-500">{item.q}</p>
            <p className={`text-sm font-bold mt-0.5 ${item.color}`}>{item.a}</p>
          </Card>
        ))}
      </div>

      {/* Decisions List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Recommended Actions ({decisions.length})</h3>
        {decisions.map((dec, i) => {
          const cfg = priorityConfig[dec.priority];
          const Icon = cfg.Icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className={`p-4 ${cfg.bg} border ${cfg.border}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 w-5 h-5 ${cfg.color}`}>
                    <Icon className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-gray-500 ml-2">· {dec.category}</span>
                      </div>
                      {dec.quantifiedImpact && (
                        <span className={`text-xs font-mono font-bold flex-shrink-0 ${cfg.color}`}>{dec.quantifiedImpact}</span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-white mt-1">{dec.title}</h4>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{dec.impact}</p>
                    <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                      <strong>Action:</strong> {dec.action}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
