#!/usr/bin/env node
/**
 * THE NO-BENCH-DRIFT GATE — looprun is a standalone framework: no reference to its research
 * lineage (the neurono bench harness, its env vars, paths, adapters or subjects) may survive in
 * user-facing surfaces. The ONLY allowlisted file is skills/agentspec/CONTEXT.md (the honesty
 * record of where the skill came from).
 *
 * SECOND LAW (vendor neutrality, 2026-07-18): looprun is coding-agent-agnostic — no term tied to
 * one specific agent environment (a vendor's agent product, model names as tooling: "X judge",
 * "X Code", model-tier names) may appear in user-facing surfaces. The neutral vocabulary is
 * "the LLM judge" / "the coding agent running the skill". Allowlisted: CONTEXT.md (research
 * provenance) and docs/benchmarks.md (third-party leaderboard rows name the models being measured).
 * A dotdir path like `.claude/skills/` is a skills-CLI install location, not a vendor term —
 * the lookbehind exempts it.
 *
 * Run: node tests/no-bench-drift.test.mjs   (CI runs it on every push/PR)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Surfaces that must be bench-free.
const SCOPES = ['skills', 'docs', 'examples', 'packages/eval/src', 'packages/eval/bin', 'packages/eval/assets', 'packages/core/src', 'packages/mastra/src', 'packages/models/src', 'packages/looprun/src', 'packages/server/src', 'README.md', 'governance', 'scripts/proofs', 'CONTRIBUTING.md', '.github'];

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

// Vendor-neutrality law: terms tied to one agent environment. Lookbehind exempts dotdir paths
// (".claude/") and scoped package names ("@.../claude-...").
const VENDOR = /(?<![.\/@-])\b(claude|anthropic|opus|sonnet|haiku)\b/i;
const VENDOR_ALLOWLIST = new Set(['skills/agentspec/CONTEXT.md', 'docs/benchmarks.md']);

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
      if (!VENDOR_ALLOWLIST.has(rel)) {
        const v = text.match(VENDOR);
        if (v) violations.push(`${rel}:${i + 1}  [vendor:${v[0]}]  ${text.trim().slice(0, 120)}`);
      }
    });
  }
}

// SELF-TEST: the gate must FIRE (a lint that cannot fail is no law).
if (!DRIFT.test('pnpm -C bench test') || !DRIFT.test('the neurono engine') || DRIFT.test('a clean looprun sentence')) {
  console.error('no-bench-drift SELF-TEST failed — the gate regex is broken');
  process.exit(2);
}
if (
  !VENDOR.test('the Claude judge') || !VENDOR.test('an Anthropic model') ||
  VENDOR.test('installs into .claude/skills/') || VENDOR.test('the LLM judge grades the rubric')
) {
  console.error('vendor-neutrality SELF-TEST failed — the gate regex is broken');
  process.exit(2);
}

if (violations.length) {
  console.error(`no-bench-drift: ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('no-bench-drift: clean');
