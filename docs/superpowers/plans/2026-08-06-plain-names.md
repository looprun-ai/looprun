# Plain Names Implementation Plan

> **Status:** shipped in v0.13.0. Tasks 1–9 ran; `looprun`, `agentspec` and `agentspec-bench` are
> clean. Task 10 is out of scope: `accounting`, `lawfirm`, `homeservices` and `looprun.ai` keep their
> vocabulary, and the spec and this plan stay in the tree.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire seven internal names — `ledger`, `probe`, `preview`, `trunk`, `challenge`, `arm`, `band` — from every file a person reads, across eight repos, leaving no alias and no file that says what a name used to be.

**Architecture:** A gate script goes in first and fails loudly; each rename task then drives one concept's hits to zero and is verified by the gate plus the full test suite. The gate takes `--only <words>` so a task proves its own slice, and `--root <path>` so the same script gates the seven other repos. The last task deletes the gate's allowlist along with the two files that had to name both vocabularies.

**Tech Stack:** Node 20+ ESM, pnpm workspaces, vitest, TypeScript, `git mv` for file renames.

## Global Constraints

- **No compatibility alias.** The old name is deleted, not deprecated. No re-export, no type alias, no shim.
- **No name is explained by what it replaced.** No comment, doc, changelog entry or commit body says "formerly the ledger" or "renamed from probe".
- **Everything written is English.** Code, comments, docs, commit messages, string literals.
- **One squashed commit per repo on `main`.** Work on branch `plain-names`; the per-task commits below are branch commits. A reader on `main` never meets two vocabularies in one file.
- **Only benchmark result files keep the old words.** Any path matching `**/benchmarks/**/results/**` is excluded from the gate and is not edited. Nothing else is excluded.
- **The seven targets, verbatim:** `ledger`→`actionHistory`, `probe`→`simulate`, `preview`→`simulationResult`, `trunk`→`assembledPrompt`, `challenge`→`approvalRequest`, `arm`→`variant`, `band`→`range`.
- **`spec.surface.systemPrompt` keeps its name.** It is an author-supplied block, not the assembly.
- **`ARMED_SEAMS`, `armed`, `arming`, `disarmed`, `warm`, `harm`, `alarm`, `bandwidth`, `abandon` are ordinary English and are not touched.**

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `tests/plain-names.test.mjs` | The gate. Walks a tree, reports every surviving occurrence with file:line, self-tests its own regexes, exits non-zero on any hit. Sibling of `tests/no-bench-drift.test.mjs` and follows its shape. |

**Renamed (git mv, contents rewritten)**

```
packages/core/src/trunk.ts                          →  assembled-prompt.ts
packages/core/src/trunk-fold.ts                     →  prompt-fold.ts
packages/core/src/runtime/ledger.ts                 →  action-history.ts
packages/core/src/runtime/challenge.ts              →  approval-request.ts
packages/core/test/challenge.test.ts                →  approval-request.test.ts
packages/core/test/challenge-render.test.ts         →  approval-render.test.ts
packages/core/test/challenge-ledger.test.ts         →  approval-action-history.test.ts
packages/core/test/claims-ledger.test.ts            →  claims-action-history.test.ts
packages/core/test/trunk-stability.test.ts          →  prompt-stability.test.ts
packages/core/test/proofs/trunk-provenance.test.ts  →  prompt-provenance.test.ts
(packages/eval/probes/ is NOT renamed — see Task 4 Step 2)
governance/proofs/2026-07-29-trunk-fold-coherence-cut.md
                            →  2026-07-29-prompt-fold-coherence-cut.md
docs/superpowers/plans/2026-08-05-consent-by-challenge.md
                            →  2026-08-05-consent-by-approval.md
docs/superpowers/plans/2026-07-31-prose-only-ungoverned-arm.md
                            →  2026-07-31-prose-only-ungoverned-variant.md
docs/superpowers/specs/2026-08-05-consent-by-challenge-design.md
                            →  2026-08-05-consent-by-approval-design.md
docs/superpowers/specs/2026-07-31-prose-only-ungoverned-arm-design.md
                            →  2026-07-31-prose-only-ungoverned-variant-design.md
```

**Deleted by the final task**

```
docs/superpowers/specs/2026-08-06-plain-names-design.md
docs/superpowers/plans/2026-08-06-plain-names.md          ← this file
```

**Modified** — every file the gate reports. Volume in `looprun`:

```
word         .ts     .md   .mjs/.json
ledger      1253     258         3
trunk        227     155         1
arm          232     114         6
probe        223      86        14
challenge    117     194         0
band          67      35         7
preview       60      54         1
```

## The two lanes every rename task runs

A blind substitution is wrong in one direction and only one: **code wants camelCase, prose wants spaced words.**

```
CODE LANE   *.ts *.mjs *.json      \bledger\b  →  actionHistory
PROSE LANE  *.md outside fences    \bledger\b  →  action history
            *.md inside ``` fences →  camelCase, same as the code lane
