#!/usr/bin/env node
/**
 * THE GUARD-PRIORITY GATE — a guard id's prefix names the QUESTION that guard answers, and the field
 * carrying it is `priority`. The retired identifiers may not survive in any file a person reads:
 * source, types, tests, docs, guard text, CLI output, generated subjects.
 *
 * Three things keep an old identifier: a run taken on a date, a release note, and a phrase where the
 * word is ordinary English — a validator's four numbered stages, an attestation's Layer 1.
 *
 * `layer:` as an object key is absent from this gate on purpose: renaming `GuardBinding.layer` makes
 * every such site a type error, and `pnpm typecheck` names each one exactly. A gate that banned the
 * word would fire on "the action layer" and "the two-layer law", which name something else.
 *
 * Run: node tests/guard-priority.test.mjs [--root <path>]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = flag('--root') ?? join(HERE, '..');
// The gate quotes every name it bans, so it is the one file that must not be read by itself.
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

// `base:` is banned only when a non-space follows it: `base:confirmFirst` is the retired id prefix,
// `base: string` is a parameter annotation. `minimal:` has no such collision and is banned outright.
const NAMES = {
  'minimal: prefix': /minimal:/,
  'base: prefix': /\bbase:(?! )/,
  LAYER_ORDER: /LAYER_ORDER/,
  writeGate: /\bwriteGate\b|\bWriteGate\b/,
  Layer: /\bLayer\b/,
  '.layer': /\.layer\b/,
};

// No name is allowed anywhere. An entry here would protect ONE sense in ONE path — a file where the
// letters spell ordinary English rather than the identifier — and no such file exists: every English
// sense that collided was rewritten to the word it actually meant.
const ALLOW = [];

const SKIP_DIR = new Set(['node_modules', 'dist', 'results', 'coverage']);
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sh']);

// THREE KINDS OF DATED RECORD keep the names they were written with, because rewriting one makes it
// disagree with what it records:
//   docs/superpowers/**   a spec states what was decided and on what grounds; a plan, how it was
//                         carried out. Neither documents the system as it stands.
//   **/cases.jsonl        a transcript of what a model did on a date, guard denials and all.
//   **/CHANGELOG.md       a release note keeps the names its release shipped, or a consumer on that
//                         version has no migration to follow.
const skipFile = (rel) =>
  rel.startsWith('docs/superpowers/') ||
  rel.endsWith('cases.jsonl') ||
  rel.endsWith('CHANGELOG.md');

// A dot-directory holds tooling state and vendored third-party files, neither of which this repo
// writes: `examples/hermes-sim/.hermes-home/` ships skill files where `Layer` is a graphics layer.
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry) || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else if (EXT.has(entry.slice(entry.lastIndexOf('.')))) yield abs;
  }
}

const allowed = (rel, name) =>
  ALLOW.some((a) => rel.startsWith(a.path) && (a.name === undefined || a.name === name));

// SELF-TEST: a gate that cannot fail is no law. Only the three names whose regex draws a LINE are
// tested — each must catch the identifier and spare the English phrase that shares its letters. The
// other three are plain substrings with no English collision, so there is no line to prove.
const SELF_TEST = [
  ['base: prefix', "targets: ['base:confirmFirst']", true],
  ['base: prefix', 'function f(base: string) {}', false],
  ['Layer', 'Record<Layer, number>', true],
  ['Layer', 'the honesty layer of the prompt', false],
  ['.layer', 'sort by b.layer', true],
  ['.layer', 'the action layer', false],
];
for (const [name, sample, shouldHit] of SELF_TEST) {
  if (NAMES[name].test(sample) !== shouldHit) {
    console.error(`guard-priority SELF-TEST failed — ${name} on: ${sample}`);
    process.exit(1);
  }
}

const hits = [];
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs);
  if (rel === SELF || skipFile(rel)) continue;
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (const [name, re] of Object.entries(NAMES)) {
    if (allowed(rel, name)) continue;
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`${rel}:${i + 1}  ${name}  ${line.trim().slice(0, 120)}`);
    });
  }
}

if (hits.length) {
  console.error(`guard-priority: ${hits.length} retired identifier(s) in ${ROOT}\n`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`guard-priority: clean (${Object.keys(NAMES).join(', ')}) in ${ROOT}`);
