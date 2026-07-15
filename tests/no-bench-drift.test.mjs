#!/usr/bin/env node
/**
 * THE NO-BENCH-DRIFT GATE — looprun is a standalone framework: no reference to its research
 * lineage (the neurono bench harness, its env vars, paths, adapters or subjects) may survive in
 * user-facing surfaces. The ONLY allowlisted file is skills/agentspec/CONTEXT.md (the honesty
 * record of where the skill came from).
 *
 * Run: node tests/no-bench-drift.test.mjs   (CI runs it on every push/PR)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Surfaces that must be bench-free.
const SCOPES = ['skills', 'docs', 'examples', 'packages/eval/src', 'packages/eval/bin', 'packages/eval/assets', 'README.md', 'governance', 'scripts/proofs', 'CONTRIBUTING.md', '.github'];

// One regex, case-insensitive where it matters.
const DRIFT = new RegExp(
  [
    'neurono',
    'criaty',
    '\\bNB_[A-Z_]+',
    '\\bBENCH_EXAMPLE\\b',
    'bench-core',
    'bench/adapters',
    'agents-generated',
    'CASE-MAP\\.tsv',
    'pnpm -C bench',
    'run-subject\\.sh',
    'screen\\.sh',
    'certify\\.sh',
    'judge-merge\\.sh',
    's15-run-set',
    'run-engine',
    'agentspec-runtime',
    'agentspec-generator',
    '\\bs1[2-5]\\b',
  ].join('|'),
  'i',
);

const ALLOWLIST = new Set(['skills/agentspec/CONTEXT.md']);

function* walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    yield* walk(join(path, entry));
  }
}

const violations = [];
for (const scope of SCOPES) {
  for (const file of walk(join(ROOT, scope))) {
    const rel = relative(ROOT, file);
    if (ALLOWLIST.has(rel)) continue;
    if (/\.(png|jpg|jpeg|gif|gguf|zip)$/.test(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      const m = text.match(DRIFT);
      if (m) violations.push(`${rel}:${i + 1}  [${m[0]}]  ${text.trim().slice(0, 120)}`);
    });
  }
}

// SELF-TEST: the gate must FIRE (a lint that cannot fail is no law).
if (!DRIFT.test('pnpm -C bench test') || !DRIFT.test('the neurono engine') || DRIFT.test('a clean looprun sentence')) {
  console.error('no-bench-drift SELF-TEST failed — the gate regex is broken');
  process.exit(2);
}

if (violations.length) {
  console.error(`no-bench-drift: ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('no-bench-drift: clean');
