import type { Bar } from "../types";
import { sma, ema, rsi, atr } from "./bars";
type Value = number[];
export type FormulaPlot = {
  title: string;
  color: string;
  values: { time: number; value: number }[];
};
export const FORMULA_PRESETS = [
  {
    name: "EMA ribbon",
    pane: "price" as const,
    code: 'fast = ta.ema(close, 20)\nslow = ta.ema(close, 50)\nplot(fast, "EMA 20", "#f2c66d")\nplot(slow, "EMA 50", "#64b5f6")',
  },
  {
    name: "Donchian",
    pane: "price" as const,
    code: 'length = 20\nplot(ta.highest(high, length), "Upper", "#089981")\nplot(ta.lowest(low, length), "Lower", "#f23645")',
  },
  {
    name: "RSI",
    pane: "separate" as const,
    code: 'length = 14\nplot(ta.rsi(close, length), "RSI", "#ab7ae0")\nplot(70, "70", "#787b86")\nplot(30, "30", "#787b86")',
  },
];
// Bounded expression parser. No eval, JS, imports, I/O, loops, tools or negative
// history indexes. All series originate exclusively in the supplied cutoff bars.
export function calculateFormula(code: string, bars: Bar[]): FormulaPlot[] {
  if (code.length > 12000)
    throw Error("Up to 12,000 characters per indicator.");
  const n = bars.length,
    plots: FormulaPlot[] = [],
    env = new Map<string, Value>();
  for (const field of ["open", "high", "low", "close", "count"] as const)
    env.set(
      field,
      bars.map((b) => b[field]),
    );
  env.set(
    "hl2",
    bars.map((b) => (b.high + b.low) / 2),
  );
  env.set(
    "hlc3",
    bars.map((b) => (b.high + b.low + b.close) / 3),
  );
  let operations = 0;
  const constant = (v: number) => Array(n).fill(v) as Value;
  const zip = (a: Value, b: Value, fn: (a: number, b: number) => number) =>
    a.map((x, i) =>
      Number.isFinite(x) && Number.isFinite(b[i]) ? fn(x, b[i]) : NaN,
    );
  const invoke = (name: string, args: Value[]): Value => {
    if (++operations > 180) throw Error("The formula is too complex.");
    const period = () => {
      const p = args[1]?.[0];
      if (
        !Number.isInteger(p) ||
        p < 1 ||
        p > 1000 ||
        args[1].some((x) => x !== p)
      )
        throw Error("The period must be a constant from 1 to 1000.");
      return p;
    };
    const simple = name.replace(/^ta\./, "").replace(/^math\./, "");
    if (["sma", "ema", "rsi"].includes(simple)) {
      const p = period();
      const source = bars.map((b, i) => ({
        ...b,
        open: args[0][i],
        high: args[0][i],
        low: args[0][i],
        close: args[0][i],
      }));
      // Each undefined series value starts a new warmup segment.
      const valid = source.map((b, i) => ({
        ...b,
        gapBefore:
          b.gapBefore ||
          (!Number.isFinite(b.close) ||
          (i > 0 && !Number.isFinite(source[i - 1].close))
            ? { from: b.time * 1000, to: b.time * 1000 }
            : undefined),
      }));
      const values = new Map(
        (simple === "sma" ? sma : simple === "ema" ? ema : rsi)(valid, p).map(
          (v) => [v.time, v.value],
        ),
      );
      return bars.map((b) => values.get(b.time) ?? NaN);
    }
    if (simple === "atr") {
      const p = args[0]?.[0];
      if (!Number.isInteger(p) || p < 1 || p > 1000)
        throw Error("ATR period must be from 1 to 1000.");
      const out = new Map(atr(bars, p).map((v) => [v.time, v.value]));
      return bars.map((b) => out.get(b.time) ?? NaN);
    }
    if (simple === "highest" || simple === "lowest") {
      const p = period();
      const queue: number[] = [];
      let head = 0,
        start = 0;
      return bars.map((b, i) => {
        const value = args[0][i];
        if (b.gapBefore || !Number.isFinite(value)) {
          start = Number.isFinite(value) ? i : i + 1;
          queue.length = 0;
          head = 0;
        }
        if (!Number.isFinite(value)) return NaN;
        while (head < queue.length && queue[head] <= i - p) head++;
        while (
          queue.length > head &&
          (simple === "highest"
            ? args[0][queue.at(-1)!] <= value
            : args[0][queue.at(-1)!] >= value)
        )
          queue.pop();
        queue.push(i);
        return i - start + 1 < p ? NaN : args[0][queue[head]];
      });
    }
    if (simple === "abs") return args[0].map(Math.abs);
    if (simple === "sqrt") return args[0].map(Math.sqrt);
    if (simple === "max" || simple === "min")
      return zip(args[0], args[1], simple === "max" ? Math.max : Math.min);
    if (simple === "input" || name === "input.int" || name === "input.float")
      return args[0];
    throw Error("Unknown function: " + name);
  };
  function expression(text: string): Value {
    const tokens =
      text.match(
        /(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_][A-Za-z_\d.]*(?!\w)|>=|<=|==|!=|[+\-*/(),\[\]<>?:]/g,
      ) ?? [];
    if (tokens.join("") !== text.replace(/\s/g, ""))
      throw Error("Unsupported character or expression.");
    let at = 0,
      depth = 0;
    const expect = (t: string) => {
      if (tokens[at++] !== t) throw Error("Expected " + t);
    };
    function atom(): Value {
      if (++depth > 32) throw Error("Expression nesting is too deep.");
      const token = tokens[at++];
      let out: Value;
      if (token === "-") out = atom().map((x) => -x);
      else if (token === "+") out = atom();
      else if (token === "(") {
        out = parse(0);
        expect(")");
      } else if (token && /^\d|^\./.test(token)) out = constant(Number(token));
      else if (token && /^[A-Za-z_]/.test(token)) {
        if (tokens[at] === "(") {
          at++;
          const args: Value[] = [];
          if (tokens[at] !== ")") {
            do {
              args.push(parse(0));
              if (tokens[at] !== ",") break;
              at++;
            } while (true);
          }
          expect(")");
          out = invoke(token, args);
        } else {
          const known = env.get(token);
          if (!known) throw Error("Unknown name: " + token);
          out = known;
        }
      } else throw Error("Incomplete expression.");
      if (tokens[at] === "[") {
        at++;
        const back = Number(tokens[at++]);
        if (!Number.isInteger(back) || back < 0 || back > 1000)
          throw Error(
            "History index must be 0–1000; future values are unavailable.",
          );
        expect("]");
        let segment = 0;
        out = out.map((_, i) => {
          if (bars[i].gapBefore) segment = i;
          return i - back >= segment ? out[i - back] : NaN;
        });
      }
      depth--;
      return out;
    }
    const precedence: Record<string, number> = {
      "==": 1,
      "!=": 1,
      ">": 2,
      "<": 2,
      ">=": 2,
      "<=": 2,
      "+": 3,
      "-": 3,
      "*": 4,
      "/": 4,
    };
    function parse(min: number): Value {
      let left = atom();
      while ((precedence[tokens[at]] ?? -1) >= min) {
        const op = tokens[at++],
          right = parse(precedence[op] + 1);
        if (++operations > 180) throw Error("The formula is too complex.");
        left = zip(left, right, (a, b) =>
          op === "+"
            ? a + b
            : op === "-"
              ? a - b
              : op === "*"
                ? a * b
                : op === "/"
                  ? b === 0
                    ? NaN
                    : a / b
                  : op === ">"
                    ? +(a > b)
                    : op === "<"
                      ? +(a < b)
                      : op === ">="
                        ? +(a >= b)
                        : op === "<="
                          ? +(a <= b)
                          : op === "=="
                            ? +(a === b)
                            : +(a !== b),
        );
      }
      if (min === 0 && tokens[at] === "?") {
        at++;
        const yes = parse(0);
        expect(":");
        const no = parse(0);
        left = left.map((v, i) =>
          Number.isFinite(v) ? (v ? yes[i] : no[i]) : NaN,
        );
      }
      return left;
    }
    const value = parse(0);
    if (at !== tokens.length)
      throw Error("Unexpected formula content: " + tokens[at]);
    return value;
  }
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const plot = line.match(/^plot\((.*)\)$/);
    if (plot) {
      if (plots.length >= 4) throw Error("Up to four plots per indicator.");
      const match = plot[1].match(
        /^(.*?)(?:,\s*"([^"\n]{1,60})")?(?:,\s*"(#[a-fA-F0-9]{6})")?$/,
      );
      if (!match) throw Error('Use plot(expression, "Name", "#color").');
      const values = expression(match[1]);
      plots.push({
        title: match[2] ?? "Plot " + (plots.length + 1),
        color: match[3] ?? "#64b5f6",
        values: bars.flatMap((b, i) =>
          Number.isFinite(values[i])
            ? [{ time: b.time, value: values[i] }]
            : [],
        ),
      });
    } else {
      const variable = line.match(/^([A-Za-z_][A-Za-z_\d]*)\s*=\s*(.+)$/);
      if (!variable) throw Error("Use name = expression or plot(...).");
      if (
        ["open", "high", "low", "close", "count", "hl2", "hlc3"].includes(
          variable[1],
        )
      )
        throw Error("Price fields cannot be overwritten.");
      if (env.size > 40) throw Error("Up to 32 custom variables.");
      env.set(variable[1], expression(variable[2]));
    }
  }
  if (!plots.length) throw Error("An indicator needs at least one plot(...).");
  return plots;
}
