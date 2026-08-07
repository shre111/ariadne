import type { UsageTotals } from '@/types';

// Claude Sonnet 4.6 pricing, $ per 1M tokens.
const PRICE = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export function computeCost(u: UsageTotals): { cost: number; savedPct: number } {
  const actual =
    (u.inputTokens * PRICE.input +
      u.outputTokens * PRICE.output +
      u.cacheReadTokens * PRICE.cacheRead +
      u.cacheCreationTokens * PRICE.cacheWrite) /
    1e6;
  // What it would have cost with no caching: every cached token billed as fresh input.
  const baseline =
    ((u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens) * PRICE.input +
      u.outputTokens * PRICE.output) /
    1e6;
  const savedPct = baseline > 0 ? Math.max(0, ((baseline - actual) / baseline) * 100) : 0;
  return { cost: actual, savedPct };
}
