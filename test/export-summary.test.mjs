import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, summaryCell } from "../build/lib/export-summary.js";

const calculate = (values) => summarize(values.map((金額) => ({ 金額 })), ["金額"])[0];

test("摘要：精確加總小數，空值不計入平均", () => {
  assert.deepEqual(calculate(["0.1", 0.2, null, undefined]), {
    field: "金額", count: 2, missing: 2, sum: "0.3", average: "0.15",
  });
  assert.equal(calculate(["10.50", "0.01"]).sum, "10.51");
  assert.equal(calculate(["1.25e3", "-2.5e2"]).average, "500");
});

test("摘要：平均四捨五入至六位，正負數規則相同", () => {
  assert.equal(calculate([1, 0, 0]).average, "0.333333");
  assert.equal(calculate([2, 0, 0]).average, "0.666667");
  assert.equal(calculate(["0.0000005"]).average, "0.000001");
  assert.equal(calculate(["-0.0000005"]).average, "-0.000001");
  assert.equal(calculate(["-0.0000001"]).average, "0");
});

test("摘要：超過 JS／Excel 整數精度仍維持精確文字", () => {
  const result = calculate(["9007199254740991", "9007199254740993"]);
  assert.equal(result.sum, "18014398509481984");
  assert.equal(result.average, "9007199254740992");
  assert.equal(summaryCell(result.sum), result.sum);
  assert.equal(summaryCell("123.45"), 123.45);
  const tiny = "0." + "0".repeat(399) + "1";
  assert.equal(calculate([tiny]).sum, tiny);
  assert.equal(summaryCell(tiny), tiny);
});

test("摘要：零筆／全空值保留零筆與沒有平均，不虛構零平均", () => {
  assert.deepEqual(calculate([]), { field: "金額", count: 0, missing: 0, sum: "0", average: null });
  assert.deepEqual(calculate([null, undefined]), { field: "金額", count: 0, missing: 2, sum: "0", average: null });
});

test("摘要：無效、已失去精度或超出精度上限的值停止處理", () => {
  for (const value of [NaN, Infinity, "NaN", "", "abc", "1e1000", 9007199254740992, "1e-1001"]) {
    assert.throws(() => calculate([value]));
  }
});