```

`sed` cannot see a fence boundary. So each task runs the code lane scripted, then works the prose lane from the gate's own `file:line` output, choosing by eye. The gate is what proves the prose lane finished.

---

### Task 1: The gate

**Files:**
- Create: `tests/plain-names.test.mjs`
- Modify: `package.json` (root, `test:laws` script)
- Modify: `docs/superpowers/specs/2026-08-06-plain-names-design.md` (the script's path)

**Interfaces:**
- Consumes: nothing.
- Produces: `node tests/plain-names.test.mjs [--root <path>] [--only <csv>]`. Exit 0 = clean, 1 = hits found (printed as `rel:line  [word]  text`), 2 = self-test broken. Every later task uses it as its pass condition.

- [x] **Step 1: Write the gate with its self-test**

`tests/plain-names.test.mjs`:

```js
#!/usr/bin/env node
/**
 * THE PLAIN-NAMES GATE — seven concepts are named with the words a reader already owns. The
 * retired names may not survive in any file a person reads: source, types, tests, docs, guard text,
 * CLI output, generated subjects, measurement tooling.
 *
 * A benchmark result file is a number taken on a date, not prose anyone reads for vocabulary, so
 * `**\/benchmarks/**\/results/**` is excluded. Nothing else is.
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

// Five stems match any suffix — `ledgers`, `probed`, `previewing`, `trunks`, `challenging` all name
// the retired concept. `arm` and `band` match as bare words only: `armed`, `arming`, `disarmed`,
// `warm`, `harm`, `alarm`, `bandwidth` and `abandon` are ordinary English this gate does not touch.
const NAMES = {
  ledger: /\bledger[a-z]*/i,
  probe: /\bprobe[a-z]*/i,
  preview: /\bpreview[a-z]*/i,
  trunk: /\btrunk[a-z]*/i,
  challenge: /\bchalleng[a-z]*/i,
  arm: /\barms?\b/i,
  band: /\bbands?\b/i,
};

// Each entry protects ONE sense in ONE place: a path (exact file or prefix), the word it allows,
// and why. Allowing `probe` in the instrument's report does not also allow `ledger` there.
const ALLOW = [
  { path: 'docs/benchmarks.md', word: 'preview', text: 'Gemini 3.1 Pro Preview', why: 'a third-party product name' },
  // `probe` also names an OFFLINE MEASURING INSTRUMENT — an experiment run against the engine, not
  // a world answering a question. "The margin simulate" is not a phrase.
  { path: 'packages/eval/probes/', word: 'probe', why: 'the instrument itself' },
  { path: 'packages/eval/package.json', word: 'probe', text: 'probe:lie-check', why: 'the instrument, as a script' },
  { path: 'packages/core/src/runtime/prompt.ts', word: 'probe', text: 'margin probe', why: 'the instrument, in prose' },
  { path: 'packages/mastra/test/prompt-identity.test.ts', word: 'probe', text: 'margin probe', why: 'the same instrument' },
  { path: 'docs/analysis/2026-08-04-lie-check-model-portability.md', word: 'probe', why: "the instrument's own report" },
  { path: 'docs/superpowers/specs/2026-08-06-plain-names-design.md', why: 'the only spec that must name both vocabularies; deleted by the final task' },
  { path: 'docs/superpowers/plans/2026-08-06-plain-names.md', why: 'the plan that carries out the rename; deleted by the final task' },
];

const SKIP_EXT = /\.(png|jpg|jpeg|gif|svg|ico|gguf|zip|lock|woff2?)$/i;
const FROZEN = /(^|\/)benchmarks\/.*\/results\//;
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

function allowed(rel, word, text) {
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
    console.error(`plain-names: unknown word "${w}"`);
    process.exit(2);
  }
}

// SELF-TEST: a lint that cannot fail is no law.
const fires = (w, s) => NAMES[w].test(s);
if (
  !fires('arm', 'the governed arm') || fires('arm', 'the layer is disarmed') ||
  fires('arm', 'a warm cache') || fires('arm', 'ARMED_SEAMS') ||
  !fires('band', 'the cert band') || fires('band', 'surprise bandwidth') ||
  !fires('ledger', 'two ledgers') || !fires('challenge', 'issueChallengeForVeto') ||
  !fires('preview', 'previewing it') || fires('preview', 'a clean sentence')
) {
  console.error('plain-names SELF-TEST failed — the gate regex is broken');
  process.exit(2);
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel === SELF || SKIP_EXT.test(rel) || FROZEN.test(rel)) continue;
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
```

- [x] **Step 2: Run it — the self-test must pass and the gate must fire**

```bash
node tests/plain-names.test.mjs --only band
```

Expected: exit 1, ~35 lines printed, ending `plain-names: 35 occurrence(s) of a retired name`. If it exits 2, the regexes are wrong — fix them before going on.

- [x] **Step 3: Prove the frozen-path exclusion works**

```bash
node tests/plain-names.test.mjs --root ../looprun-bench --only arm | tail -3
node tests/plain-names.test.mjs --root ../looprun-bench --only arm 2>&1 | grep -c '/results/'
```

Expected: the second command prints `0` — no line from a benchmark results directory appears.

- [x] **Step 4: Wire the gate into `test:laws` but not yet into `test`**

In root `package.json`, change:

```json
"test:laws": "pnpm -C packages/core test && node tests/no-bench-drift.test.mjs"
```

to:

```json
"test:laws": "pnpm -C packages/core test && node tests/no-bench-drift.test.mjs && node tests/plain-names.test.mjs"
```

Leave `"test"` untouched — the gate stays red until Task 7, and going red on `pnpm test` for six tasks would hide real regressions.

- [x] **Step 5: Point the spec at the real path**

In `docs/superpowers/specs/2026-08-06-plain-names-design.md`, replace every `scripts/check-plain-names.mjs` with `tests/plain-names.test.mjs` — the repo's home for a repo-wide vocabulary gate, beside `tests/no-bench-drift.test.mjs`. Do the same in the `BACKLOG.md` row.

- [x] **Step 6: Commit**

```bash
git checkout -b plain-names
git add tests/plain-names.test.mjs package.json docs/superpowers/specs/2026-08-06-plain-names-design.md BACKLOG.md
git commit -m "test: a gate names the seven retired words and fires on each one"
```

---

### Task 2: `arm` → `variant`, `band` → `range`

Both are measurement vocabulary, both live in `packages/eval` and the docs that quote it, and renaming one without the other leaves a run summary that says `variant` beside a `cert-band.json`.

**Files:**
- Modify: `packages/eval/src/commands.ts`, `packages/eval/src/cert.ts`, `packages/eval/src/judge-input.ts`, `packages/eval/src/index.ts`, `packages/eval/README.md`
- Modify: `examples/hermes-sim/src/bench-ab.ts`, `docs/tutorial/05-running-and-eval.md`, `docs/tutorial/06-advanced.md`, `docs/tutorial/snippets/05-running-and-eval.ts`
- Rename: `docs/superpowers/plans/2026-07-31-prose-only-ungoverned-arm.md`, `docs/superpowers/specs/2026-07-31-prose-only-ungoverned-arm-design.md`
- The gate's full list: `node tests/plain-names.test.mjs --only arm,band`

**Interfaces:**
- Consumes: the gate from Task 1.
- Produces: `CertRange`, `CertRangeOptions`, `buildCertRange(...)`, `renderCertRangeMd(...)` exported from `@looprun-ai/eval`; the run-summary field `variant: 'governed' | 'ungoverned'`; the artefacts `cert-range.json` and `CERT-RANGE.md`.

- [x] **Step 1: See the whole surface**

```bash
node tests/plain-names.test.mjs --only arm,band > /tmp/arm-band.txt; wc -l /tmp/arm-band.txt
```

Expected: ~149 lines. Keep the file open — it is the checklist for Step 4.

- [x] **Step 2: Rename the two dated records**

```bash
git mv docs/superpowers/plans/2026-07-31-prose-only-ungoverned-arm.md \
       docs/superpowers/plans/2026-07-31-prose-only-ungoverned-variant.md
