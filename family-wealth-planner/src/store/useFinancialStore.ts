import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  UserProfile, Assets, RetirementAssumptions, Holding,
  Scenario, CashFlowYear, MonteCarloResult, TaxAnalysis, AIMessage, AppTheme
} from '../types';
import { projectCashFlows, calculateTaxAnalysis } from '../engine/financialCalculations';
import { runMonteCarlo } from '../engine/monteCarlo';

const DEFAULT_HOLDINGS: Holding[] = [
  { id: '1', ticker: 'AMD', name: 'Advanced Micro Devices', shares: 50, costBasis: 8500, marketValue: 9200, dividendYield: 0, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '2', ticker: 'GOOG', name: 'Alphabet Inc.', shares: 30, costBasis: 42000, marketValue: 56000, dividendYield: 0, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '3', ticker: 'AAPL', name: 'Apple Inc.', shares: 80, costBasis: 9600, marketValue: 17200, dividendYield: 0.5, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '4', ticker: 'MSFT', name: 'Microsoft Corp.', shares: 40, costBasis: 12400, marketValue: 19800, dividendYield: 0.7, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '5', ticker: 'NVDA', name: 'NVIDIA Corp.', shares: 100, costBasis: 6000, marketValue: 148000, dividendYield: 0.03, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '6', ticker: 'PANW', name: 'Palo Alto Networks', shares: 20, costBasis: 4800, marketValue: 7200, dividendYield: 0, expenseRatio: 0, taxLocation: 'Roth', assetClass: 'US Equity' },
  { id: '7', ticker: 'CSCO', name: 'Cisco Systems', shares: 200, costBasis: 8200, marketValue: 9400, dividendYield: 3.2, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '8', ticker: 'BMY', name: 'Bristol-Myers Squibb', shares: 150, costBasis: 9000, marketValue: 6900, dividendYield: 5.1, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '9', ticker: 'PFE', name: 'Pfizer Inc.', shares: 300, costBasis: 13800, marketValue: 8100, dividendYield: 6.2, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '10', ticker: 'GILD', name: 'Gilead Sciences', shares: 100, costBasis: 6800, marketValue: 9400, dividendYield: 3.8, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '11', ticker: 'VZ', name: 'Verizon Communications', shares: 200, costBasis: 8400, marketValue: 7800, dividendYield: 6.7, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '12', ticker: 'T', name: 'AT&T Inc.', shares: 400, costBasis: 7600, marketValue: 7200, dividendYield: 5.5, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '13', ticker: 'NLY', name: 'Annaly Capital Mgmt', shares: 500, costBasis: 9500, marketValue: 10500, dividendYield: 14.2, expenseRatio: 0, taxLocation: 'Traditional', assetClass: 'REIT' },
  { id: '14', ticker: 'DIS', name: 'Walt Disney Co.', shares: 60, costBasis: 11400, marketValue: 7800, dividendYield: 0, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '15', ticker: 'SMH', name: 'VanEck Semiconductor', shares: 50, costBasis: 9500, marketValue: 12500, dividendYield: 0.4, expenseRatio: 0.35, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '16', ticker: 'POET', name: 'POET Technologies', shares: 1000, costBasis: 3200, marketValue: 4100, dividendYield: 0, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '17', ticker: 'SCHD', name: 'Schwab US Dividend ETF', shares: 200, costBasis: 12000, marketValue: 15200, dividendYield: 3.5, expenseRatio: 0.06, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '18', ticker: 'VTSAX', name: 'Vanguard Total Stock', shares: 150, costBasis: 16800, marketValue: 26400, dividendYield: 1.3, expenseRatio: 0.04, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '19', ticker: 'VIGAX', name: 'Vanguard Growth Index', shares: 80, costBasis: 22400, marketValue: 35200, dividendYield: 0.5, expenseRatio: 0.05, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '20', ticker: 'FXAIX', name: 'Fidelity 500 Index', shares: 300, costBasis: 38400, marketValue: 65400, dividendYield: 1.3, expenseRatio: 0.015, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '21', ticker: 'FZROX', name: 'Fidelity Zero Total Market', shares: 500, costBasis: 14000, marketValue: 24500, dividendYield: 1.0, expenseRatio: 0, taxLocation: 'Roth', assetClass: 'US Equity' },
  { id: '22', ticker: 'SWPPX', name: 'Schwab S&P 500 Index', shares: 200, costBasis: 20000, marketValue: 39000, dividendYield: 1.3, expenseRatio: 0.02, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '23', ticker: 'SWTSX', name: 'Schwab Total Stock Market', shares: 150, costBasis: 12000, marketValue: 19500, dividendYield: 1.2, expenseRatio: 0.03, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '24', ticker: 'SWLGX', name: 'Schwab US Large-Cap Growth', shares: 100, costBasis: 8000, marketValue: 15000, dividendYield: 0.4, expenseRatio: 0.035, taxLocation: 'Roth', assetClass: 'US Equity' },
  { id: '25', ticker: 'PRWCX', name: 'T. Rowe Price Capital App', shares: 80, costBasis: 18000, marketValue: 27200, dividendYield: 1.8, expenseRatio: 0.67, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '26', ticker: 'BRSTX', name: 'BlackRock Active Stock', shares: 100, costBasis: 12000, marketValue: 16800, dividendYield: 1.2, expenseRatio: 0.75, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '27', ticker: 'MADVX', name: 'BlackRock Equity Dividend', shares: 200, costBasis: 8000, marketValue: 11600, dividendYield: 2.8, expenseRatio: 0.82, taxLocation: 'Traditional', assetClass: 'US Equity' },
  { id: '28', ticker: 'IWB', name: 'iShares Russell 1000', shares: 100, costBasis: 22000, marketValue: 29500, dividendYield: 1.1, expenseRatio: 0.15, taxLocation: 'Taxable', assetClass: 'US Equity' },
  { id: '29', ticker: 'BLK', name: 'BlackRock Inc. (ESPP)', shares: 12.6, costBasis: 8820, marketValue: 11340, dividendYield: 2.8, expenseRatio: 0, taxLocation: 'Taxable', assetClass: 'US Equity' },
];

