#!/usr/bin/env node
/**
 * Portable purity/firewall lint for a generated AgentSpec or theme — runs with ZERO project
 * install (pure node, no looprun import). Use it in Stage N5 when a spec is drafted OUTSIDE a
 * looprun project (a `npx skills add` install). Inside a project, `npx looprun-eval lint
 * [--spec-laws]` is the full gate; this script mirrors it — the SAME four file-local rule sets —
 * so a lone spec/theme file can still be checked. Parity with `@looprun-ai/eval` lint is tested in
 * the looprun repo.
 *
 *   node lint-guards.mjs <file-or-dir> [<file-or-dir> …]
 *   exit 0 = clean · exit 1 = violations (printed as  file:line — <rule>)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── the four rule sets (mirror the @looprun-ai/eval lint) ────────────────────────────────────────────
// (1) banned tokens — a check()/prose()/mutator must be a PURE function of its GuardCtx.
const BANNED = [
  'Date.now(', 'new Date(', 'performance.now(', 'process.hrtime', // wall-clock
  'Math.random(', 'crypto.',                                      // entropy
  'fetch(',                                                        // network
  'generateText(', 'streamText(', 'makeLanguageModel(', 'createOpenAI(', 'createGoogleGenerativeAI(', // runtime LLM
];
const EXEMPT = 'purity-exempt'; // honored ONLY inside a guards.ts file (a sanctioned, documented impurity)

// (2) stateful /g,/y regex flags (closure-held lastIndex → alternating verdicts).
const G_LITERAL = /\/(?:[^/\\\n ]|\\.)+\/[a-z]*[gy][a-z]*(?=[\s,;)\].]|$)/;
const G_NEWREGEXP = /new RegExp\([^)]*['"`][a-z]*[gy][a-z]*['"`]\s*\)/;
const G_ALLOW = 'new RegExp(`\\b${from}\\b`'; // the sanctioned jargonScrub per-instance builder

// (3) S-1 firewall — the GuardCtx type may expose NO user-text surface.
const FIREWALL_KEYS = ['userText', 'messages', 'history', 'userMessage', 'prompt'];

// (4) theme-persona law — a domain THEME carries NO persona; persona is per-agent, on the spec's
// `persona` field (the persona-on-spec law). Applies to *theme*.ts files only.
const THEME_PERSONA = /^\s*persona\s*[:(]/;

// ── scan ──────────────────────────────────────────────────────────────────────────────────────────
function collect(path) {
  const st = statSync(path);
  if (st.isFile()) return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  return readdirSync(path, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(path, f));
}

const isComment = (l) => { const t = l.trim(); return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'); };
const stripTrailingComment = (l) => l.replace(/\/\/.*$/, '');

function lintFile(file, out) {
  const text = readFileSync(file, 'utf8');
  const inGuardsTs = file.endsWith('guards.ts');
  const inThemeTs = /theme[^/]*\.ts$/.test(file);
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    const n = i + 1;
    // (4) theme-persona law
    if (inThemeTs && !isComment(line) && THEME_PERSONA.test(line)) {
      out.push(`${file}:${n} — theme carries a persona (persona-on-spec law: persona is per-agent, on the spec's \`persona\` field — a theme owns only invariants/language/stateBlock/exhaustion)`);
    }
    // (1) banned tokens
    for (const bad of BANNED) {
      if (line.includes(bad) && !(inGuardsTs && line.toLowerCase().includes(EXEMPT))) {
        out.push(`${file}:${n} — impure token \`${bad}\` (banned in a guard: no clock/entropy/network/runtime-LLM)`);
      }
    }
    // (2) stateful g/y regex
    if (!isComment(line)) {
      const code = stripTrailingComment(line);
      if ((G_LITERAL.test(code) || G_NEWREGEXP.test(code)) &&
          !code.includes('.match(') && !code.includes('.replace(') && !code.includes(G_ALLOW)) {
        out.push(`${file}:${n} — stateful /g or /y regex flag (lastIndex alternates verdicts); use .match/.replace or build per-call`);
      }
    }
  });

  // (3) S-1 firewall — only meaningful where GuardCtx is DECLARED; a no-op for a lone spec.
  const start = text.indexOf('export interface GuardCtx');
  if (start !== -1) {
    const end = text.indexOf('export interface Guard ', start);
    const block = text.slice(start, end === -1 ? undefined : end);
    for (const key of FIREWALL_KEYS) {
      if (new RegExp(`\\b${key}\\b`).test(block)) {
        out.push(`${file} — GuardCtx exposes user-text surface \`${key}\` (S-1 firewall: a check may NEVER read the user's text)`);
      }
    }
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node lint-guards.mjs <file-or-dir> [<file-or-dir> …]');
  process.exit(2);
}
const files = args.flatMap(collect);
const violations = [];
for (const f of files) lintFile(f, violations);

if (violations.length) {
  console.error(`✗ guard purity lint: ${violations.length} violation(s) in ${files.length} file(s)\n`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`✓ guard purity lint: ${files.length} file(s) clean (banned-token + stateful-regex + S-1 firewall + theme-persona)`);
