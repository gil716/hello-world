export interface UserProfile {
  age: number;
  spouseAge: number;
  children: number;
  salary: number;
  annualBonus: number;
  employerMatch401k: number;
  employee401kContribution: number;
  retirementSpendingBeforeSS: number;
  retirementSpendingAfterSS: number;
  healthcareType: 'ACA' | 'Employer' | 'Medicare' | 'None';
  riskProfile: 'conservative' | 'moderate' | 'aggressive' | 'flexible';
}

export interface Assets {
  cash: number;
  homeValue: number;
  mortgage: number;
  mortgageRate: number;
  mortgagePayoffYear: number;
  traditionalIRA: number;
  k401: number;
  rothIRA: number;
  hsa: number;
  taxableBrokerage: number;
  college529: number;
}

export interface RetirementAssumptions {
  retirementAge: number;
  inflationRate: number;
  expectedReturn: number;
  expectedVolatility: number;
  lifeExpectancy: number;
  spouseLifeExpectancy: number;
  legacyGoalPerDaughter: number;
  collegeCostsOutOfPocket: number;
  ssClaimAge: 62 | 65 | 66 | 67 | 70;
}

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  costBasis: number;
  marketValue: number;
  dividendYield: number;
  expenseRatio: number;
  taxLocation: 'Taxable' | 'Traditional' | 'Roth' | 'HSA' | '529';
  assetClass: 'US Equity' | 'International' | 'Fixed Income' | 'Cash' | 'Alternatives' | 'REIT';
}

export interface SocialSecurityBenefit {
  claimAge: number;
  monthlyBenefit: number;
  annualBenefit: number;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profile: UserProfile;
  assets: Assets;
  assumptions: RetirementAssumptions;
  holdings: Holding[];
}

export interface CashFlowYear {
  age: number;
  year: number;
  salary: number;
  bonus: number;
  contribution401k: number;
  employerMatch: number;
  iraContribution: number;
  rothContribution: number;
  hsaContribution: number;
  taxes: number;
  healthcareCosts: number;
  mortgagePayment: number;
  collegeCosts: number;
  socialSecurity: number;
  withdrawals: number;
  rothConversion: number;
  investmentGrowth: number;
  endingBalance: number;
  traditionalBalance: number;
  rothBalance: number;
  taxableBalance: number;
  cashBalance: number;
  netWorth: number;
}

export interface MonteCarloResult {
  probabilityOfSuccess: number;
  medianEndingWealth: number;
  p5EndingWealth: number;
  p25EndingWealth: number;
  p75EndingWealth: number;
  p95EndingWealth: number;
  worstCase: number;
  bestCase: number;
  percentileData: { year: number; p5: number; p25: number; median: number; p75: number; p95: number }[];
  histogram: { bucket: number; count: number }[];
}

export interface TaxAnalysis {
  federalTax: number;
  stateTax: number;
  ficaTax: number;
  effectiveRate: number;
  marginalRate: number;
  taxableIncome: number;
  capitalGains: number;
  irmaaRisk: boolean;
  rmdAge73: number;
  optimalRothConversion: number;
  lifetimeTaxSavingsFromRoth: number;
}

export interface RetirementComparisonRow {
  retireAge: number;
  probabilityOfSuccess: number;
  medianEstate: number;
  medianTaxes: number;
  maxSafeSpending: number;
  legacyProbability: number;
}

export interface AppTheme {
  mode: 'dark' | 'light';
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
