import type { UserProfile, Assets, RetirementAssumptions, CashFlowYear, TaxAnalysis, RetirementComparisonRow, SocialSecurityBenefit } from '../types';

export const SS_BENEFITS: SocialSecurityBenefit[] = [
  { claimAge: 62, monthlyBenefit: 4464, annualBenefit: 53568 },
  { claimAge: 65, monthlyBenefit: 5510, annualBenefit: 66114 },
  { claimAge: 66, monthlyBenefit: 5939, annualBenefit: 71262 },
  { claimAge: 67, monthlyBenefit: 6368, annualBenefit: 76410 },
  { claimAge: 70, monthlyBenefit: 7911, annualBenefit: 94932 },
];

export function getSocialSecurityBenefit(claimAge: number): number {
  const match = SS_BENEFITS.find(b => b.claimAge === claimAge);
  return match ? match.annualBenefit : 76410;
}

// 2024 Federal Tax Brackets (MFJ)
const TAX_BRACKETS_MFJ = [
  { min: 0, max: 23200, rate: 0.10 },
  { min: 23200, max: 94300, rate: 0.12 },
  { min: 94300, max: 201050, rate: 0.22 },
  { min: 201050, max: 383900, rate: 0.24 },
  { min: 383900, max: 487450, rate: 0.32 },
  { min: 487450, max: 731200, rate: 0.35 },
  { min: 731200, max: Infinity, rate: 0.37 },
];

const STANDARD_DEDUCTION_MFJ = 29200;

export function calculateFederalTax(taxableIncome: number): number {
  let tax = 0;
  for (const bracket of TAX_BRACKETS_MFJ) {
    if (taxableIncome <= bracket.min) break;
    const amount = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += amount * bracket.rate;
  }
  return tax;
}

export function getMarginalRate(taxableIncome: number): number {
  for (let i = TAX_BRACKETS_MFJ.length - 1; i >= 0; i--) {
    if (taxableIncome > TAX_BRACKETS_MFJ[i].min) {
      return TAX_BRACKETS_MFJ[i].rate;
    }
  }
  return 0.10;
}

export function calculateTaxAnalysis(
  profile: UserProfile,
  assets: Assets,
  assumptions: RetirementAssumptions
): TaxAnalysis {
  const grossIncome = profile.salary + profile.annualBonus;
  const traditional401kContrib = profile.employee401kContribution;
  const agiBeforeDeductions = grossIncome - traditional401kContrib;
  const taxableIncome = Math.max(0, agiBeforeDeductions - STANDARD_DEDUCTION_MFJ);

  const federalTax = calculateFederalTax(taxableIncome);
  const ficaTax = Math.min(profile.salary, 168600) * 0.062 * 2 + profile.salary * 0.0145 * 2;
  const effectiveRate = federalTax / grossIncome;
  const marginalRate = getMarginalRate(taxableIncome);

  const irmaaRisk = agiBeforeDeductions > 206000;

  const yearsToRmd = Math.max(0, 73 - profile.age);
  const traditionalAtRmd = (assets.traditionalIRA + assets.k401) *
    Math.pow(1 + assumptions.expectedReturn / 100, yearsToRmd);
  const rmdAge73 = traditionalAtRmd / 26.5;

  const topOf24 = 383900;
  const optimalRothConversion = Math.max(0, topOf24 - taxableIncome);

  const rmdTaxCost = rmdAge73 * 0.32 * 20;
  const conversionTaxCost = optimalRothConversion * 0.24;
  const lifetimeTaxSavingsFromRoth = Math.max(0, rmdTaxCost - conversionTaxCost);

  return {
    federalTax,
    stateTax: 0,
    ficaTax,
    effectiveRate,
    marginalRate,
    taxableIncome,
    capitalGains: assets.taxableBrokerage * 0.02,
    irmaaRisk,
    rmdAge73,
    optimalRothConversion,
    lifetimeTaxSavingsFromRoth,
  };
}

export function calculateHealthcareCost(age: number, healthcareType: string): number {
  if (age >= 65) return 6000;
  if (healthcareType === 'ACA') {
    if (age < 55) return 12000;
    if (age < 60) return 18000;
    return 24000;
  }
  if (healthcareType === 'Employer') return 8000;
  return 15000;
}

function calculateMortgagePayment(principal: number, annualRate: number, years: number): number {
  if (years <= 0 || annualRate === 0) return principal;
  const monthlyRate = annualRate / 12;
  const n = years * 12;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1) * 12;
}