git mv docs/superpowers/specs/2026-07-31-prose-only-ungoverned-arm-design.md \
       docs/superpowers/specs/2026-07-31-prose-only-ungoverned-variant-design.md
```

- [x] **Step 3: Run the code lane — most-specific patterns first**

Order matters: `CertBand` has no word boundary before `Band`, so it must be replaced before the bare-word rule runs.

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/CertBandOptions/CertRangeOptions/g' \
  -e 's/renderCertBandMd/renderCertRangeMd/g' \
  -e 's/buildCertBand/buildCertRange/g' \
  -e 's/CertBand/CertRange/g' \
  -e 's/cert-band\.json/cert-range.json/g' \
  -e 's/CERT-BAND\.md/CERT-RANGE.md/g' \
  -e 's/bandJson/rangeJson/g' \
  -e 's/armTotals/variantTotals/g' \
  -e 's/armDeps/variantDeps/g' \
  -e 's/\barms\b/variants/g' -e 's/\barm\b/variant/g' \
  -e 's/\bArms\b/Variants/g' -e 's/\bArm\b/Variant/g' \
  -e 's/\bbands\b/ranges/g' -e 's/\bband\b/range/g' \
  -e 's/\bBands\b/Ranges/g' -e 's/\bBand\b/Range/g' \
  $FILES
```

- [x] **Step 4: Work the prose lane from the gate's output**

```bash
node tests/plain-names.test.mjs --only arm,band
```

Every remaining line is in a `.md`. For each one: inside a ``` fence, use the code form (`variant`, `CertRange`); in a sentence, use the spaced English (`the governed variant`, `the certification range`). Two sentences need rewriting rather than substituting, because the pun dies:

```
BEFORE  docs/tutorial/05-running-and-eval.md
        The ungoverned control arm: the same prompt with the enforcement layer disarmed.
AFTER   The ungoverned control variant: the same prompt with the enforcement layer disarmed.

BEFORE  docs/tutorial/06-advanced.md
        keep N distinct agent trunks warm across agent switches
AFTER   unchanged — `warm` is ordinary English and the gate does not report it
```

- [x] **Step 5: Regenerate the guards chapter, then verify**

```bash
node scripts/gen-guards-chapter.mjs
pnpm typecheck && pnpm test
node tests/plain-names.test.mjs --only arm,band
```

Expected: typecheck clean, all suites pass, gate prints `plain-names: clean (arm, band)`.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: one side of a comparison is a variant, its spread is a range"
```

---

### Task 3: `challenge` → `approvalRequest`

**Files:**
- Rename: `packages/core/src/runtime/challenge.ts` → `approval-request.ts`
- Rename: `packages/core/test/challenge.test.ts` → `approval-request.test.ts`
- Rename: `packages/core/test/challenge-render.test.ts` → `approval-render.test.ts`
- Rename: `packages/core/test/challenge-ledger.test.ts` → `approval-action-history.test.ts`
- Rename: `docs/superpowers/plans/2026-08-05-consent-by-challenge.md` → `2026-08-05-consent-by-approval.md`
- Rename: `docs/superpowers/specs/2026-08-05-consent-by-challenge-design.md` → `2026-08-05-consent-by-approval-design.md`
- Modify: `packages/core/src/runtime/ledger.ts`, `packages/core/src/runtime/turn.ts`, `packages/core/src/internal.ts`, `packages/core/src/guards/confirmation.ts`, `packages/core/GUARDS.md`, `docs/tutorial/04-guards.md`

**Interfaces:**
- Consumes: the gate from Task 1.
- Produces:

```ts
export interface ApprovalRequest { tool: string; subject?: string; meaning: string; token: string }
export function approvalCode(meaning: string): string
export function approvalMatchesCall(...): boolean
export function consumeApprovals(...): void
export function closeApprovalsFor(open: ApprovalRequest[], subject: string): void
export function issueApprovalForVeto(ledger: TurnLedger, tool: string): void
```

`deriveToken` keeps its name — it carries no retired word. `TurnLedger` and the parameter spelled `ledger` are untouched by this task; Task 6 renames both.

- [x] **Step 1: See the whole surface**

```bash
node tests/plain-names.test.mjs --only challenge > /tmp/challenge.txt; wc -l /tmp/challenge.txt
```

Expected: ~311 lines across 22 files.

