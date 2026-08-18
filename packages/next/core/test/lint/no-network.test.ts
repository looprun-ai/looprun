import { test, expect } from 'vitest';
import ts from 'typescript';
import { srcFiles } from './walk.js';

/** The engine reaches no network primitive — no fetch, no node http client, no
 *  sockets. The declared doors are the server package (the wire is its purpose)
 *  and the models package (local serving and artifact pulls over loopback):
 *  node:http is lawful in those two srcs and nowhere else, and even there the
 *  browser client primitives stay banned. */
const NETWORK = new Set(['fetch', 'XMLHttpRequest', 'WebSocket']);
const NETWORK_MODULES = new Set(['node:http', 'node:https', 'node:net', 'node:tls', 'http', 'https']);

test('src reaches no network primitive', () => {
  const hits: string[] = [];
  for (const f of srcFiles()) {
    const isWireDoor = f.rel.startsWith('server/src/') || f.rel.startsWith('models/src/');
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && NETWORK.has(node.text)) hits.push(`${f.rel} — ${node.text}`);
      if (ts.isStringLiteral(node) && NETWORK_MODULES.has(node.text)
        && node.parent && ts.isImportDeclaration(node.parent)
        && !(isWireDoor && node.text === 'node:http')) {
        hits.push(`${f.rel} — import ${node.text}`);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  expect(hits).toEqual([]);
});
