import { test, expect } from 'vitest';
import ts from 'typescript';
import { srcFiles } from './walk.js';

/** Charter R6.6: a guard never uses a regex. The lawful regex homes are the pattern
 *  factories in cards/catalog.ts — blockPattern, purgePattern, maskPattern, and
 *  argFormat (the schema's declared pattern is DATA; argFormat is its one
 *  evaluator) — and the delivery writer's sentence anatomy in run/delivery-writer.ts
 *  — idsOf and unframed, deterministic parsing of the engine's OWN sentences, never
 *  a guard's verdict. A regex anywhere else in src/ is a build failure. */
const HOMES: readonly { readonly file: string; readonly names: ReadonlySet<string> }[] = [
  { file: 'cards/catalog.ts', names: new Set(['blockPattern', 'purgePattern', 'maskPattern', 'argFormat']) },
  { file: 'run/delivery-writer.ts', names: new Set(['idsOf', 'unframed']) }
];

function insideRegexHome(node: ts.Node, rel: string): boolean {
  const home = HOMES.find(h => rel.endsWith(h.file));
  if (home === undefined) return false;
  for (let p: ts.Node | undefined = node; p !== undefined; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name !== undefined && home.names.has(p.name.text)) return true;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && home.names.has(p.name.text)) return true;
  }
  return false;
}

test('a regex exists only inside its declared homes', () => {
  const hits: string[] = [];
  for (const f of srcFiles()) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral && !insideRegexHome(node, f.rel)) {
        hits.push(`${f.rel} — regex literal`);
      }
      if ((ts.isNewExpression(node) || ts.isCallExpression(node))
        && ts.isIdentifier(node.expression) && node.expression.text === 'RegExp'
        && !insideRegexHome(node, f.rel)) {
        hits.push(`${f.rel} — RegExp construction`);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  expect(hits).toEqual([]);
});
