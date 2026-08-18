import { test, expect } from 'vitest';
import ts from 'typescript';
import { RETIRED_NAMES } from '../../src/contract/rename-register.js';
import { sourceFiles } from './walk.js';

// The register itself lives in the contract leaf — subjects and the eval lints
// consume the same rows this gate enforces.
const BANNED = new Set(RETIRED_NAMES);

test('no retired identifier from the rename register exists in the tree', () => {
  const hits: string[] = [];
  for (const f of sourceFiles()) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && BANNED.has(node.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push(`${f.rel}:${line + 1} — ${node.text}`);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  expect(hits).toEqual([]);
});
