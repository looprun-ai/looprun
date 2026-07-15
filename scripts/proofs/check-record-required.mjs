#!/usr/bin/env node
/**
 * The PR gate: if a change touches a GOVERNED path, it must ship a passing proof record.
 *
 *   node scripts/proofs/check-record-required.mjs --base origin/main
 *
 * Governed = a changed file under a TRIGGER prefix and NOT under an EXCLUDE rule (exclusions win).
 * When triggered, the same diff must Add/Modify at least one governance/proofs/*.md whose
 * frontmatter parses and reads `verdict: PASS`. Missing/unfetchable base ⇒ SKIPPED (exit 0), so a
 * local run off a branch does not explode.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// A change under one of these must carry a proof record …
export const TRIGGERS = [
  'packages/core/src/',
  'packages/core/GUARDS.md',
  'packages/mastra/src/',
  'skills/agentspec/',
];

// … unless the path is excluded. Exclusions are checked FIRST (they always win).
export function isExcluded(path) {
  if (path.includes('/test/')) return true;
  const prefixes = ['docs/', 'examples/', '.changeset/', 'skills/looprun-governance/', 'scripts/', '.github/', 'governance/'];
  if (prefixes.some((p) => path.startsWith(p))) return true;
  if (path === 'README.md' || path.endsWith('/README.md')) return true;
  if (path.endsWith('package.json')) return true;
  if (path === 'pnpm-lock.yaml' || path === 'package-lock.json' || path === 'yarn.lock') return true;
  return false;
}

export function isTrigger(path) {
  if (isExcluded(path)) return false;
  return TRIGGERS.some((t) => path.startsWith(t) || path === t);
}

/** Split a changed-file list into governed triggers and proof-record files. */
export function classify(files) {
  const triggered = files.filter(isTrigger);
  const records = files.filter((f) => f.startsWith('governance/proofs/') && f.endsWith('.md') && !f.endsWith('README.md'));
  return { triggered, records };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function main() {
  const base = arg('--base');
  if (!base) {
    console.error('check-record-required: --base <ref> is required.');
    process.exit(1);
  }

  // Base reachable?
  if (git(['rev-parse', '--verify', '--quiet', base]).status !== 0) {
    console.log(`check-record-required: SKIPPED — base ref "${base}" not found (nothing to diff against).`);
    process.exit(0);
  }

  const diff = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]);
  if (diff.status !== 0) {
    console.log(`check-record-required: SKIPPED — cannot diff against "${base}".`);
    process.exit(0);
  }
  const files = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const { triggered, records } = classify(files);

  if (triggered.length === 0) {
    console.log('check-record-required: no governed paths changed — OK.');
    process.exit(0);
  }

  console.log(`check-record-required: ${triggered.length} governed path(s) changed:`);
  for (const f of triggered) console.log(`    ${f}`);

  const passing = [];
  for (const rec of records) {
    const p = join(ROOT, rec);
    if (!existsSync(p)) continue;
    try {
      const fm = parseFrontmatter(readFileSync(p, 'utf8'), rec);
      if (fm.verdict === 'PASS') passing.push(rec);
    } catch (e) {
      console.log(`    (skipping malformed record ${rec}: ${e.message})`);
    }
  }

  if (passing.length > 0) {
    console.log('check-record-required: proof record present:');
    for (const r of passing) console.log(`    ${r}`);
    process.exit(0);
  }

  console.error('\ncheck-record-required: a governed change needs a passing proof record, and none was found.\n');
  console.error('Do this (the `looprun-governance` skill automates it):');
  console.error('  1. pnpm proofs:run');
  console.error('  2. pnpm proofs:record -- --slug <kebab> --change "<one-liner>" --scope guard:<kind>');
  console.error('  3. commit the record + governance/MATRIX.md');
  console.error('\nDocs-tooling-only or intentionally exempt? A maintainer can add the `no-proof-needed` label.');
  process.exit(1);
}

// Run only when executed directly (so the pure helpers above are importable for tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
