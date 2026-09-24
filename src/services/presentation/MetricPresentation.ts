/**
 * Display a percentage only when its denominator is meaningful. This keeps
 * presentation from turning 0 / 0 into a misleading 0% while leaving the
 * underlying analytics values untouched.
 */
export function formatRateWithDenominator(
  rate: number | null | undefined,
  numerator: number,
  denominator: number,
): string {
  if (!Number.isFinite(denominator) || denominator <= 0) return '当前样本不足';
  return `${rate ?? 0}% (${numerator}/${denominator})`;
}
