import { test, expect } from 'vitest';
import { srcFiles, type SourceFile } from './walk.js';

/** The §6 layer law, downward-only: contract (L0) imports NOTHING outside itself,
 *  cards (L1–L2) import contract only, run (L3) imports contract + cards. No src
 *  file imports test/. Only engine.ts imports turn; nothing in src imports engine.
 *  The one bare specifier the package allows itself is zod. */

function importsOf(f: SourceFile): readonly string[] {
  const specs: string[] = [];
  for (const line of f.text.split('\n')) {
    const m = /from\s+'([^']+)'/.exec(line);
    if (m) specs.push(m[1]);
  }
  return specs;
}

test('every src import points downward in the layer picture', () => {
  const bad: string[] = [];
  for (const f of srcFiles()) {
    const layer = f.rel.includes('/contract/') ? 'contract'
      : f.rel.includes('/cards/') ? 'cards' : 'run';
    for (const spec of importsOf(f)) {
      const ok =
        spec === 'zod' ? layer === 'run'
        : spec.startsWith('./') ? true
        : spec.startsWith('../contract/') ? layer !== 'contract'
        : spec.startsWith('../cards/') ? layer === 'run'
        : false;
      if (!ok) bad.push(`${f.rel} imports ${spec}`);
      if (spec.includes('test/') || spec.includes('../../test')) bad.push(`${f.rel} imports test code`);
      if (spec.endsWith('/turn.js') || spec === './turn.js') {
        if (!f.rel.endsWith('run/engine.ts')) bad.push(`${f.rel} imports turn — only engine composes it`);
      }
      if (spec.endsWith('/engine.js') || spec === './engine.js') {
        bad.push(`${f.rel} imports engine — only facades may`);
      }
    }
  }
  expect(bad).toEqual([]);
});
