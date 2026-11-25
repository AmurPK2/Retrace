import test from "node:test";
import assert from "node:assert/strict";
import {
  coordinateAtLogical,
  logicalAtTime,
  timeAtLogical,
} from "../src/core/chart-view";
test("a 15-minute drawing anchor stays halfway between 30-minute candles, not at the left edge", () => {
  const times = [0, 1800, 3600];
  const calls: number[] = [];
  const project = (index: number) => {
    calls.push(index);
    return Number.isInteger(index) ? 120 + index * 20 : 0;
  };
  const logical = logicalAtTime(times, 900, 1800);
  assert.equal(logical, 0.5);
  assert.equal(coordinateAtLogical(logical, project), 130);
  assert.deepEqual(calls, [0, 1]);
  assert.equal(timeAtLogical(times, logical, 1800), 900);
});
test("arbitrary moved, future and pre-history anchors use the same projection as on-bar anchors", () => {
  const project = (index: number) =>
    Number.isInteger(index) ? 200 + index * 12 : 0;
  for (const [logical, x] of [
    [-1.25, 185],
    [0, 200],
    [1.5, 218],
    [4.25, 251],
  ]) {
    assert.equal(coordinateAtLogical(logical, project), x);
  }
  assert.equal(coordinateAtLogical(NaN, project), null);
  assert.equal(
    coordinateAtLogical(0.5, () => null),
    null,
  );
});
test("compressed market breaks preserve the original drawing time on both sides of a switch", () => {
  const times = [0, 1800, 1800 + 2 * 86400],
    t = 1800 + 86400;
  const logical = logicalAtTime(times, t, 1800);
  assert.equal(
    coordinateAtLogical(logical, (i) =>
      Number.isInteger(i) ? 100 + i * 14 : 0,
    ),
    121,
  );
  assert.equal(timeAtLogical(times, logical, 1800), t);
});
