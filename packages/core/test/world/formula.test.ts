/**
 * The `derived` formula mini-language (increment 3b). Property tests over the CLOSED grammar: a
 * randomly generated expression compiles and evaluates to the SAME number a trusted reference computes;
 * unknown identifiers throw at LOAD; division is supported (and division-by-zero throws at run).
 */
import { describe, expect, it } from 'vitest';
import { compileFormula, FormulaError } from '../../src/world/formula.js';

describe('compileFormula — the sketched formula', () => {
  it("evaluates the spec's lateFee = lateDays * dailyRate * 0.5", () => {
    const f = compileFormula('lateDays * dailyRate * 0.5', ['lateDays', 'dailyRate']);
    expect(f.evaluate({ lateDays: 3, dailyRate: 100 })).toBe(150);
    expect(f.identifiers).toEqual(['dailyRate', 'lateDays']);
  });

  it('honours precedence and parentheses', () => {
    expect(compileFormula('2 + 3 * 4').evaluate({})).toBe(14);
    expect(compileFormula('(2 + 3) * 4').evaluate({})).toBe(20);
    expect(compileFormula('-a + 5').evaluate({ a: 2 })).toBe(3);
  });
});

describe('compileFormula — load-time closure (unknown identifier THROWS at compile)', () => {
  it('throws when a referenced identifier is not in the allowed set', () => {
    expect(() => compileFormula('lateDays * dailyRate', ['dailyRate'])).toThrow(FormulaError);
    expect(() => compileFormula('lateDays * dailyRate', ['dailyRate'])).toThrow(/unknown identifier.*'lateDays'/);
  });

  it('accepts identifiers present in the allowed set', () => {
    expect(() => compileFormula('a + b', ['a', 'b'])).not.toThrow();
  });

  it('rejects any character outside the closed grammar (no calls, no property access, no comparison)', () => {
    for (const bad of ['a.b', 'f(a)', 'a > b', 'a % b', 'a && b', '"x"']) {
      expect(() => compileFormula(bad)).toThrow(FormulaError);
    }
  });

  it('rejects unbalanced parens and trailing tokens', () => {
    expect(() => compileFormula('(a + b')).toThrow(FormulaError);
    expect(() => compileFormula('a b')).toThrow(FormulaError);
  });
});

describe('compileFormula — division', () => {
  it('supports division', () => {
    expect(compileFormula('a / b').evaluate({ a: 10, b: 4 })).toBe(2.5);
  });

  it('throws on division by zero (deterministic, loud — never Infinity)', () => {
    expect(() => compileFormula('a / b').evaluate({ a: 1, b: 0 })).toThrow(/division by zero/);
  });

  it('throws when the scope is missing a finite value for a referenced identifier', () => {
    expect(() => compileFormula('a + 1').evaluate({})).toThrow(/missing a finite value for 'a'/);
  });
});

// ── Property test: compiled evaluation ≡ a trusted reference over random expressions ──────────────

/** A tiny deterministic PRNG (mulberry32) so the property run is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VARS = ['a', 'b', 'c'];

/** Generate a random expression string from the closed grammar, plus a JS-evaluable twin. Denominators
 *  are forced to a nonzero literal so the reference `Function` never divides by zero. */
function genExpr(rand: () => number, depth: number): string {
  if (depth <= 0 || rand() < 0.4) {
    return rand() < 0.5 ? VARS[Math.floor(rand() * VARS.length)] : String(1 + Math.floor(rand() * 9));
  }
  const ops = ['+', '-', '*', '/'];
  const op = ops[Math.floor(rand() * ops.length)];
  const left = genExpr(rand, depth - 1);
  // division: force a nonzero numeric literal on the right so both sides agree deterministically.
  const right = op === '/' ? String(1 + Math.floor(rand() * 9)) : genExpr(rand, depth - 1);
  return `(${left} ${op} ${right})`;
}

describe('compileFormula — property: matches a trusted reference on random expressions', () => {
  it('1000 random closed-grammar expressions evaluate identically', () => {
    const rand = rng(0xc0ffee);
    for (let i = 0; i < 1000; i++) {
      const src = genExpr(rand, 4);
      const scope = { a: 1 + Math.floor(rand() * 9), b: 1 + Math.floor(rand() * 9), c: 1 + Math.floor(rand() * 9) };
      // eslint-disable-next-line no-new-func -- trusted REFERENCE oracle in a test, over generated closed-grammar text only.
      const reference = new Function('a', 'b', 'c', `return ${src};`)(scope.a, scope.b, scope.c) as number;
      const actual = compileFormula(src, VARS).evaluate(scope);
      expect(actual).toBeCloseTo(reference, 10);
    }
  });
});