export function projectCashFlows(
  profile: UserProfile,
  assets: Assets,
  assumptions: RetirementAssumptions,
  rothConversionAmount: number = 0
): CashFlowYear[] {
  const years: CashFlowYear[] = [];
  const maxAge = Math.max(assumptions.lifeExpectancy, 100);
  const currentYear = new Date().getFullYear();

  let traditionalBal = assets.traditionalIRA + assets.k401;
  let rothBal = assets.rothIRA + assets.hsa;
  let taxableBal = assets.taxableBrokerage;
  let cashBal = assets.cash;
  let college529 = assets.college529;
  let mortgageBalance = assets.mortgage;
  const annualMortgagePayment = mortgageBalance > 0
    ? calculateMortgagePayment(assets.mortgage, assets.mortgageRate / 100, assets.mortgagePayoffYear - currentYear)
    : 0;

  const annualReturn = assumptions.expectedReturn / 100;
  const inflationRate = assumptions.inflationRate / 100;

  const collegeYear2Start = currentYear + 2;
  const annualCollegeCost = 35000;

  for (let age = profile.age; age <= maxAge; age++) {
    const year = currentYear + (age - profile.age);
    const isWorking = age < assumptions.retirementAge;
    const isRetired = !isWorking;
    const hasSS = age >= assumptions.ssClaimAge;
    const mortgagePaid = year >= assets.mortgagePayoffYear;
    const inflFactor = Math.pow(1 + inflationRate, age - profile.age);

    const salary = isWorking ? profile.salary * inflFactor : 0;
    const bonus = isWorking ? profile.annualBonus * inflFactor : 0;
    const contrib401k = isWorking ? profile.employee401kContribution : 0;
    const employerMatch = isWorking ? profile.employerMatch401k : 0;
    const iraContrib = isWorking && age < 73 ? (age >= 50 ? 8000 : 7000) : 0;
    const rothContrib = isWorking && age < 73 ? (age >= 50 ? 8000 : 7000) : 0;
    const hsaContrib = isWorking && age < 65 ? 8300 : 0;
    const ssIncome = hasSS ? getSocialSecurityBenefit(assumptions.ssClaimAge) * inflFactor : 0;

    const spendingGoal = hasSS
      ? profile.retirementSpendingAfterSS * inflFactor
      : profile.retirementSpendingBeforeSS * inflFactor;
    const healthcare = calculateHealthcareCost(age, profile.healthcareType) * inflFactor;
    const mortgage = (!mortgagePaid && mortgageBalance > 0) ? annualMortgagePayment : 0;

    let collegeCost = 0;
    if (year >= collegeYear2Start && year < collegeYear2Start + 4) {
      collegeCost = annualCollegeCost * inflFactor;
      const fromPlan = Math.min(college529, collegeCost);
      college529 -= fromPlan;
      collegeCost = Math.max(0, collegeCost - fromPlan);
    }

    if (!mortgagePaid && mortgageBalance > 0) {
      const interestPayment = mortgageBalance * (assets.mortgageRate / 100);
      const principalPayment = Math.min(mortgageBalance, annualMortgagePayment - interestPayment);
      mortgageBalance = Math.max(0, mortgageBalance - principalPayment);
    }

    const traditionalGrowth = traditionalBal * annualReturn;
    const rothGrowth = rothBal * annualReturn;
    const taxableGrowth = taxableBal * annualReturn;

    traditionalBal += contrib401k + employerMatch + iraContrib + traditionalGrowth;
    rothBal += rothContrib + hsaContrib + rothGrowth;
    taxableBal += taxableGrowth;

    if (isRetired && rothConversionAmount > 0 && age < 73) {
      const conversion = Math.min(rothConversionAmount, traditionalBal);
      traditionalBal -= conversion;
      rothBal += conversion;
    }

    let taxes = 0;
    let withdrawals = 0;

    if (isWorking) {
      const taxableInc = Math.max(0, salary + bonus - contrib401k - iraContrib - STANDARD_DEDUCTION_MFJ);
      // Employee-only FICA (employer share is not the employee's cost)
      taxes = calculateFederalTax(taxableInc) + Math.min(salary, 168600) * 0.062 + salary * 0.0145;
      const livingExpenses = profile.retirementSpendingBeforeSS * inflFactor;
      const surplus = salary + bonus - contrib401k - iraContrib - rothContrib - hsaContrib - taxes - healthcare - mortgage - collegeCost - livingExpenses;
      if (surplus > 0) taxableBal += surplus;
      cashBal = assets.cash; // cash held flat as emergency fund during working years
    } else {
      // Retirement: first estimate how much the portfolio needs to cover
      const baseExpenses = spendingGoal + healthcare + mortgage + collegeCost;
      const portfolioNeededEstimate = Math.max(0, baseExpenses - ssIncome);

      // Estimate taxes: 85% of SS + most of traditional withdrawal is taxable
      const ssTaxable = hasSS ? ssIncome * 0.85 : 0;
      const totalPortfolio = Math.max(1, traditionalBal + rothBal + taxableBal);
      const traditionalFraction = Math.min(0.95, traditionalBal / totalPortfolio);
      const estTraditionalWithdrawal = portfolioNeededEstimate * traditionalFraction;
      const retirementTaxableInc = Math.max(0, ssTaxable + estTraditionalWithdrawal - STANDARD_DEDUCTION_MFJ);
      taxes = calculateFederalTax(retirementTaxableInc);

      const totalNeeded = Math.max(0, portfolioNeededEstimate + taxes);
      withdrawals = totalNeeded;

      if (taxableBal >= totalNeeded) {
        taxableBal -= totalNeeded;
      } else {
        const fromTaxable = taxableBal;
        taxableBal = 0;
        const fromTraditional = Math.min(traditionalBal, totalNeeded - fromTaxable);
        traditionalBal -= fromTraditional;
        const fromRoth = Math.max(0, totalNeeded - fromTaxable - fromTraditional);
        rothBal = Math.max(0, rothBal - fromRoth);
      }
    }

    const homeValue = assets.homeValue * Math.pow(1 + 0.03, age - profile.age);
    const netWorth = traditionalBal + rothBal + taxableBal + cashBal + homeValue + college529 - mortgageBalance;

    years.push({
      age,
      year,
      salary,
      bonus,
      contribution401k: contrib401k,
      employerMatch,
      iraContribution: iraContrib,
      rothContribution: rothContrib,
      hsaContribution: hsaContrib,
      taxes,
      healthcareCosts: healthcare,
      mortgagePayment: mortgage,
      collegeCosts: collegeCost,
      socialSecurity: ssIncome,
      withdrawals,
      rothConversion: isRetired ? Math.min(rothConversionAmount, traditionalBal) : 0,
      investmentGrowth: traditionalGrowth + rothGrowth + taxableGrowth,
      endingBalance: traditionalBal + rothBal + taxableBal + cashBal,
      traditionalBalance: traditionalBal,
      rothBalance: rothBal,
      taxableBalance: taxableBal,
      cashBalance: cashBal,
      netWorth,
    });
  }

  return years;
}

