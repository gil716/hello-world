import type { UserProfile, Assets, RetirementAssumptions, CashFlowYear, MonteCarloResult } from '../types';
import {
  calculateNetWorth,
  calculateRetirementAssets,
  calculateFreedomNumber,
  getSocialSecurityBenefit,
} from './financialCalculations';

interface AdvisorContext {
  profile: UserProfile;
  assets: Assets;
  assumptions: RetirementAssumptions;
  cashFlows: CashFlowYear[];
  monteCarloResult: MonteCarloResult | null;
}

export function generateAIResponse(
  userMessage: string,
  context: AdvisorContext
): string {
  const { profile, assets, assumptions, cashFlows, monteCarloResult } = context;
  const msg = userMessage.toLowerCase();

  const netWorth = calculateNetWorth(assets);
  const retirementAssets = calculateRetirementAssets(assets);
  const ssIncome = getSocialSecurityBenefit(assumptions.ssClaimAge);
  const freedomNumber = calculateFreedomNumber(
    profile.retirementSpendingBeforeSS,
    0,
    assumptions.inflationRate,
    assumptions.expectedReturn
  );
  const successProb = monteCarloResult?.probabilityOfSuccess ?? 0;
  const fmt = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  if (msg.includes('retire') && (msg.includes('next year') || msg.includes('now') || msg.includes('today') || msg.includes('ready'))) {
    const canRetireNow = retirementAssets >= freedomNumber * 0.9 && successProb >= 0.85;

    if (canRetireNow) {
      return `Based on your current financials, **you are likely ready to retire**. Here's the analysis:

**Current Position:**
- Retirement assets: ${fmt(retirementAssets)} vs. Freedom Number: ${fmt(freedomNumber)}
- Probability of success: ${pct(successProb)}
- Annual spending needed: ${fmt(profile.retirementSpendingBeforeSS)} before SS

**Recommendation:** Your portfolio is ${pct(retirementAssets / freedomNumber)} of your Freedom Number. With a ${pct(successProb)} probability of success over your planning horizon, retiring now or next year appears financially viable.

**Key considerations:**
1. Healthcare: Pre-Medicare ACA coverage will cost ~$18,000-24,000/year
2. Delaying SS to 70 adds ${fmt(ssIncome - getSocialSecurityBenefit(62))}/year vs. claiming at 62
3. Consider a Roth conversion strategy during early retirement to reduce future RMDs

One more year of work adds approximately ${fmt(profile.salary * 0.3)} in after-tax savings to your portfolio.`;
    } else {
      const gap = freedomNumber - retirementAssets;
      return `Your current financials suggest **waiting 2-3 more years** before retiring. Here's why:

**Gap Analysis:**
- Retirement assets: ${fmt(retirementAssets)}
- Freedom Number: ${fmt(freedomNumber)}
- Gap: ${fmt(gap)}
- Current probability of success: ${pct(successProb)}

**What you'd gain by working until age ${profile.age + 2}:**
- Additional savings: ~${fmt((profile.salary + profile.annualBonus) * 0.25 + profile.employerMatch401k + profile.employee401kContribution)}
- Investment growth: ~${fmt(retirementAssets * (assumptions.expectedReturn / 100))}
- Success probability improves by ~5-8%

**Priority actions:**
1. Maximize 401k + catch-up contributions ($30,500/year)
2. Maximize HSA ($8,300/year — triple tax advantage)
3. Begin Roth conversions in retirement year to fill the 22% bracket`;
    }
  }

  if (msg.includes('market') && (msg.includes('drop') || msg.includes('crash') || msg.includes('35') || msg.includes('decline'))) {
    const dropPct = msg.includes('35') ? 0.35 : msg.includes('50') ? 0.50 : 0.35;
    const droppedAssets = retirementAssets * (1 - dropPct);
    const recoveryYears = Math.ceil(Math.log(retirementAssets / droppedAssets) / Math.log(1 + assumptions.expectedReturn / 100));

    return `**Scenario: ${(dropPct * 100).toFixed(0)}% Market Decline**

**Immediate Impact:**
- Portfolio drops from ${fmt(retirementAssets)} to ${fmt(droppedAssets)}
- Net worth decreases by ~${fmt(retirementAssets * dropPct)}

**Recovery Analysis:**
- Expected recovery time: ${recoveryYears} years at ${assumptions.expectedReturn}% returns
- Your risk profile ("reduce spending and work part-time") provides significant protection

**Resilience strategies in your plan:**
1. **Flexible spending:** Cutting from ${fmt(profile.retirementSpendingBeforeSS)} to ${fmt(profile.retirementSpendingBeforeSS * 0.8)} saves ${fmt(profile.retirementSpendingBeforeSS * 0.2)}/year
2. **Part-time income:** Even ${fmt(50000)}/year extends portfolio by 5+ years
3. **SS delay:** If pre-SS, consider claiming earlier to reduce portfolio withdrawals
4. **Cash buffer:** Your ${fmt(assets.cash)} cash reserve provides 1+ years of spending without selling assets

**Monte Carlo shows:** Your plan has a ${pct(successProb)} success rate even in simulated adverse sequences.`;
  }

  if (msg.includes('spend') && (msg.includes('180') || msg.includes('200') || msg.includes('what if'))) {
    const newSpending = msg.includes('180') ? 180000 : msg.includes('200') ? 200000 : 165000;
    const spendingIncrease = newSpending - profile.retirementSpendingBeforeSS;
    const newFreedomNumber = newSpending / (assumptions.expectedReturn / 100 - assumptions.inflationRate / 100);
    const newSuccessEst = Math.max(0.5, successProb - (spendingIncrease / 10000) * 0.02);

    return `**Scenario: Spending ${fmt(newSpending)}/year in Retirement**

**Impact Analysis:**
- Current plan: ${fmt(profile.retirementSpendingBeforeSS)}/year
- New spending: ${fmt(newSpending)}/year (+${fmt(spendingIncrease)})
- New Freedom Number required: ${fmt(Math.round(newFreedomNumber / 10000) * 10000)}

**Probability of Success Impact:**
- Current: ${pct(successProb)}
- Estimated with higher spending: ~${pct(newSuccessEst)}
- Change: -${((successProb - newSuccessEst) * 100).toFixed(1)}%

**To support ${fmt(newSpending)} spending, consider:**
1. Work 1-2 additional years (adds ~${fmt((profile.salary + profile.annualBonus) * 0.25)} in savings)
2. Delay Social Security to 70 (adds ${fmt(ssIncome - getSocialSecurityBenefit(62))}/year)
3. Partial Roth conversions now to reduce future tax drag
4. Portfolio can support it if markets perform at ${(assumptions.expectedReturn + 1).toFixed(1)}%+ average`;
  }

  if (msg.includes('inherit') && (msg.includes('500') || msg.includes('million'))) {
    const inheritance = msg.includes('million') ? 1000000 : 500000;
    const newNetWorth = netWorth + inheritance;
    const newRetirementAssets = retirementAssets + inheritance;
    const newSuccessEst = Math.min(0.99, successProb + 0.08);

    return `**Scenario: ${fmt(inheritance)} Inheritance**

**Updated Financial Position:**
- Net worth: ${fmt(newNetWorth)} (was ${fmt(netWorth)})
- Retirement assets: ${fmt(newRetirementAssets)}
- Estimated probability of success: ~${pct(newSuccessEst)}

**Strategic Allocation Recommendation:**
1. **Taxable brokerage** (${fmt(inheritance * 0.4)}): Invest in low-cost index funds; step-up in basis benefit
2. **Roth conversion** (${fmt(Math.min(inheritance * 0.3, 175000))}): Convert from traditional IRA at favorable rates
3. **Cash reserve** (${fmt(inheritance * 0.1)}): Extend emergency fund to 2 years
4. **529/Estate** (${fmt(inheritance * 0.2)}): Superfund 529s or establish irrevocable trust

**Tax considerations:**
- Inherited assets receive step-up in cost basis (no capital gains on appreciation)
- Consider a Donor-Advised Fund for charitable portion

This significantly **improves your ability to meet legacy goals** of ${fmt(assumptions.legacyGoalPerDaughter * 2)}.`;
  }

  if (msg.includes('vacation') || msg.includes('second home')) {
    const homePrice = 500000;
    const downPayment = homePrice * 0.2;
    const annualCost = homePrice * 0.025 + 15000;

    return `**Scenario: Vacation Home Purchase**

**Assumptions:** ${fmt(homePrice)} purchase, ${fmt(downPayment)} down payment

**Impact on Retirement Plan:**
- Down payment reduces investment portfolio by ${fmt(downPayment)}
- Annual carrying costs: ~${fmt(annualCost)} (taxes, maintenance, insurance, HOA)
- Opportunity cost: ~${fmt(downPayment * assumptions.expectedReturn / 100)}/year in lost portfolio growth

**Portfolio Impact:**
- Retirement assets decrease: ${fmt(retirementAssets)} → ${fmt(retirementAssets - downPayment)}
- Annual cash need increases by ${fmt(annualCost)}
- Estimated probability impact: -5 to -8%

**Before purchasing, verify:**
1. Portfolio can sustain an extra ${fmt(annualCost)}/year without reducing success below 85%
2. Rental income potential could offset carrying costs
3. Estate implications — real property is harder to divide between heirs`;
  }

  if (msg.includes('freedom') || msg.includes('leave') || msg.includes('quit') || msg.includes('optional')) {
    const deficit = freedomNumber - retirementAssets;
    const yearsToFreedom = deficit > 0
      ? Math.ceil(Math.log(freedomNumber / retirementAssets) / Math.log(1 + (assumptions.expectedReturn / 100 - assumptions.inflationRate / 100)))
      : 0;

    return `**Your Freedom Number Analysis**

**Freedom Number:** ${fmt(freedomNumber)}
*(The minimum portfolio that makes paid work optional)*

**Current Status:**
- Retirement assets: ${fmt(retirementAssets)} (${pct(retirementAssets / freedomNumber)} of target)
- ${deficit > 0 ? `Gap: ${fmt(deficit)}` : '**You have already reached your Freedom Number!**'}
- At current savings rate: ~${yearsToFreedom > 0 ? `${yearsToFreedom} years` : 'achieved'} to Freedom Number

**The value of your current job:**
- Annual after-tax earnings + savings: ~${fmt((profile.salary + profile.annualBonus) * 0.65 + profile.employee401kContribution + profile.employerMatch401k)}
- Each additional year of work adds ~${fmt(retirementAssets * (assumptions.expectedReturn / 100) + profile.salary * 0.3)} to final wealth
- Working until ${profile.age + 2} vs. ${profile.age}: +${fmt((profile.salary * 0.3 + retirementAssets * assumptions.expectedReturn / 100) * 2)} in wealth

**Recommendation:** ${deficit > 0 ? `Work ${yearsToFreedom} more year${yearsToFreedom !== 1 ? 's' : ''} to reach your Freedom Number` : 'Your work is now optional from a financial standpoint'}.`;
  }

  if (msg.includes('daughter') || msg.includes('legacy') || msg.includes('estate')) {
    const targetLegacy = assumptions.legacyGoalPerDaughter * 2;
    const projectedEstate = cashFlows.length > 0 ? cashFlows[cashFlows.length - 1]?.netWorth ?? 0 : 0;

    return `**Legacy Planning for Your Daughters**

**Goal:** ${fmt(assumptions.legacyGoalPerDaughter)} per daughter (${fmt(targetLegacy)} total)
**Projected Estate:** ~${fmt(projectedEstate)}

**Current Status:** ${projectedEstate >= targetLegacy ? '✓ On track' : '⚠ Below target'}

**Strategies to maximize legacy:**
1. **Roth IRA inheritance:** Roth assets pass tax-free; daughters have 10 years to distribute
2. **Step-up in basis:** Taxable brokerage assets receive new cost basis at death
3. **Life insurance:** Term policy can guarantee legacy regardless of market performance
4. **529 plans:** Excess after college can transfer to grandchildren
5. **Irrevocable trust:** Protects assets and ensures controlled distribution`;
  }

  if (msg.includes('social security') || msg.includes('ss') || msg.includes('claim')) {
    const at62 = getSocialSecurityBenefit(62);
    const at70 = getSocialSecurityBenefit(70);

    return `**Social Security Strategy Analysis**

**Your benefit estimates:**
- Age 62: ${fmt(at62)}/year
- Age 67 (FRA): ${fmt(getSocialSecurityBenefit(67))}/year
- Age 70: ${fmt(at70)}/year

**Break-even analysis (62 vs 70):**
- Additional annual income from delaying: ${fmt(at70 - at62)}
- Break-even: approximately age ${Math.ceil(70 + (at62 * 8) / (at70 - at62))}

**Recommendation for you:**
Delaying to age 70 is strongly recommended:
1. Adds ${fmt(at70 - getSocialSecurityBenefit(assumptions.ssClaimAge))}/year vs. current plan
2. Reduces portfolio withdrawal by ~${((at70 - getSocialSecurityBenefit(assumptions.ssClaimAge)) / profile.retirementSpendingBeforeSS * 100).toFixed(0)}%
3. Provides longevity insurance if you live past 85
4. Survivor benefit: spouse gets the higher of the two benefits

The ${fmt(at70)}/year from age 70 is like owning an inflation-adjusted annuity worth ~${fmt(at70 / 0.04)}.`;
  }

  return `I'm your Family Wealth Planner AI Advisor. Here's a quick snapshot of your financial position:

**Net Worth:** ${fmt(netWorth)}
**Retirement Assets:** ${fmt(retirementAssets)}
**Freedom Number:** ${fmt(freedomNumber)} (${pct(retirementAssets / freedomNumber)} there)
**Success Probability:** ${pct(successProb)}

**Questions I can answer:**
- "Can I retire next year?"
- "What if the market drops 35%?"
- "What if I spend $180,000 in retirement?"
- "What if I inherit $500,000?"
- "What if I buy a vacation home?"
- "What's my Freedom Number?"
- "How should I claim Social Security?"
- "What can I leave my daughters?"

What would you like to explore?`;
}