- [x] **Step 2: Rename the files**

```bash
git mv packages/core/src/runtime/challenge.ts packages/core/src/runtime/approval-request.ts
git mv packages/core/test/challenge.test.ts packages/core/test/approval-request.test.ts
git mv packages/core/test/challenge-render.test.ts packages/core/test/approval-render.test.ts
git mv packages/core/test/challenge-ledger.test.ts packages/core/test/approval-action-history.test.ts
git mv docs/superpowers/plans/2026-08-05-consent-by-challenge.md \
       docs/superpowers/plans/2026-08-05-consent-by-approval.md
git mv docs/superpowers/specs/2026-08-05-consent-by-challenge-design.md \
       docs/superpowers/specs/2026-08-05-consent-by-approval-design.md
```

- [x] **Step 3: Run the code lane**

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/issueChallengeForVeto/issueApprovalForVeto/g' \
  -e 's/challengeMatchesCall/approvalMatchesCall/g' \
  -e 's/closeChallengesFor/closeApprovalsFor/g' \
  -e 's/consumeChallenges/consumeApprovals/g' \
  -e 's/challengesIssuedThisTurn/approvalsIssuedThisTurn/g' \
  -e 's/challengeToken/approvalCode/g' \
  -e 's/issueChallenge/issueApproval/g' \
  -e "s|runtime/challenge\.js|runtime/approval-request.js|g" \
  -e "s|\./challenge\.js|./approval-request.js|g" \
  -e 's/\bChallenges\b/ApprovalRequests/g' -e 's/\bChallenge\b/ApprovalRequest/g' \
  -e 's/\bchallenges\b/approvals/g' -e 's/\bchallenge\b/approval/g' \
  $FILES
```

- [x] **Step 4: Work the prose lane**

```bash
node tests/plain-names.test.mjs --only challenge
```

194 of the hits are `.md`. In prose the concept is **an approval request**; the code it carries is **an approval code**. One line in `docs/tutorial/04-guards.md` needs rewriting rather than substituting:

```
BEFORE  the engine issues a confirmation token naming the record
AFTER   the engine opens an approval request naming the record, carrying the code that answers it
```

- [x] **Step 5: Regenerate and verify**

```bash
node scripts/gen-guards-chapter.mjs
pnpm typecheck && pnpm test && pnpm test:proofs
node tests/plain-names.test.mjs --only challenge
```

Expected: typecheck clean, all suites pass, gate prints `plain-names: clean (challenge)`.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: the runtime opens an approval request carrying the code that answers it"
```

---

### Task 4: `probe` → `simulate`, `preview` → `simulationResult`

One flow, one pair of names: the helper that asks without acting, and the field its answer carries. Renaming either alone leaves `probe()` returning a `simulationResult`.

**Files:**
- Modify: `packages/core/src/world/define-world.ts`, `packages/core/src/world/types.ts`, `packages/core/src/spec.ts`, `packages/core/src/runtime/claims.ts`, `packages/core/src/runtime/turn.ts`, `packages/core/src/runtime/prompt.ts`, `packages/core/src/runtime/ledger.ts`, `packages/core/src/trunk.ts`
- Modify: `packages/core/test/redteam/batch-c.test.ts:114`, `packages/mastra/test/proofs/guard-audit.test.ts:183`
- Not renamed: `packages/eval/probes/` — the measuring instrument keeps the word
- Modify: `docs/tutorial/04-guards.md`, `docs/tutorial/05-running-and-eval.md`, `packages/core/GUARDS.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: the gate from Task 1.
- Produces: the world helper `simulate()`; the world-result key `simulationResult`; `simulationResultOf(create, received)` in `define-world.ts`; the audit union member `outcome: 'simulated'`. The script `probe:lie-check` and the directory `packages/eval/probes/` keep their name.

- [x] **Step 1: See the whole surface**

```bash
node tests/plain-names.test.mjs --only probe,preview > /tmp/sim.txt; wc -l /tmp/sim.txt
```

Expected: ~438 lines.

- [x] **Step 2: Leave the measuring instrument alone**

`packages/eval/probes/`, the script `probe:lie-check`, "the margin probe" in
`packages/core/src/runtime/prompt.ts:9` and `packages/mastra/test/prompt-identity.test.ts`, and the
whole of `docs/analysis/2026-08-04-lie-check-model-portability.md` name an **offline measuring
instrument** — an experiment someone runs against the engine, not a world answering a question:

```
①  probe()                    the world helper           →  simulate()
②  "(a probe)"                a write with no effect     →  "(a simulation)"
③  the margin probe           AN INSTRUMENT              →  stays `probe`
    packages/eval/probes/
```

*The margin simulate* is not a phrase. Do not `git mv` that directory and do not rename that script.
The gate's `ALLOW` already carries all five paths with `word: 'probe'`, so they report clean while
every other `probe` still fails.

- [x] **Step 3: Run the code lane**

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/previewOf/simulationResultOf/g' \
  -e "s/outcome: 'preview'/outcome: 'simulated'/g" \
  -e "s/'ok' | 'denied' | 'preview'/'ok' | 'denied' | 'simulated'/g" \
  -e 's/probeWrite/simulateWrite/g' \
  -e 's/\bpreviews\b/simulationResults/g' -e 's/\bpreview\b/simulationResult/g' \
  -e 's/\bPreview\b/SimulationResult/g' \
  -e 's/\bprobed\b/simulated/g' -e 's/\bprobe\b/simulate/g' \
  -e 's/\bProbe\b/Simulate/g' \
  $FILES
```

The union member is written on one line in `packages/core/src/world/types.ts:166`; if the second `-e` misses it because of spacing, fix it by hand:

```ts
outcome: 'ok' | 'denied' | 'simulated' | 'unknown-tool' | 'custom';
```