export function calculateNetWorth(assets: Assets): number {
  return assets.traditionalIRA + assets.k401 + assets.rothIRA + assets.hsa +
    assets.taxableBrokerage + assets.college529 + assets.cash +
    assets.homeValue - assets.mortgage;
}

export function calculateRetirementAssets(assets: Assets): number {
  return assets.traditionalIRA + assets.k401 + assets.rothIRA + assets.hsa;
}

export function calculateFreedomNumber(
  annualSpending: number,
  ssIncome: number,
  inflationRate: number,
  returnRate: number
): number {
  const netSpending = annualSpending - ssIncome;
  const safeWithdrawalRate = returnRate - inflationRate;
  const swr = Math.max(0.03, safeWithdrawalRate);
  return netSpending / swr;
}

export function compareRetirementAges(
  profile: UserProfile,
  assets: Assets,
  assumptions: RetirementAssumptions,
  monteCarloFn: (flows: CashFlowYear[], returnRate: number, volatility: number) => number
): RetirementComparisonRow[] {
  const rows: RetirementComparisonRow[] = [];
  for (let retireAge = 55; retireAge <= 65; retireAge++) {
    const modifiedAssumptions = { ...assumptions, retirementAge: retireAge };
    const flows = projectCashFlows(profile, assets, modifiedAssumptions);
    const prob = monteCarloFn(flows, assumptions.expectedReturn, assumptions.expectedVolatility);

    const lastFlow = flows[flows.length - 1];
    rows.push({
      retireAge,
      probabilityOfSuccess: prob,
      medianEstate: lastFlow?.netWorth ?? 0,
      medianTaxes: flows.reduce((sum, f) => sum + f.taxes, 0),
      maxSafeSpending: (lastFlow?.endingBalance ?? 0) * 0.04,
      legacyProbability: prob * 0.8,
    });
  }
  return rows;
}
