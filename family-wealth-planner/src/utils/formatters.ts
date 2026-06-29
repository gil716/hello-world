export function formatCurrency(value: unknown, compact = false): string {
  const n = Number(value) || 0;
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getSuccessColor(prob: number): string {
  if (prob >= 0.90) return 'text-emerald-400';
  if (prob >= 0.80) return 'text-yellow-400';
  if (prob >= 0.70) return 'text-orange-400';
  return 'text-red-400';
}

export function getSuccessBg(prob: number): string {
  if (prob >= 0.90) return 'bg-emerald-500';
  if (prob >= 0.80) return 'bg-yellow-500';
  if (prob >= 0.70) return 'bg-orange-500';
  return 'bg-red-500';
}