- [x] **Step 4: Fix the two fixture maps by hand**

`packages/core/test/redteam/batch-c.test.ts:114` and `packages/mastra/test/proofs/guard-audit.test.ts:183` both read `jargonScrub({ '(beta)': 'preview' })`. The map is arbitrary test data; the word goes:

```ts
jargonScrub({ '(beta)': 'early access' })
```

Check the assertion below each call — if it asserts on the output string `preview`, change it to `early access` too.

- [x] **Step 5: Work the prose lane, including the ritual's name**

```bash
node tests/plain-names.test.mjs --only probe,preview
```

The ritual gets one name end to end: **simulate first, then act.**

```
BEFORE  docs/tutorial/05-running-and-eval.md:214
        A tool named in `destructiveTools` is promised a two-step ritual: preview first —
        which is what makes the second call meaningful
AFTER   A tool named in `destructiveTools` is promised a two-step ritual: simulate first —
        which is what makes the second call meaningful

BEFORE  docs/tutorial/04-guards.md:357
        ②  or the denial does — a tool with no preview form is denied, and the denial raises
           the question
AFTER   ②  or the denial does — a tool with no simulate form is denied, and the denial raises
           the question

BEFORE  packages/core/src/runtime/ledger.ts:144
        A destructive tool with no preview form was DENIED.
AFTER   A destructive tool with no simulate form was DENIED.
```

`docs/benchmarks.md:68` reads `Gemini 3.1 Pro Preview`. Leave it — the gate allowlists that line as a third-party product name.

- [x] **Step 6: Regenerate and verify**

```bash
node scripts/gen-guards-chapter.mjs
pnpm typecheck && pnpm test && pnpm test:proofs
node tests/plain-names.test.mjs --only probe,preview
```

Expected: typecheck clean, all suites pass, gate prints `plain-names: clean (probe, preview)`.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: a world simulates an act and its answer carries the simulation result"
```

---

### Task 5: `trunk` → `assembledPrompt`

**Files:**
- Rename: `packages/core/src/trunk.ts` → `assembled-prompt.ts`
- Rename: `packages/core/src/trunk-fold.ts` → `prompt-fold.ts`
- Rename: `packages/core/test/trunk-stability.test.ts` → `prompt-stability.test.ts`
- Rename: `packages/core/test/proofs/trunk-provenance.test.ts` → `prompt-provenance.test.ts`
- Rename: `governance/proofs/2026-07-29-trunk-fold-coherence-cut.md` → `2026-07-29-prompt-fold-coherence-cut.md`
- Modify: `packages/core/src/index.ts`, `packages/core/src/internal.ts`, `packages/core/src/spec.ts`, `packages/core/src/runtime/turn.ts`, `packages/mastra/src/agent.ts`, `packages/mastra/src/agent-construction.ts`, `docs/tutorial/03-agent-anatomy.md`, `docs/tutorial/06-advanced.md`, `governance/MATRIX.md`

**Interfaces:**
- Consumes: the gate from Task 1.
- Produces:

```ts
export function renderAssembledPrompt(world, spec, uploads?, domain?): string
export function renderPromptBlocks(spec: AgentSpec, d: DomainContract): PromptBlock[]
export function foldPrompt(blocks: PromptBlock[]): string
export function checkPromptStatic(...): ...
export interface PromptBlock / PromptRow / PromptLine
export type PromptPolarity
export interface PromptRenderOptions
```

`spec.surface.systemPrompt` is untouched. `DomainContract` moves with the file to `./assembled-prompt.js` and keeps its name.

- [x] **Step 1: See the whole surface**

```bash
node tests/plain-names.test.mjs --only trunk > /tmp/trunk.txt; wc -l /tmp/trunk.txt
```

Expected: ~383 lines.

- [x] **Step 2: Rename the files**

```bash
git mv packages/core/src/trunk.ts packages/core/src/assembled-prompt.ts
git mv packages/core/src/trunk-fold.ts packages/core/src/prompt-fold.ts
git mv packages/core/test/trunk-stability.test.ts packages/core/test/prompt-stability.test.ts
git mv packages/core/test/proofs/trunk-provenance.test.ts packages/core/test/proofs/prompt-provenance.test.ts
git mv governance/proofs/2026-07-29-trunk-fold-coherence-cut.md \
       governance/proofs/2026-07-29-prompt-fold-coherence-cut.md
```

- [x] **Step 3: Run the code lane**

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/renderScopedSpecTrunk/renderAssembledPrompt/g' \
  -e 's/renderTrunkBlocks/renderPromptBlocks/g' \
  -e 's/TrunkRenderOptions/PromptRenderOptions/g' \
  -e 's/TrunkPolarity/PromptPolarity/g' \
  -e 's/TrunkBlock/PromptBlock/g' \
  -e 's/TrunkLine/PromptLine/g' \
  -e 's/TrunkRow/PromptRow/g' \
  -e 's/checkTrunkStatic/checkPromptStatic/g' \
  -e 's/foldTrunk/foldPrompt/g' \
  -e "s|\./trunk-fold\.js|./prompt-fold.js|g" \
  -e "s|\./trunk\.js|./assembled-prompt.js|g" \
  -e "s|trunk-fold\.ts|prompt-fold.ts|g" \
  -e 's/trunk-static law/shared-prefix law/g' -e 's/trunk-static/shared-prefix/g' \
  -e 's/trunk-warm law/prefix-warm law/g' -e 's/trunk-warm/prefix-warm/g' \
  -e 's/\btrunks\b/assembledPrompts/g' -e 's/\btrunk\b/assembledPrompt/g' \
  -e 's/\bTrunk\b/AssembledPrompt/g' \
  $FILES
```

- [x] **Step 4: Work the prose lane**

```bash
node tests/plain-names.test.mjs --only trunk
```