const DEFAULT_PROFILE: UserProfile = {
  age: 54,
  spouseAge: 54,
  children: 2,
  salary: 245000,
  annualBonus: 25000,
  employerMatch401k: 9000,
  employee401kContribution: 25000,
  retirementSpendingBeforeSS: 120000,
  retirementSpendingAfterSS: 120000,
  healthcareType: 'ACA',
  riskProfile: 'flexible',
};

const DEFAULT_ASSETS: Assets = {
  cash: 190000,
  homeValue: 550000,
  mortgage: 38000,
  mortgageRate: 3.5,
  mortgagePayoffYear: 2030,
  traditionalIRA: 1711000,
  k401: 880000,
  rothIRA: 135000,
  hsa: 74000,
  taxableBrokerage: 46000,
  college529: 303000,
  companyEquity: 30000,
  espp: 11340,
};

const DEFAULT_ASSUMPTIONS: RetirementAssumptions = {
  retirementAge: 58,
  inflationRate: 3,
  expectedReturn: 7,
  expectedVolatility: 15,
  lifeExpectancy: 90,
  spouseLifeExpectancy: 92,
  legacyGoalPerDaughter: 2000000,
  collegeCostsOutOfPocket: 35000,
  ssClaimAge: 70,
};

interface FinancialState {
  profile: UserProfile;
  assets: Assets;
  assumptions: RetirementAssumptions;
  holdings: Holding[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  cashFlows: CashFlowYear[];
  monteCarloResult: MonteCarloResult | null;
  taxAnalysis: TaxAnalysis | null;
  theme: AppTheme;
  aiMessages: AIMessage[];
  rothConversionAmount: number;
  isCalculating: boolean;

  // Actions
  updateProfile: (updates: Partial<UserProfile>) => void;
  updateAssets: (updates: Partial<Assets>) => void;
  updateAssumptions: (updates: Partial<RetirementAssumptions>) => void;
  updateHolding: (id: string, updates: Partial<Holding>) => void;
  addHolding: (holding: Holding) => void;
  removeHolding: (id: string) => void;
  setRothConversionAmount: (amount: number) => void;
  recalculate: () => void;
  saveScenario: (name: string) => void;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  toggleTheme: () => void;
  addAIMessage: (message: AIMessage) => void;
  clearAIMessages: () => void;
  exportData: () => string;
  importData: (json: string) => void;
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      assets: DEFAULT_ASSETS,
      assumptions: DEFAULT_ASSUMPTIONS,
      holdings: DEFAULT_HOLDINGS,
      scenarios: [],
      activeScenarioId: null,
      cashFlows: [],
      monteCarloResult: null,
      taxAnalysis: null,
      theme: { mode: 'dark' },
      aiMessages: [],
      rothConversionAmount: 175000,
      isCalculating: false,

      updateProfile: (updates) => {
        set(s => ({ profile: { ...s.profile, ...updates } }));
        get().recalculate();
      },

      updateAssets: (updates) => {
        set(s => ({ assets: { ...s.assets, ...updates } }));
        get().recalculate();
      },

      updateAssumptions: (updates) => {
        set(s => ({ assumptions: { ...s.assumptions, ...updates } }));
        get().recalculate();
      },

      updateHolding: (id, updates) => {
        set(s => ({
          holdings: s.holdings.map(h => h.id === id ? { ...h, ...updates } : h)
        }));
      },

      addHolding: (holding) => {
        set(s => ({ holdings: [...s.holdings, holding] }));
      },

      removeHolding: (id) => {
        set(s => ({ holdings: s.holdings.filter(h => h.id !== id) }));
      },

      setRothConversionAmount: (amount) => {
        set({ rothConversionAmount: amount });
        get().recalculate();
      },

      recalculate: () => {
        set({ isCalculating: true });
        const { profile, assets, assumptions, rothConversionAmount } = get();

        // Run in next tick to allow UI to show loading
        setTimeout(() => {
          try {
            const cashFlows = projectCashFlows(profile, assets, assumptions, rothConversionAmount);
            const monteCarloResult = runMonteCarlo(cashFlows, assumptions.expectedReturn, assumptions.expectedVolatility, 5000);
            const taxAnalysis = calculateTaxAnalysis(profile, assets, assumptions);
            set({ cashFlows, monteCarloResult, taxAnalysis, isCalculating: false });
          } catch {
            set({ isCalculating: false });
          }
        }, 0);
      },

      saveScenario: (name) => {
        const { profile, assets, assumptions, holdings } = get();
        const scenario: Scenario = {
          id: Date.now().toString(),
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          profile,
          assets,
          assumptions,
          holdings,
        };
        set(s => ({ scenarios: [...s.scenarios, scenario], activeScenarioId: scenario.id }));
      },

      loadScenario: (id) => {
        const scenario = get().scenarios.find(s => s.id === id);
        if (!scenario) return;
        set({
          profile: scenario.profile,
          assets: scenario.assets,
          assumptions: scenario.assumptions,
          holdings: scenario.holdings,
          activeScenarioId: id,
        });
        get().recalculate();
      },

      deleteScenario: (id) => {
        set(s => ({
          scenarios: s.scenarios.filter(sc => sc.id !== id),
          activeScenarioId: s.activeScenarioId === id ? null : s.activeScenarioId,
        }));
      },

      duplicateScenario: (id) => {
        const original = get().scenarios.find(s => s.id === id);
        if (!original) return;
        const copy: Scenario = {
          ...original,
          id: Date.now().toString(),
          name: `${original.name} (Copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set(s => ({ scenarios: [...s.scenarios, copy] }));
      },

      renameScenario: (id, name) => {
        set(s => ({
          scenarios: s.scenarios.map(sc =>
            sc.id === id ? { ...sc, name, updatedAt: new Date().toISOString() } : sc
          )
        }));
      },

      toggleTheme: () => {
        set(s => ({ theme: { mode: s.theme.mode === 'dark' ? 'light' : 'dark' } }));
      },

      addAIMessage: (message) => {
        set(s => ({ aiMessages: [...s.aiMessages, message] }));
      },

      clearAIMessages: () => set({ aiMessages: [] }),

      exportData: () => {
        const { profile, assets, assumptions, holdings, scenarios } = get();
        return JSON.stringify({ profile, assets, assumptions, holdings, scenarios, exportedAt: new Date().toISOString() }, null, 2);
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json);
          set({
            profile: data.profile ?? get().profile,
            assets: data.assets ?? get().assets,
            assumptions: data.assumptions ?? get().assumptions,
            holdings: data.holdings ?? get().holdings,
            scenarios: data.scenarios ?? get().scenarios,
          });
          get().recalculate();
        } catch {
          // Invalid JSON
        }
      },
    }),
    {
      name: 'family-wealth-planner',
      partialize: (state) => ({
        profile: state.profile,
        assets: state.assets,
        assumptions: state.assumptions,
        holdings: state.holdings,
        scenarios: state.scenarios,
        theme: state.theme,
        aiMessages: state.aiMessages,
        rothConversionAmount: state.rothConversionAmount,
      }),
    }
  )
);
