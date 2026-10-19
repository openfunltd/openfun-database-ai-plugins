import { OpenFunError } from "./errors.js";
import type { Cell } from "./xlsx.js";

export interface NumericSummary {
  field: string;
  count: number;
  missing: number;
  sum: string;
  average: string | null;
}

// Exact decimal addition. Round only the final average, to six decimal places.
function decimal(value: unknown): { coefficient: bigint; scale: number } {
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))
      || (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value))) {
    throw new OpenFunError("validation", "統計欄位含無法可靠表示的數值。");
  }
  const match = String(value).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match || !(match[2] || match[3])) throw new OpenFunError("validation", "統計欄位含無法計算的數值。");
  const digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "") || "0";
  const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0);
  if (digits.length > 1000 || !Number.isSafeInteger(scale) || Math.abs(scale) > 1000) {
    throw new OpenFunError("validation", "統計欄位超過可計算的小數精度上限，請減少統計欄位。");
  }
  let coefficient = BigInt(digits) * (match[1] === "-" ? -1n : 1n);
  if (scale < 0) coefficient *= 10n ** BigInt(-scale);
  return { coefficient, scale: Math.max(0, scale) };
}

function format(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") : digits;
  return (negative ? "-" : "") + text;
}

export function summarize(records: Record<string, unknown>[], fields: string[]): NumericSummary[] {
  return fields.map((field) => {
    let sum = 0n, scale = 0, count = 0;
    for (const record of records) {
      const value = record[field];
      if (value === null || value === undefined) continue;
      const item = decimal(value);
      if (item.scale > scale) { sum *= 10n ** BigInt(item.scale - scale); scale = item.scale; }
      sum += item.coefficient * 10n ** BigInt(scale - item.scale);
      count++;
    }
    let average: string | null = null;
    if (count) {
      const numerator = sum * 1_000_000n;
      const denominator = BigInt(count) * 10n ** BigInt(scale);
      const absolute = numerator < 0n ? -numerator : numerator;
      const rounded = (absolute + denominator / 2n) / denominator;
      average = format(numerator < 0n ? -rounded : rounded, 6);
    }
    return { field, count, missing: records.length - count, sum: format(sum, scale), average };
  });
}

/** Use numbers when Excel can keep them; preserve longer totals as exact text. */
export function summaryCell(value: string | null): Cell {
  if (value === null) return null;
  const n = Number(value);
  const digits = value.replace(/[-.]/g, "").replace(/^0+/, "").length;
  return Number.isFinite(n) && !(n === 0 && /[1-9]/.test(value)) && digits <= 15 && (!Number.isInteger(n) || Number.isSafeInteger(n)) ? n : value;
}
