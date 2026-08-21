/** The tool surface a world card declares, read from the FILE rather than from a loaded module.
 *  A subject's world is TypeScript that imports TypeScript, so a plain `node` process cannot
 *  import it; the emitter still has to know the acts, their effects and their targets before it
 *  writes a card. This reads the three effect blocks of the `world({ ... })` card as literals and
 *  hands them to the engine's own derivation, so the target, the schema and the effect of every
 *  act are decided in one place — `factsFromWorld` — and never spelled a second time here.
 *
 *  A world that builds an effect block in code offers no literal to read, and the acts of that
 *  block are absent from the facts this returns. The caller names the empty surface. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Json, SurfaceFacts, WorldCard } from '@looprun-ai/core';
import { factsFromWorld } from '@looprun-ai/core';

const EFFECT_BLOCKS = new Set(['reads', 'writes', 'destructive']);

/** An expression stripped of the wrappers that carry no value: `x as const`, `x satisfies T`
 *  and `(x)` all hold the same literal. */
function unwrap(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isParenthesizedExpression(at)) {
    at = at.expression;
  }
  return at;
}

/** The value an expression states outright, or undefined when it states none. A call, an
 *  identifier and a spread all state nothing a reader of the source can resolve. */
function literal(node: ts.Expression): Json | undefined {
  const at = unwrap(node);
  if (ts.isStringLiteral(at) || ts.isNoSubstitutionTemplateLiteral(at)) return at.text;
  if (ts.isNumericLiteral(at)) return Number(at.text);
  if (at.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (at.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (at.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(at) && at.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(at.operand)) return -Number(at.operand.text);
  if (ts.isArrayLiteralExpression(at)) {
    const out: Json[] = [];
    for (const element of at.elements) {
      const value = literal(element);
      if (value === undefined) return undefined;
      out.push(value);
    }
    return out;
  }
  if (!ts.isObjectLiteralExpression(at)) return undefined;
  const out: Record<string, Json> = {};
  for (const property of at.properties) {
    if (!ts.isPropertyAssignment(property)) return undefined;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) return undefined;
    const value = literal(property.initializer);
    if (value === undefined) return undefined;
    out[property.name.text] = value;
  }
  return out;
}

/** One effect block's entries, keyed by act name. An entry whose shape the source does not
 *  state outright is left out: the act it names is not on the surface this reader answers with. */
function blockEntries(node: ts.ObjectLiteralExpression): Readonly<Record<string, Json>> {
  const out: Record<string, Json> = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
    const entry = literal(property.initializer);
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    out[property.name.text] = entry;
  }
  return out;
}

/** The name a world card is declared under, for a sentence an author can act on: the variable it
 *  is assigned to, or the position of the call when it is assigned to nothing. */
function cardName(call: ts.CallExpression, at: number): string {
  const parent = call.parent;
  if (parent !== undefined && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return `the world card at position ${String(at + 1)}`;
}

/** Every `world( ... )` call the file states, in the order they are written. */
function worldCalls(source: ts.SourceFile): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'world') calls.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  return calls;
}

/** The surface facts a world FILE declares. The effect a tool carries is the block it sits in, and
 *  the blocks read are the ones written DIRECTLY on the card handed to `world()` — a `reads` key
 *  nested deeper belongs to something else, and `limits: { destructive: 1 }` names a number rather
 *  than a block.
 *
 *  One file states one surface. A file stating two world cards is refused by name: the two are
 *  different worlds, and a surface merged out of both is neither of them. */
export function factsFromSource(worldPath: string): SurfaceFacts {
  const source = ts.createSourceFile(worldPath, readFileSync(worldPath, 'utf8'),
    ts.ScriptTarget.ES2022, true);
  const calls = worldCalls(source);
  if (calls.length > 1) {
    const names = calls.map((call, at) => cardName(call, at));
    throw new Error(`${worldPath} states ${String(calls.length)} world cards — `
      + `${names.join(', ')} — and a subject runs on one: leave the card this subject's acts `
      + 'belong to and move the others into their own file');
  }

  const card: Record<string, Readonly<Record<string, Json>>> = {};
  const [spec] = calls;
  const literal = spec === undefined ? undefined : unwrap(spec.arguments[0] ?? spec);
  if (literal !== undefined && ts.isObjectLiteralExpression(literal)) {
    for (const property of literal.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
      if (!EFFECT_BLOCKS.has(property.name.text)) continue;
      const block = unwrap(property.initializer);
      if (ts.isObjectLiteralExpression(block)) card[property.name.text] = blockEntries(block);
    }
  }
  return factsFromWorld({ card: { records: {}, ...card } as unknown as WorldCard, executors: {} });
}
