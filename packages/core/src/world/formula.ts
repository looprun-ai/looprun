/**
 * The `derived` formula mini-language — a CLOSED arithmetic grammar.
 *
 * The spec sketches a derived value as a STRING: `"lateDays * dailyRate * 0.5"`. 3b keeps that string
 * form (it is what `world.json` serializes) and compiles it — at LOAD time — with a tiny tokenizer +
 * precedence-climbing parser over EXACTLY four productions:
 *
 *     expr    → term (('+' | '-') term)*
 *     term    → factor (('*' | '/') factor)*
 *     factor  → NUMBER | IDENT | '(' expr ')' | '-' factor
 *
 * and NOTHING else — no property access, no function call, no comparison, no string. The tokenizer
 * rejects any character outside `[A-Za-z_] [0-9] . + - * / ( )` and whitespace, so the grammar is the
 * whole language (the quarantine law: no regex, no free function, ever). Every referenced identifier is
 * checked against the caller's `allowed` set at COMPILE time — an unknown identifier (a typo, a field
 * that does not exist) throws at LOAD, not silently returns NaN at run. Evaluation walks the compiled
 * AST against a numeric scope; a missing scope var or a division by zero throws (deterministic, loud).
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'neg'; operand: Node };

type Token =
  | { t: 'num'; value: number }
  | { t: 'ident'; name: string }
  | { t: 'op'; op: '+' | '-' | '*' | '/' }
  | { t: 'lparen' }
  | { t: 'rparen' };

const IS_IDENT_START = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const IS_IDENT_PART = (c: string): boolean => IS_IDENT_START(c) || (c >= '0' && c <= '9');
const IS_DIGIT = (c: string): boolean => (c >= '0' && c <= '9') || c === '.';

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ t: 'op', op: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (IS_DIGIT(c)) {
      let j = i;
      while (j < src.length && IS_DIGIT(src[j])) j++;
      const text = src.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new FormulaError(`invalid number '${text}'`);
      tokens.push({ t: 'num', value });
      i = j;
      continue;
    }
    if (IS_IDENT_START(c)) {
      let j = i;
      while (j < src.length && IS_IDENT_PART(src[j])) j++;
      tokens.push({ t: 'ident', name: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(`unexpected character '${c}' at position ${i} — the formula grammar is identifiers, numbers, ( ) and + - * / only`);
  }
  return tokens;
}

/** A recursive-descent / precedence-climbing parser over the token stream. */
function parse(tokens: Token[], src: string): Node {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function parseExpr(): Node {
    let node = parseTerm();
    for (let tok = peek(); tok && tok.t === 'op' && (tok.op === '+' || tok.op === '-'); tok = peek()) {
      pos++;
      node = { kind: 'bin', op: tok.op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm(): Node {
    let node = parseFactor();
    for (let tok = peek(); tok && tok.t === 'op' && (tok.op === '*' || tok.op === '/'); tok = peek()) {
      pos++;
      node = { kind: 'bin', op: tok.op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor(): Node {
    const tok = peek();
    if (!tok) throw new FormulaError(`unexpected end of formula '${src}'`);
    if (tok.t === 'op' && tok.op === '-') {
      pos++;
      return { kind: 'neg', operand: parseFactor() };
    }
    if (tok.t === 'op' && tok.op === '+') {
      pos++;
      return parseFactor();
    }
    if (tok.t === 'num') {
      pos++;
      return { kind: 'num', value: tok.value };
    }
    if (tok.t === 'ident') {
      pos++;
      return { kind: 'var', name: tok.name };
    }
    if (tok.t === 'lparen') {
      pos++;
      const inner = parseExpr();
      const close = peek();
      if (!close || close.t !== 'rparen') throw new FormulaError(`unbalanced '(' in formula '${src}'`);
      pos++;
      return inner;
    }
    throw new FormulaError(`unexpected token in formula '${src}'`);
  }

  const node = parseExpr();
  if (pos !== tokens.length) throw new FormulaError(`trailing tokens in formula '${src}'`);
  return node;
}

function identifiersOf(node: Node, into: Set<string>): void {
  switch (node.kind) {
    case 'var':
      into.add(node.name);
      return;
    case 'neg':
      identifiersOf(node.operand, into);
      return;
    case 'bin':
      identifiersOf(node.left, into);
      identifiersOf(node.right, into);
      return;
    case 'num':
      return;
  }
}

function evaluate(node: Node, scope: Record<string, number>): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var': {
      const v = scope[node.name];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new FormulaError(`formula scope is missing a finite value for '${node.name}'`);
      }
      return v;
    }
    case 'neg':
      return -evaluate(node.operand, scope);
    case 'bin': {
      const l = evaluate(node.left, scope);
      const r = evaluate(node.right, scope);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r === 0) throw new FormulaError('formula division by zero');
          return l / r;
      }
    }
  }
}

/** A formula compiled to a closed AST: its referenced identifiers and a numeric evaluator. */
export interface CompiledFormula {
  readonly source: string;
  readonly identifiers: readonly string[];
  evaluate(scope: Record<string, number>): number;
}

/**
 * Compile a derived formula string to a {@link CompiledFormula}. When `allowed` is given, EVERY
 * referenced identifier must be a member — an unknown one throws {@link FormulaError} HERE (load time),
 * never at run. Parse errors (bad characters, unbalanced parens, trailing tokens) throw here too.
 */
export function compileFormula(src: string, allowed?: readonly string[]): CompiledFormula {
  const ast = parse(tokenize(src), src);
  const idset = new Set<string>();
  identifiersOf(ast, idset);
  const identifiers = [...idset].sort();
  if (allowed) {
    const allowedSet = new Set(allowed);
    const unknown = identifiers.filter((id) => !allowedSet.has(id));
    if (unknown.length) {
      throw new FormulaError(
        `formula '${src}' references unknown identifier(s) ${unknown.map((u) => `'${u}'`).join(', ')} — ` +
          `allowed identifiers are ${allowed.length ? allowed.map((a) => `'${a}'`).join(', ') : '(none declared)'}`,
      );
    }
  }
  return { source: src, identifiers, evaluate: (scope) => evaluate(ast, scope) };
}
