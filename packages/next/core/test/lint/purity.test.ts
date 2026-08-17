import { test, expect } from 'vitest';
import ts from 'typescript';
import { srcFiles } from './walk.js';

/** Charter R6.6: a guard never uses a regex — and in phase 1 the pattern factories
 *  do not exist, so the exception set is EMPTY: no regex literal and no RegExp
 *  construction anywhere in src/. */
test('no regex literal or RegExp construction exists in src', () => {
  const hits: string[] = [];
  for (const f of srcFiles()) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        hits.push(`${f.rel} — regex literal`);
      }
      if ((ts.isNewExpression(node) || ts.isCallExpression(node))
        && ts.isIdentifier(node.expression) && node.expression.text === 'RegExp') {
        hits.push(`${f.rel} — RegExp construction`);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  expect(hits).toEqual([]);
});
