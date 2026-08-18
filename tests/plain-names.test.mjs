#!/usr/bin/env node
/**
 * THE PLAIN-NAMES GATE — seven concepts are named with the words a reader already owns. The retired
 * names may not survive in any file a person reads: source, types, tests, docs, guard text, CLI
 * output, generated subjects, measurement tooling.
 *
 * Three things keep the old words: a run taken on a date, vendored third-party source, and a phrase
 * where the word is ordinary English — an out-of-band channel, the margin probe, a lockfile's arm64.
 * path under `benchmarks/<...>/results/` is excluded. Nothing else is.
 *
 * Run: node tests/plain-names.test.mjs [--root <path>] [--only ledger,probe]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = flag('--root') ?? join(HERE, '..');
const ONLY = flag('--only')?.split(',').map((s) => s.trim()).filter(Boolean);

// A retired name hides inside a camelCase identifier, where there is no word boundary at all:
// `createLedger`, `TurnLedger`, `foldTrunk`, `issueChallengeForVeto`, `CertBand`. So a name counts
// when a letter does not precede it, or when a hump starts it — a capital after a lowercase.
const lower = (Cap) => `${Cap[0].toLowerCase()}${Cap.slice(1)}`;
const opening = (Cap) => `(?<![A-Za-z])${lower(Cap)}|(?<![A-Za-z])${Cap}|(?<=[a-z0-9])${Cap}`;

// Five stems carry any suffix — `ledgers`, `probed`, `previewing`, `trunks`, `challenging` all name
// the retired concept — and a SCREAMING_CASE constant carries the name too.
const stem = (Cap) => new RegExp(`(?:${opening(Cap)}|(?<![A-Za-z])${Cap.toUpperCase()})[A-Za-z]*`);

// `arm` and `band` carry no suffix: `armed`, `arming`, `disarmed`, `warm`, `harm`, `alarm`,
// `bandwidth` and `abandon` are ordinary English this gate does not touch. A capital hump may still
// follow, so `armTotals` and `bandJson` are caught while `armed` is not. There is no SCREAMING_CASE
// lane here, because `ARMED_SEAMS` opens with the three letters of a word this gate does not own.
const bare = (Cap) => new RegExp(`(?:${opening(Cap)})s?(?![a-z])`);

const NAMES = {
  ledger: stem('Ledger'),
  probe: stem('Probe'),
  preview: stem('Preview'),
  trunk: stem('Trunk'),
  challenge: stem('Challeng'),
  arm: bare('Arm'),
  band: bare('Band'),
};

// Each entry protects ONE sense in ONE place: a path (exact file or directory prefix), the word it
// allows, and why. Allowing `probe` in the instrument's report does not also allow `ledger` there.
const ALLOW = [
  { path: 'docs/benchmarks.md', word: 'preview', text: 'Pro Preview', why: 'a third-party product name' },
  { path: 'docs/superpowers/specs/2026-08-08-disclosure-design.md', word: 'preview', text: 'gemini-3.1-pro-preview', why: 'a third-party model id' },
  { path: 'docs/superpowers/plans/2026-08-08-disclosure.md', word: 'preview', text: 'gemini-3.1-pro-preview', why: 'a third-party model id' },
  // `probe` also names an OFFLINE MEASURING INSTRUMENT — an experiment run against the engine, not
  // a world answering a question. "The margin simulate" is not a phrase.
  { path: 'packages/eval/probes/', word: 'probe', why: 'the instrument itself' },
  { path: 'packages/eval/package.json', word: 'probe', text: 'probe:lie-check', why: 'the instrument, as a script' },
  { path: 'packages/core/src/runtime/prompt.ts', word: 'probe', text: 'margin probe', why: 'the instrument, in prose' },
  { path: 'packages/mastra/test/prompt-identity.test.ts', word: 'probe', text: 'margin probe', why: 'the same instrument' },
  { path: 'docs/analysis/2026-08-04-lie-check-model-portability.md', word: 'probe', why: "the instrument's own report" },
  // A recording keeps the key names it was written with. Its reader has to name them to map them.
  { path: 'packages/eval/test/entity-record.analysis.test.ts', word: 'ledger', why: 'a recorded run\'s own key, mapped at the read boundary' },
  // ── the agentspec skill (gate this repo with --root ../agentspec) ────────────────────────────
  { path: 'skill/scripts/margin-probe.mjs', word: 'probe', why: 'the instrument itself' },
  { path: 'skill/scripts/serve-local.sh', word: 'probe', why: 'the instrument, in its serving recipe' },
  // `band` and `arm` are also ordinary English: an out-of-band channel is one outside the normal
  // route, and to arm something is to make it live.
  { path: 'skill/references/evals.md', word: 'band', text: 'out-of-band', why: 'an English idiom' },
  { path: 'README.md', word: 'arm', text: 'silently arm the agent', why: 'the verb: to make live' },
  { path: 'docs/superpowers/specs/2026-08-02-judge-protocol-and-authoring-laws-design.md', word: 'arm', text: 'arms the monitor', why: 'the verb: to make live' },
  { path: 'BACKLOG.md', why: 'the row that tracks the repos still to rename, and the senses that survive in them' },
  { path: 'docs/superpowers/specs/2026-08-06-plain-names-design.md', why: 'the only spec that names both vocabularies; deleted by the final task' },
  { path: 'docs/superpowers/plans/2026-08-06-plain-names.md', why: 'the plan that carries out the rename; deleted by the final task' },
  { path: 'docs/superpowers/specs/2026-08-06-guard-priority-design.md', word: 'ledger', why: 'the row that names the rename work still owed in the subject repos' },
  { path: 'docs/superpowers/plans/2026-08-06-guard-priority.md', word: 'ledger', why: 'the task that names the rename work still owed in the subject repos' },
  { path: 'docs/superpowers/specs/2026-08-06-worst-world-design.md', word: 'preview', why: 'the English noun: what a simulation shows the user before the act' },
  { path: 'docs/superpowers/specs/2026-08-09-consent-licence-design.md', word: 'probe', why: 'the instrument it names: `subjects/atlas/test/claim-probe.mts`, an onReply guard that logs and denies nothing' },
  { path: 'docs/superpowers/specs/2026-08-09-consent-licence-design.md', word: 'preview', text: 'gemini-3.1-pro-preview', why: 'a third-party model id' },
  { path: 'docs/superpowers/specs/2026-08-10-consent-licence-implementation.md', word: 'preview', text: 'gemini-3.1-pro-preview', why: 'a third-party model id' },
  { path: 'packages/next/core/test/lint/name-gate.test.ts', word: 'probe', text: "'probe'", why: 'the rename register bans the retired identifier by listing it' },
  { path: 'packages/next/core/test/lint/name-gate.test.ts', word: 'preview', text: "'preview'", why: 'the rename register bans the retired identifier by listing it' },
  { path: 'docs/superpowers/specs/2026-08-18-to-be-phase-2-build-design.md', word: 'preview', text: "'preview'", why: 'the design quotes the banned token it retires' },
  { path: 'docs/superpowers/plans/2026-08-18-to-be-phase-2-build.md', word: 'preview', text: "'preview'", why: 'the plan quotes the banned token it retires' },
];

const SKIP_EXT = /\.(png|jpg|jpeg|gif|svg|ico|gguf|zip|woff2?|tsv|csv)$/i;

// A lockfile is written by the package manager and names CPU architectures — `arm64`, `linux-arm`.
// That is a fourth sense of the word, owned by hardware, and nobody reads a lockfile for vocabulary.
const GENERATED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/;

// Vendored third-party source carries its authors' vocabulary, not ours, and rewriting it would
// make every diff against upstream a conflict.
const VENDOR = /(^|\/)vendor\//;

// A record is written on a date and never edited: a result directory, a JSON-lines stream of
// recorded turns, or a CHANGELOG entry. Rewriting one makes it disagree with what it recorded — a
// v0.7.0 entry describing an `assembledPrompt` names an API that release did not have. A changelog
// is also the ONE place a breaking rename must name both vocabularies, because a consumer with no
// `TurnLedger → TurnActionHistory` line has no migration to follow.
const FROZEN = /(^|\/)benchmarks\/.*\/results\/|\.jsonl$|(^|\/)CHANGELOG\.md$/;
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    yield* walk(join(path, entry));
  }
}

// A phrase where a retired word is ordinary English or names something else entirely. It allows its
// word wherever it appears, because the thing it names is one thing across every repo.
const PHRASES = [
  { word: 'probe', text: 'margin-probe' },
  { word: 'probe', text: 'margin probe' },
  { word: 'probe', text: 'probes-within-probes' },
  // An out-of-band channel is one outside the normal route — ordinary English, not a score range.
  { word: 'band', text: 'out-of-band' },
];

function allowed(rel, word, text) {
  if (PHRASES.some((i) => i.word === word && text.includes(i.text))) return true;
  return ALLOW.some(
    (a) =>
      (rel === a.path || rel.startsWith(a.path)) &&
      (a.word === undefined || a.word === word) &&
      (a.text === undefined || text.includes(a.text)),
  );
}

const words = ONLY ?? Object.keys(NAMES);
for (const w of words) {
  if (!NAMES[w]) {
    console.error(`plain-names: unknown word "${w}" — pick from ${Object.keys(NAMES).join(', ')}`);
    process.exit(2);
  }
}

// SELF-TEST: a lint that cannot fail is no law.
const fires = (w, s) => NAMES[w].test(s);
const MUST_FIRE = [
  // the bare word, in prose
  ['arm', 'the governed arm'], ['band', 'the cert band'], ['ledger', 'two ledgers'],
  ['preview', 'previewing it'], ['trunk', 'the trunk-static law'], ['probe', 'a probed write'],
  // inside a camelCase identifier, where there is no word boundary
  ['challenge', 'issueChallengeForVeto'], ['ledger', 'TurnLedger'], ['ledger', 'createLedger'],
  ['trunk', 'foldTrunk'], ['band', 'CertBand'], ['arm', 'armTotals'], ['band', 'bandJson'],
  ['preview', 'previewOf'],
];
const MUST_NOT_FIRE = [
  ['arm', 'the layer is disarmed'], ['arm', 'a warm cache'], ['arm', 'no harm done'],
  ['arm', 'ARMED_SEAMS'], ['arm', 'the armed-seam law'], ['arm', 'arming the seam'],
  ['band', 'surprise bandwidth'], ['band', 'abandon the run'],
  ['preview', 'a clean sentence'], ['ledger', 'the history of messages'],
];
if (
  MUST_FIRE.some(([w, s]) => !fires(w, s)) ||
  MUST_NOT_FIRE.some(([w, s]) => fires(w, s))
) {
  console.error('plain-names SELF-TEST failed — the gate regex is broken');
  process.exit(2);
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel === SELF || SKIP_EXT.test(rel) || FROZEN.test(rel) || GENERATED.test(rel) || VENDOR.test(rel)) continue;
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split('\n');
  } catch {
    continue;
  }
  lines.forEach((text, i) => {
    for (const w of words) {
      const m = text.match(NAMES[w]);
      if (m && !allowed(rel, w, text)) hits.push(`${rel}:${i + 1}  [${w}:${m[0]}]  ${text.trim().slice(0, 120)}`);
    }
  });
}

if (hits.length) {
  console.error(hits.join('\n'));
  console.error(`\nplain-names: ${hits.length} occurrence(s) of a retired name in ${ROOT}`);
  process.exit(1);
}
console.log(`plain-names: clean (${words.join(', ')}) in ${ROOT}`);