155 hits are `.md`. In prose the thing is **the assembled prompt**.

**Two laws take a name of their own, not a substitution.** `trunk` is a tree — one shared stem, one branch per agent — and the law was named after the stem. Substituting the word inverts what the law says, because the assembled prompt is the per-agent *whole* while the trunk was the shared *part*:

```
trunk-static law   →   shared-prefix law    the domain's agents share a maximal static prefix
trunk-warm law     →   prefix-warm law      N distinct prefixes stay cached across agent switches
```

`trunk-static` appears 18 times in 12 files, including `packages/core/GUARDS.md` and the three generated `contract.ts` files under `examples/hermes-sim/src/domains/`. `trunk-warm` appears once, in `packages/models/src/llamacpp.ts:4`. `armed-seam law` keeps its name — `armed` is ordinary English. The file docstrings in `assembled-prompt.ts` and `prompt-fold.ts` carry most of the source-side prose — read them whole rather than substituting, because sentences like *"the domain's agents share a maximal static trunk prefix"* become *"the domain's agents share a maximal static prompt prefix"* and must still parse.

- [x] **Step 5: Regenerate and verify**

```bash
node scripts/gen-guards-chapter.mjs
pnpm build && pnpm typecheck && pnpm test && pnpm test:proofs
node tests/plain-names.test.mjs --only trunk
```

