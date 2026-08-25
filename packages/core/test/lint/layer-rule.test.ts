import { test, expect } from 'vitest';
import { srcFiles, type SourceFile } from './walk.js';

/** The §6 layer law, downward-only: contract (L0) imports NOTHING outside itself,
 *  cards (L1–L2) import contract only, world imports contract only, run (L3) imports
 *  contract + cards — never world: the machine reaches a BuiltWorld through the
 *  ToolPort/RecordsPort seams it implements. No src file imports test/. Only
 *  engine.ts imports turn; nothing in src imports engine except the export barrel
 *  (src/index.ts), which re-exports the public surface for the facade packages and
 *  composes nothing. The one bare specifier the package allows itself is zod. */

function importsOf(f: SourceFile): readonly string[] {
  const specs: string[] = [];
  for (const line of f.text.split('\n')) {
    // A comment quoting an import is prose, not an edge in the picture: a header that
    // shows `from 'looprun'` as the hello world declares nothing.
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    const m = /from\s+'([^']+)'/.exec(line);
    if (m) specs.push(m[1]);
  }
  return specs;
}

/** The facade packages sit above core in the §6 picture: mastra (L5) may import the
 *  core package by NAME plus its own host framework; server (L6) may import core and
 *  the mastra facade by name and node builtins — never a framework, never a relative
 *  path escaping its own src. The umbrella sits above them all: it aggregates every
 *  facade by name, and its chat door composes across eval, mastra and server. */
const FACADE_LANES: Readonly<Record<string, (spec: string) => boolean>> = {
  mastra: spec => spec.startsWith('./') || spec === '@looprun-ai/core'
    || spec === 'ai' || spec.startsWith('@mastra/') || spec.startsWith('@modelcontextprotocol/sdk/')
    || spec === 'zod' || spec.startsWith('node:'),
  server: spec => spec.startsWith('./') || spec === '@looprun-ai/core'
    || spec === '@looprun-ai/mastra' || spec.startsWith('node:'),
  eval: spec => spec.startsWith('./') || spec === '@looprun-ai/core'
    || spec === '@looprun-ai/mastra' || spec === 'zod' || spec === 'typescript'
    || spec.startsWith('node:'),
  models: spec => spec.startsWith('./') || spec === '@looprun-ai/core'
    || spec.startsWith('node:'),
  /** emit reads a declaration and writes cards from it: it may reach core and eval by
   *  name, the yaml package for the declaration format, and node builtins for the CLI. */
  emit: spec => spec.startsWith('./') || spec === '@looprun-ai/core'
    || spec === '@looprun-ai/eval' || spec === 'yaml' || spec.startsWith('node:'),
  /** The umbrella is the published name of the whole: most of its modules re-export one
   *  package by name and nothing else. Its one composed module is the chat door
   *  (`chat-main.ts`): it loads a subject through eval, routes it through mastra, and
   *  hands the terminal to server — the CLI's own act, not a re-export. */
  looprun: spec => spec === '@looprun-ai/core' || spec === '@looprun-ai/mastra'
    || spec === '@looprun-ai/models' || spec === '@looprun-ai/eval' || spec === '@looprun-ai/server'
};

test('every src import points downward in the layer picture', () => {
  const bad: string[] = [];
  for (const f of srcFiles()) {
    const pkg = f.rel.split('/')[0];
    const lane = FACADE_LANES[pkg];
    if (lane) {
      for (const spec of importsOf(f)) {
        if (!lane(spec)) bad.push(`${f.rel} imports ${spec}`);
        if (spec.includes('test/') || spec.startsWith('..')) bad.push(`${f.rel} escapes its src`);
      }
      continue;
    }
    if (f.rel.endsWith('src/index.ts')) {
      for (const spec of importsOf(f)) {
        if (!spec.startsWith('./')) bad.push(`${f.rel} imports ${spec} — the barrel re-exports src only`);
        if (spec.includes('test/')) bad.push(`${f.rel} imports test code`);
        if (spec.endsWith('/turn.js')) bad.push(`${f.rel} imports turn — only engine composes it`);
      }
      continue;
    }
    const layer = f.rel.includes('/contract/') ? 'contract'
      : f.rel.includes('/cards/') ? 'cards'
      : f.rel.includes('/world/') ? 'world' : 'run';
    for (const spec of importsOf(f)) {
      const ok =
        spec === 'zod' ? layer === 'run'
        : spec === 'node:crypto' ? layer === 'cards' || layer === 'run'
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
