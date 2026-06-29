import type { CashFlowYear, MonteCarloResult } from '../types';

function randomNormal(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function runMonteCarlo(
  baseCashFlows: CashFlowYear[],
  annualReturnPct: number,
  volatilityPct: number,
  simulations: number = 10000
): MonteCarloResult {
  const annualReturn = annualReturnPct / 100;
  const volatility = volatilityPct / 100;
  const retirementFlows = baseCashFlows.filter(f => f.withdrawals > 0 || f.salary === 0);

  if (retirementFlows.length === 0) {
    return emptyResult();
  }

  const endingWealth: number[] = [];
  const successCount = { count: 0 };

  // Track percentiles over time
  const yearCount = retirementFlows.length;
  const percentileTrackers: number[][] = Array.from({ length: yearCount }, () => []);

  for (let sim = 0; sim < simulations; sim++) {
    let portfolio = retirementFlows[0].endingBalance;
    let failed = false;

    for (let yi = 0; yi < retirementFlows.length; yi++) {
      const flow = retirementFlows[yi];
      const shock = randomNormal();
      const yearReturn = annualReturn + volatility * shock;

      portfolio = portfolio * (1 + yearReturn);
      portfolio -= flow.withdrawals;
      portfolio += flow.socialSecurity;

      if (portfolio < 0) {
        failed = true;
        portfolio = 0;
      }

      if (sim < 500) { // Track subset for chart performance
        percentileTrackers[yi].push(portfolio);
      }
    }

    endingWealth.push(portfolio);
    if (!failed) successCount.count++;
  }

  endingWealth.sort((a, b) => a - b);
  const probabilityOfSuccess = successCount.count / simulations;

  const p = (pct: number) => endingWealth[Math.floor(endingWealth.length * pct / 100)];

  // Build percentile chart data
  const percentileData = retirementFlows.map((flow, yi) => {
    const sorted = [...percentileTrackers[yi]].sort((a, b) => a - b);
    const n = sorted.length;
    return {
      year: flow.age,
      p5: sorted[Math.floor(n * 0.05)] ?? 0,
      p25: sorted[Math.floor(n * 0.25)] ?? 0,
      median: sorted[Math.floor(n * 0.50)] ?? 0,
      p75: sorted[Math.floor(n * 0.75)] ?? 0,
      p95: sorted[Math.floor(n * 0.95)] ?? 0,
    };
  });

  // Build histogram
  const max = p(99);
  const bucketSize = Math.max(100000, Math.ceil(max / 20 / 100000) * 100000);
  const buckets: Record<number, number> = {};
  for (const w of endingWealth) {
    const bucket = Math.floor(w / bucketSize) * bucketSize;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }
  const histogram = Object.entries(buckets)
    .map(([k, v]) => ({ bucket: Number(k), count: v }))
    .sort((a, b) => a.bucket - b.bucket);

  return {
    probabilityOfSuccess,
    medianEndingWealth: p(50),
    p5EndingWealth: p(5),
    p25EndingWealth: p(25),
    p75EndingWealth: p(75),
    p95EndingWealth: p(95),
    worstCase: p(1),
    bestCase: p(99),
    percentileData,
    histogram,
  };
}

export function runMonteCarloForProbability(
  cashFlows: CashFlowYear[],
  returnRate: number,
  volatility: number
): number {
  const result = runMonteCarlo(cashFlows, returnRate, volatility, 2000);
  return result.probabilityOfSuccess;
}

function emptyResult(): MonteCarloResult {
  return {
    probabilityOfSuccess: 0,
    medianEndingWealth: 0,
    p5EndingWealth: 0,
    p25EndingWealth: 0,
    p75EndingWealth: 0,
    p95EndingWealth: 0,
    worstCase: 0,
    bestCase: 0,
    percentileData: [],
    histogram: [],
  };
}