`pnpm build` is added here because two source files moved and the `.d.ts` surface changes with them. Expected: build clean, typecheck clean, all suites pass, gate prints `plain-names: clean (trunk)`.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: the prompt an agent reads is assembled, and the fold renders its table"
```

---

### Task 6: `ledger` → `actionHistory`

The largest slice: 1,253 `.ts` hits and 258 `.md`. It goes last inside `looprun` because every earlier task's diff touches `ledger.ts` and doing this first would force each of them to re-resolve.

**Files:**
- Rename: `packages/core/src/runtime/ledger.ts` → `action-history.ts`
- Rename: `packages/core/test/claims-ledger.test.ts` → `claims-action-history.test.ts`
- Modify: `packages/core/src/internal.ts`, `packages/core/src/runtime/turn.ts`, `packages/core/src/runtime/claims.ts`, `packages/core/src/runtime/terminal.ts`, `packages/core/src/guards/*.ts`, `packages/mastra/src/*.ts`, every file under `packages/core/test/`, `packages/core/GUARDS.md`, `docs/tutorial/*.md`

**Interfaces:**
- Consumes: the gate from Task 1; the names produced by Tasks 2–5.
- Produces:

```ts
export interface TurnActionHistory { ...; approvals: ApprovalRequest[]; approvalsIssuedThisTurn: number }
export function createActionHistory(judge?, judgeTimeoutMs?, renderOpts?): TurnActionHistory
export function deriveClaimsFromActionHistory(observed, turnIndex, writeTools): RenderedClaim[]
```

Every function in `action-history.ts` that took `ledger: TurnLedger` now takes `actionHistory: TurnActionHistory` — `beginTurn`, `vetoStormHit`, `recordVeto`, `recordToolResult`, `recordTerminalCall`, `recordTerminal`, `recordTurnHistory`, `clearDeliveredTerminal`, `pruneSupersededTerminals`, `issueApprovalForVeto`, `issueApproval`.

- [x] **Step 1: See the whole surface**

```bash
node tests/plain-names.test.mjs --only ledger > /tmp/ledger.txt; wc -l /tmp/ledger.txt
```

Expected: ~1,514 lines across 155 files.

- [x] **Step 2: Rename the files**

```bash
git mv packages/core/src/runtime/ledger.ts packages/core/src/runtime/action-history.ts
git mv packages/core/test/claims-ledger.test.ts packages/core/test/claims-action-history.test.ts
```

- [x] **Step 3: Run the code lane**

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/deriveClaimsFromLedger/deriveClaimsFromActionHistory/g' \
  -e 's/createLedger/createActionHistory/g' \
  -e 's/TurnLedger/TurnActionHistory/g' \
  -e 's/ledgerCall/actionHistoryCall/g' \
  -e 's/ledgerRecord/actionHistoryRecord/g' \
  -e 's/ledgerText/actionHistoryText/g' \
  -e "s|runtime/ledger\.js|runtime/action-history.js|g" \
  -e "s|\./ledger\.js|./action-history.js|g" \
  -e 's/\bledgers\b/actionHistories/g' -e 's/\bledger\b/actionHistory/g' \
  -e 's/\bLedger\b/ActionHistory/g' \
  $FILES
```

- [x] **Step 4: Work the prose lane**

```bash
node tests/plain-names.test.mjs --only ledger
```

In prose the thing is **the action history**. The distinction it exists to hold is worth stating where the docs introduce it, because `GuardCtx.history` sits right beside it:

```
history         the prior turns' MESSAGES
actionHistory   what was DONE this conversation
```

- [x] **Step 5: Regenerate and verify**

```bash
node scripts/gen-guards-chapter.mjs
pnpm build && pnpm typecheck && pnpm test && pnpm test:proofs
node tests/plain-names.test.mjs --only ledger
```

Expected: build clean, typecheck clean, all suites pass, gate prints `plain-names: clean (ledger)`.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: what was done this conversation is the action history"
```

---

### Task 7: `looprun` goes green

**Files:**
- Modify: `package.json` (root, `test` script)
- Modify: whatever the full gate still reports — `HANDOFF-2026-08-03.md`, `README.md`, `CONTRIBUTING.md`, `.github/**`, `.changeset/**`, `governance/MATRIX.md`, remaining `docs/analysis/**` and `docs/superpowers/**`
- Create: `.changeset/plain-names.md`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: `pnpm test` in `looprun` runs the gate; `@looprun-ai/core` and `@looprun-ai/eval` ship the new public surface with a major-version changeset.

- [x] **Step 1: Run the gate with no `--only`**

```bash
node tests/plain-names.test.mjs
```

Every remaining hit is a file none of Tasks 2–6 walked: root docs, CI config, changesets, the governance matrix. Fix each one, choosing code form inside fences and spaced English in sentences.

- [x] **Step 2: Confirm the two allowlisted files are the only ones left**

```bash
node tests/plain-names.test.mjs && echo GREEN
grep -c 'ledger\|probe\|preview\|trunk\|challenge' docs/superpowers/specs/2026-08-06-plain-names-design.md
```

Expected: `GREEN`, and the second command prints a non-zero count — the spec still names both vocabularies, which is why it is allowlisted and why Task 10 deletes it.

- [x] **Step 3: Wire the gate into `pnpm test`**

In root `package.json`:

```json
"test": "pnpm -r --if-present test && node scripts/gen-guards-chapter.mjs --check"
```

becomes

```json
"test": "pnpm -r --if-present test && node scripts/gen-guards-chapter.mjs --check && node tests/plain-names.test.mjs"
```

- [x] **Step 4: Write the changeset**

`.changeset/plain-names.md` — state the new vocabulary and the breaking surface; do not narrate the change.

```markdown
---
'@looprun-ai/core': major
'@looprun-ai/eval': major
---

Seven concepts carry the plain word for what they are.

`actionHistory` is what was done this conversation. `simulate` asks a world what would happen and
`simulationResult` is what that answer carries. `assembledPrompt` is the prompt an agent reads.
`approvalRequest` is the request the runtime opens for one act on one record, carrying the code
that answers it. A `variant` is one side of a comparison and a `range` is the spread across
repetitions.

Breaking, `@looprun-ai/core`: `TurnLedger` → `TurnActionHistory`, `createLedger` →
`createActionHistory`, `deriveClaimsFromLedger` → `deriveClaimsFromActionHistory`, `Challenge` →
`ApprovalRequest`, `challengeToken` → `approvalCode`, `challengeMatchesCall` →
`approvalMatchesCall`, `issueChallengeForVeto` → `issueApprovalForVeto`,
`closeChallengesFor` → `closeApprovalsFor`, `consumeChallenges` → `consumeApprovals`,
`renderScopedSpecTrunk` → `renderAssembledPrompt`.

Breaking, `@looprun-ai/eval`: `CertBand` → `CertRange`, `CertBandOptions` → `CertRangeOptions`,
`buildCertBand` → `buildCertRange`, `renderCertBandMd` → `renderCertRangeMd`. The artefacts
`cert-band.json` and `CERT-BAND.md` are now `cert-range.json` and `CERT-RANGE.md`.

Breaking, world authors: the helper `probe()` is `simulate()`, the world-result key `preview` is
`simulationResult`, and the audit outcome `'preview'` is `'simulated'`.
```

- [x] **Step 5: Full verification**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm test:proofs && pnpm test:laws
```

Expected: every command exits 0.

- [x] **Step 6: Commit and squash-merge**

```bash
git add -A
git commit -m "chore: the plain-names gate runs on every test"
git checkout main && git merge --squash plain-names
git commit -m "refactor!: seven concepts carry the plain word for what they are"
git branch -D plain-names
```

---

### Task 8: `agentspec`

**Files:** `../agentspec/skill/references/*.md`, `../agentspec/skill/references/spec-template.ts`, `../agentspec/skill/scripts/lint-authoring.mjs`, `../agentspec/skill/SKILL.md`

**Interfaces:**
- Consumes: the gate from Task 1, run with `--root ../agentspec`.
- Produces: skill references that teach the new vocabulary to every future generated subject, and lint rule names/messages that match it.

- [x] **Step 1: Branch and survey**

```bash
cd ../agentspec && git checkout -b plain-names
node ../looprun/tests/plain-names.test.mjs --root . > /tmp/agentspec.txt; wc -l /tmp/agentspec.txt
```

Expected: ~285 lines.

- [x] **Step 2: Run the code lane**

```bash
FILES=$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)
sed -i '' \
  -e 's/renderScopedSpecTrunk/renderAssembledPrompt/g' -e 's/TrunkBlock/PromptBlock/g' \
  -e 's/deriveClaimsFromLedger/deriveClaimsFromActionHistory/g' -e 's/createLedger/createActionHistory/g' \
  -e 's/TurnLedger/TurnActionHistory/g' -e 's/challengeToken/approvalCode/g' \
  -e 's/\bChallenge\b/ApprovalRequest/g' -e 's/\bchallenge\b/approval/g' \
  -e 's/previewOf/simulationResultOf/g' -e 's/\bpreview\b/simulationResult/g' \
  -e 's/\bprobe\b/simulate/g' -e 's/\bledger\b/actionHistory/g' \
  -e 's/\btrunk\b/assembledPrompt/g' -e 's/\barm\b/variant/g' -e 's/\bband\b/range/g' \
  $FILES
```

- [x] **Step 3: Work the prose lane and the lint rules**

```bash
node ../looprun/tests/plain-names.test.mjs --root .
```

`skill/scripts/lint-authoring.mjs` carries rule names and user-facing messages. A rule named after a retired word gets renamed with it, and the message it prints must read as a sentence a spec author understands.

- [x] **Step 4: Verify**

```bash
node skill/scripts/lint-authoring.mjs
node ../looprun/tests/plain-names.test.mjs --root .
```

Expected: the linter's own suite passes and the gate prints `plain-names: clean`.

- [x] **Step 5: Commit and squash-merge**

```bash
git add -A && git commit -m "refactor: the skill teaches the plain names"
git checkout main && git merge --squash plain-names
git commit -m "refactor!: seven concepts carry the plain word for what they are"
git branch -D plain-names
```

---

### Task 9: `agentspec-bench` and `looprun-bench`

**Files:** live source, subjects and tooling in both bench repos. `looprun-bench/benchmarks/**/results/**` is not edited and the gate does not read it.

**Interfaces:**
- Consumes: the gate from Task 1.
- Produces: bench subjects whose world helper is `simulate()` and whose result key is `simulationResult`; run tooling that labels a `variant` and a `range`.

- [x] **Step 1: Survey both, confirming the frozen split**

```bash
cd ../agentspec-bench && node ../looprun/tests/plain-names.test.mjs --root . | tail -1
cd ../looprun-bench   && node ../looprun/tests/plain-names.test.mjs --root . | tail -1
cd ../looprun-bench   && node ../looprun/tests/plain-names.test.mjs --root . 2>&1 | grep -c '/results/'
```

Expected: roughly 657 and 1,174 occurrences, and `0` lines from a results directory.

- [x] **Step 2: Check whether the subjects are generated**

```bash
cd ../agentspec-bench && ls -d */subject* benchmarks/*/subject 2>/dev/null
grep -rln "generated" --include='*.ts' . | grep -v node_modules | head
```

A subject that is generated from the `agentspec` skill is regenerated with Task 8's references rather than swept. A subject that is hand-written is swept with the same two lanes as Task 8. Decide per subject and record which is which in the commit body.

- [x] **Step 3: Sweep or regenerate, one repo at a time**

Use the identical `sed` block from Task 8 Step 2 over `$(git ls-files '*.ts' '*.mjs' '*.json' | grep -v node_modules)`, then work the prose lane from the gate output.

- [x] **Step 4: Verify each repo**

```bash
pnpm typecheck 2>/dev/null; pnpm test 2>/dev/null
node ../looprun/tests/plain-names.test.mjs --root .
```

Expected: whatever suites the repo has pass, and the gate prints `plain-names: clean`.

- [x] **Step 5: Commit each repo separately**

```bash
git add -A && git commit -m "refactor!: seven concepts carry the plain word for what they are"
```

---

### Task 10: The four subject repos, then the last two files

**Files:**
- Modify: `../accounting`, `../lawfirm`, `../homeservices`, `../looprun.ai` — 107, 102, 77 and 9 occurrences
- Modify: `looprun/tests/plain-names.test.mjs` (drop two `ALLOW` entries)
- Delete: `looprun/docs/superpowers/specs/2026-08-06-plain-names-design.md`
- Delete: `looprun/docs/superpowers/plans/2026-08-06-plain-names.md`
- Modify: `looprun/BACKLOG.md` (remove the row this plan closes)

**Interfaces:**
- Consumes: every prior task.
- Produces: a tree in which no file names a retired word and the gate carries one allowlist entry — the product name in `docs/benchmarks.md`.

- [x] **Step 1: Sweep the four subject repos**

**A subject repo's world is a business, and a business has its own vocabulary.** The rename retires an *engine* name; a domain's content is not engine vocabulary. `accounting` is where this bites:

```
accounting/WORLD-MODEL.md:7
  Firm (invented, neutral): LedgerLine Accounting. Currency: USD. Locale: English.

blind sed  →  "ActionHistoryLine Accounting"
```

`LedgerLine` is the invented firm's name and `ledger` in a bookkeeping sentence is the book it keeps. Both stay. So these four repos are swept by hand from the gate's output, not scripted:

```bash
cd ../<repo>
node ../looprun/tests/plain-names.test.mjs --root .
```

For each reported line, decide which it is:

| the line says | it is | action |
|---|---|---|
| `createLedger`, `TurnLedger`, `probe()`, the `preview` key | engine vocabulary | rename per the map |
| `LedgerLine Accounting`, a bookkeeping `ledger`, a firm's persona | the business's own words | leave, and add a path+word `ALLOW` entry |

`accounting` carries 107 occurrences, `lawfirm` 102, `homeservices` 77 — most of them engine names in generated specs, which rename normally. `looprun.ai` has nine, seven of them `preview`: a marketing page may use `preview` about the product rather than about the two-step ritual, and that is a legitimate second sense. Read each of the nine before touching any.

Commit each repo once the gate is clean:

```bash
git add -A && git commit -m "refactor!: seven concepts carry the plain word for what they are"
```

- [x] **Step 2: Drop the two transition allowlist entries**

In `looprun/tests/plain-names.test.mjs`, the `ALLOW` array loses both self-naming files and keeps one entry:

```js
const ALLOW = [
  { file: 'docs/benchmarks.md', text: 'Gemini 3.1 Pro Preview', why: 'a third-party product name' },
];
```

- [x] **Step 3: Delete the spec, the plan, and the backlog row**

```bash
cd ../looprun
git rm docs/superpowers/specs/2026-08-06-plain-names-design.md
git rm docs/superpowers/plans/2026-08-06-plain-names.md
```

In `BACKLOG.md`, delete the row beginning `**Seven concepts carry names written for the people who built the engine**`.

- [x] **Step 4: Final verification across every repo**

```bash
cd ../looprun && pnpm build && pnpm typecheck && pnpm test && pnpm test:proofs && pnpm test:laws
for r in agentspec agentspec-bench looprun-bench accounting lawfirm homeservices looprun.ai; do
  node tests/plain-names.test.mjs --root "../$r" | tail -1
done
```

Expected: every `looprun` command exits 0, and each of the seven lines reads `plain-names: clean`.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: the vocabulary stands on its own"
```

---

## Rollback

Every task is one commit on a branch, and the file renames are `git mv`, so `git revert` on a squashed per-repo commit restores that repo whole. No repo depends on another's rename at build time — `@looprun-ai/core` is consumed from npm by the subject repos, so a subject repo pinned to the pre-rename version keeps building until it takes the major bump.
