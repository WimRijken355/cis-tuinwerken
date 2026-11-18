/**
 * Number as typed in a Belgian form field: decimal comma or point, spaces
 * ignored ("1,5" → 1.5, " 12.40 " → 12.4). Empty or invalid → NaN, so callers
 * can show "–" / block saving instead of silently using 0.
 */
export function parseDecimal(value: string): number {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
