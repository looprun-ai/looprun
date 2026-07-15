#!/usr/bin/env node
/**
 * Run the deterministic guard-proof suite and write a summary to governance/.artifacts/proofs.json.
 *
 * For each governed package (packages/core, packages/mastra) it runs the vitest proof suite
 * (test/proofs) with the JSON reporter, then tallies the assertions by test-id convention:
 *
 *   isolated    fullName starts with 'L1 ·' or 'L3 ·'   (per-guard pure-check + full-loop cases)
 *   collective  fullName starts with 'collective'       (super-agent non-interference)
 *   ratchet     fullName starts with 'proof completeness ·'  (the coverage ratchet)
 *   other       everything else                          (mechanics / fixtures)
 *
 * coverage counts distinct `proof completeness · <kind>` describes that fully passed.
 *
 * Exit: non-zero if any proof failed. When NO proof tests exist yet, exit 0 only with --allow-empty
 * (so a pre-suite checkout is green); otherwise exit 1 ("no proof tests found").
 *
 * Usage: node scripts/proofs/run-proofs.mjs [--allow-empty]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ARTIFACTS = join(ROOT, 'governance', '.artifacts');
const OUT = join(ARTIFACTS, 'proofs.json');
const PACKAGES = ['packages/core', 'packages/mastra'];
const allowEmpty = process.argv.includes('--allow-empty');

function classify(fullName) {
  if (fullName.startsWith('L1 ·') || fullName.startsWith('L3 ·')) return 'isolated';
  if (fullName.startsWith('collective')) return 'collective';
  if (fullName.startsWith('proof completeness ·')) return 'ratchet';
  return 'other';
}

/** Run one package's proof suite; returns { ran, note?, assertions[] }. */
function runPackage(pkg) {
  const suiteDir = join(ROOT, pkg, 'test', 'proofs');
  if (!existsSync(suiteDir)) {
    return { ran: false, note: 'no test/proofs directory yet — skipped', assertions: [] };
  }
  const jsonOut = join(ARTIFACTS, `raw-${pkg.replace(/[\/]/g, '-')}.json`);
  rmSync(jsonOut, { force: true });
  const res = spawnSync(
    'pnpm',
    ['-C', pkg, 'exec', 'vitest', 'run', 'test/proofs', '--reporter=json', `--outputFile=${jsonOut}`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  let report;
  if (existsSync(jsonOut)) {
    try {
      report = JSON.parse(readFileSync(jsonOut, 'utf8'));
    } catch (e) {
      return { ran: true, note: `unparseable vitest JSON: ${e.message}`, assertions: [], error: true };
    }
  } else {
    // Fall back to stdout (some vitest builds print JSON to stdout).
    try {
      report = JSON.parse(res.stdout);
    } catch {
      return {
        ran: true,
        note: `vitest produced no JSON (exit ${res.status}). ${(res.stderr || '').slice(0, 200)}`,
        assertions: [],
        error: true,
      };
    }
  }
  const assertions = [];
  for (const tr of report.testResults ?? []) {
    for (const a of tr.assertionResults ?? []) {
      const fullName = a.fullName ?? [...(a.ancestorTitles ?? []), a.title].join(' ');
      assertions.push({ fullName, status: a.status });
    }
  }
  return { ran: true, assertions };
}

function main() {
  mkdirSync(ARTIFACTS, { recursive: true });

  const packages = {};
  const all = [];
  let anyError = false;
  for (const pkg of PACKAGES) {
    const r = runPackage(pkg);
    if (r.error) anyError = true;
    const buckets = { isolated: { pass: 0, total: 0 }, collective: { pass: 0, total: 0 }, ratchet: { pass: 0, total: 0 }, other: { pass: 0, total: 0 } };
    for (const a of r.assertions) {
      const b = buckets[classify(a.fullName)];
      b.total += 1;
      if (a.status === 'passed') b.pass += 1;
      all.push(a);
    }
    packages[pkg] = { ran: r.ran, note: r.note, tests: r.assertions.length, buckets };
  }

  const totals = { isolated: { pass: 0, total: 0 }, collective: { pass: 0, total: 0 }, ratchet: { pass: 0, total: 0 }, other: { pass: 0, total: 0 }, all: { pass: 0, total: 0 } };
  for (const a of all) {
    const kind = classify(a.fullName);
    totals[kind].total += 1;
    totals.all.total += 1;
    if (a.status === 'passed') {
      totals[kind].pass += 1;
      totals.all.pass += 1;
    }
  }

  // Coverage: distinct `proof completeness · <kind>` describes that fully passed.
  const perKind = new Map(); // kind -> { pass, total }
  for (const a of all) {
    if (!a.fullName.startsWith('proof completeness ·')) continue;
    const m = a.fullName.match(/^proof completeness · (\S+)/);
    if (!m) continue;
    const k = m[1];
    const c = perKind.get(k) ?? { pass: 0, total: 0 };
    c.total += 1;
    if (a.status === 'passed') c.pass += 1;
    perKind.set(k, c);
  }
  let covered = 0;
  for (const c of perKind.values()) if (c.total > 0 && c.pass === c.total) covered += 1;
  const coverage = { covered, kinds: perKind.size };

  const summary = { generatedBy: 'scripts/proofs/run-proofs.mjs', generatedAt: new Date().toISOString(), packages, totals, coverage };
  writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');

  const failed = totals.all.total - totals.all.pass;
  const line = (n) => process.stdout.write(n + '\n');
  line(`proofs → ${OUT}`);
  line(`  isolated   ${totals.isolated.pass}/${totals.isolated.total}`);
  line(`  collective ${totals.collective.pass}/${totals.collective.total}`);
  line(`  ratchet    ${totals.ratchet.pass}/${totals.ratchet.total}   coverage ${coverage.covered}/${coverage.kinds} kinds`);
  line(`  other      ${totals.other.pass}/${totals.other.total}`);
  line(`  ALL        ${totals.all.pass}/${totals.all.total}`);
  for (const [pkg, p] of Object.entries(packages)) if (!p.ran) line(`  (${pkg}: ${p.note})`);

  if (anyError) {
    console.error('run-proofs: a package proof run errored (see notes above).');
    process.exit(1);
  }
  if (totals.all.total === 0) {
    if (allowEmpty) {
      line('no proof tests found — passing on --allow-empty (pre-suite checkout).');
      process.exit(0);
    }
    console.error('run-proofs: no proof tests found. Land the proof suite, or pass --allow-empty for a pre-suite checkout.');
    process.exit(1);
  }
  if (failed > 0) {
    console.error(`run-proofs: ${failed} proof(s) FAILED.`);
    process.exit(1);
  }
  process.exit(0);
}

main();
