import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula } from "../../src/sandbox/expression.js";

test("公式沙箱支持四则运算与变量", () => {
  assert.equal(evaluateFormula("1 + 2 * 3").value, 7);
  assert.equal(evaluateFormula("(800 + 200) / 2", { total: 1000 }).value, 500);
  assert.deepEqual(evaluateFormula("a * b", { a: 3, b: 4 }).used_variables, ["a", "b"]);
});

test("公式沙箱拒绝未知标识符与代码", () => {
  assert.throws(() => evaluateFormula("process.exit(0)", {}), /非法字符|未知变量/);
  assert.throws(() => evaluateFormula("constructor", {}), /未知变量/);
  assert.throws(() => evaluateFormula("require('fs')", {}), /非法字符/);
});

test("公式沙箱拒绝除零、过长、过深", () => {
  assert.throws(() => evaluateFormula("1 / 0"), /除数为零/);
  assert.throws(() => evaluateFormula("1+".repeat(300) + "1"), /过长|过于复杂/);
  assert.throws(() => evaluateFormula("(".repeat(30) + "1" + ")".repeat(30)), /嵌套过深|公式过长/);
});
