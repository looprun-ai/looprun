#!/usr/bin/env node
/**
 * Write a governance proof record from the latest run summary, then regenerate MATRIX.md.
 *
 *   node scripts/proofs/make-record.mjs \
 *     --slug add-arg-required-format --change "argRequired: reject empty string args" \
 *     --scope guard:argRequired [--date YYYY-MM-DD] [--slm "3/3"|"n/a"] [--notes "..."] [--force]
 *
 * Reads governance/.artifacts/proofs.json (produced by `pnpm proofs:run`). The verdict is PASS iff
 * every proof passed. Refuses to overwrite an existing record unless --force.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { today } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ARTIFACTS = join(ROOT, 'governance', '.artifacts', 'proofs.json');
const CANARY = join(ROOT, 'governance', '.artifacts', 'canary.json');
const PROOFS = join(ROOT, 'governance', 'proofs');

/** The advisory SLM-canary prefill: `"<passRate> (model <alias>, advisory)"` when a real-model run
 *  exists and was not skipped, else null. An explicit `--slm` always overrides this. */
function canaryPrefill() {
  if (!existsSync(CANARY)) return null;
  try {
    const c = JSON.parse(readFileSync(CANARY, 'utf8'));
    if (c && !c.skipped && c.passRate) return `${c.passRate} (model ${c.model}, advisory)`;
  } catch {
    /* ignore a malformed artifact — fall back to n/a */
  }
  return null;
}

function argv() {
  const a = process.argv.slice(2);
  const o = { force: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    // Skip a bare `--` passthrough separator: `pnpm proofs:record -- --slug ...` can forward the
    // literal `--` into argv depending on the package manager. It carries no value of its own.
    if (k === '--') continue;
    if (k === '--force') o.force = true;
    // Boolean flag (no value): suppress the guard proof-case boilerplate for a docs/skill-only record.
    else if (k === '--no-proof-cases') o.noProofCases = true;
    else if (k.startsWith('--')) o[k.slice(2)] = a[++i];
  }
  return o;
}

function die(msg) {
  console.error(`make-record: ${msg}`);
  process.exit(1);
}

const o = argv();
if (!o.slug) die('--slug <kebab> is required.');
if (!o.change) die('--change "<one-liner>" is required.');
if (!o.scope) die('--scope <guard:<kind>|runtime|skill|docs> is required.');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug)) die(`--slug must be kebab-case (got "${o.slug}").`);

// Parse --scope into change_kind + target.
let change_kind = o.scope;
let target = '—';
if (o.scope.includes(':')) {
  const [k, t] = o.scope.split(':');
  change_kind = k;
  target = t;
}
if (!['guard', 'runtime', 'skill', 'docs'].includes(change_kind)) {
  die(`--scope must start with one of guard:/runtime/skill/docs (got "${o.scope}").`);
}

if (!existsSync(ARTIFACTS)) {
  die('governance/.artifacts/proofs.json not found — run `pnpm proofs:run` first.');
}
const s = JSON.parse(readFileSync(ARTIFACTS, 'utf8'));
const t = s.totals;
const verdict = t.all.total > 0 && t.all.pass === t.all.total ? 'PASS' : 'FAIL';
const isolated = `${t.isolated.pass}/${t.isolated.total}`;
const collective = `${t.collective.pass}/${t.collective.total}`;
const coverage = `${s.coverage.covered}/${s.coverage.kinds}`;
const slm = o.slm || canaryPrefill() || 'n/a';
// Per-artifact certification data: `model:score×reps` entries, `;`-joined
// (e.g. "flash-lite:61/61×3; local-35b:57/61×1+band"). `n/a` for a change with no measured
// deployment target (a runtime/guard/skill change that ships no certified bundle).
const certified = o.certified || 'n/a';
const date = o.date || today();

const file = join(PROOFS, `${date}-${o.slug}.md`);
if (existsSync(file) && !o.force) {
  die(`record already exists: ${file} (pass --force to overwrite).`);
}

const scopeLabel = change_kind === 'guard' ? `guard:${target}` : change_kind;
const notes = o.notes ? `\n${o.notes}\n` : '\n_None._\n';

// A docs/skill-only record (or an explicit `--no-proof-cases`) touches no guard/runtime source, so the
// guard proof-case authoring boilerplate is inapplicable. Emit an n/a line pinned to the (unchanged)
// suite tally instead.
const docsOnly = change_kind === 'skill' || change_kind === 'docs' || o.noProofCases;
const proofCases = docsOnly
  ? `n/a (docs/skill-only change; guard runtime unchanged; \`pnpm proofs:run\` ${t.all.pass}/${t.all.total} unchanged).`
  : `Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See \`skills/looprun-governance/references/proof-case-authoring.md\`.`;

const body = `---
date: ${date}
slug: ${o.slug}
change_kind: ${change_kind}
target: ${target}
summary: ${o.change}
isolated: ${isolated}
collective: ${collective}
coverage: ${coverage}
certified_models: ${certified}
slm_canary: ${slm}
verdict: ${verdict}
suite_cmd: pnpm proofs:run
---

# Proof record — ${o.change}

**Scope:** \`${scopeLabel}\` · **Date:** ${date} · **Verdict:** ${verdict}

## What changed
${o.change}

## Proof cases
${proofCases}

## Results
Recorded from \`${ARTIFACTS.replace(ROOT + '/', '')}\` (\`${s.generatedBy}\`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | ${isolated} |
| collective | ${collective} |
| ratchet | ${t.ratchet.pass}/${t.ratchet.total} |
| coverage (kinds fully proven) | ${coverage} |
| **all** | **${t.all.pass}/${t.all.total}** |

## SLM canary (advisory)
${slm === 'n/a' ? 'Not run for this change (report-only lane; never gates the PR).' : `Report-only small-local-model run: ${slm}.`}

## Verdict & residuals
**${verdict}.**
${notes}`;

writeFileSync(file, body);
console.log(`make-record: wrote ${file.replace(ROOT + '/', '')} (verdict ${verdict}).`);

// Regenerate the matrix.
const gen = spawnSync('node', [join(HERE, 'gen-matrix.mjs')], { stdio: 'inherit' });
process.exit(gen.status ?? 0);
