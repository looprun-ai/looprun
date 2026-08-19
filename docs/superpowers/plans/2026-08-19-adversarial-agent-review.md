# Adversarial Agent Review Implementation Plan

> **STATUS: CLOSED (2026-08-19).** All phases delivered: dossier, fleet,
> mechanical seals, the five ruled arbitrations (recorded in
> `docs/analysis/2026-08-19-self-accusation.md` §The arbitration), and the
> full-70 re-judgment (`2026-08-19-full-r1`: 67/70, zero parity breaks —
> accepted).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The Workflow tool belongs to the session agent — Tasks 2–4 run inline, never in a subagent.

**Goal:** Run the accuse–defend–judge fleet over the current agent (subject + engine + projections), apply its verdicts under the mixed rule, and re-judge the full 70 under the absolute superset bar.

**Architecture:** Phase 0 writes the self-accusation dossier and lands the mechanical fixes first; one Workflow (≤15 agents) runs six artifact accusers, dedupes in plain code, defends and judges accusations in batches, and synthesizes one verdict table; application follows the mixed rule; every re-run is judged.

**Tech Stack:** the Workflow tool (session-side), node scripts already in the scratchpad (`build-judge-input.js`), the eval driver (`RUN_ATLAS` env-gated vitest), git.

## Global Constraints

- The law book L1–L10 and artifact inventory A1–A6 are the spec's, verbatim: `docs/superpowers/specs/2026-08-19-adversarial-agent-review-design.md`.
- An accusation without its convicting quote is dropped at dedupe; a verdict without a quote does not survive synthesis.
- An accusation touching a USER ruling or declarative vocabulary NEVER seals — SHOUT, with the judge's lean recorded.
- Mechanical verdicts apply directly (gates green, committed); the SHOUT list goes to the user as one table before any edit.
- Re-run set: the FULL 70 when any card, world or core edit landed; projection-only edits re-run just the cases they name. Every re-run is judged. Zero baseline passes may be lost.
- Every byte written to a file is English; comments in AS-IS voice; the session agent is the only judge.

---

### Task 1: Phase 0 — the self-accusation dossier and the mechanical fixes

**Files:**
- Create: `docs/analysis/2026-08-19-self-accusation.md`
- Modify (mechanical fixes, as the dossier rules): candidates listed in Step 1
- Test: `pnpm -C packages/next/core gate` after each engine fix; `node --experimental-strip-types agentspec-bench/tools/atlas-next-port/emit.ts` after any bench fix

- [ ] **Step 1: Write the dossier from the seed inventory**

The dossier has two sections, `## Mechanical — fixed before the fleet` and
`## Ammunition — declared for the accusers`, each row `| file:line | quote |
law | why |`. Seed inventory the writer must weigh (add anything else found
while quoting):

- The denial suffix `the declared precondition does not hold` printed after
  every custom precondition sentence (call-runner refuse path) — redundant
  noise the user reads (candidate: mechanical, engine).
- The stale later-tense line (`bk_1001 already held 0 of the 3000 required
  when it was read`) delivered beside a fresh read of the same record in the
  same reply (case 36 T3) — a sentence that contradicts its neighbor
  (candidate: mechanical, engine or tense authoring).
- Fat personas: billing and fleet personas carry three conduct sentences
  each (L2 ammunition).
- `MONEY_ROLES = ['owner', 'billing']` and `FLEET_ROLES = ['owner',
  'admin']` in `cards.ts` duplicate `roleCaps` in `world-kit.ts` (L3
  ammunition; defense will cite the world-mirror pattern).
- The fleet-persona bridge sentence (`A destination named in words — a
  yard, a site, a branch — is another workspace…`) born from case 66 (L1
  ammunition).
- The FLOOR_OWNED projection rows and the 65/66 rubric adjustments in
  `emit.ts` (USER rulings — ammunition; any verdict is SHOUT by the hard
  rule).
- The judging protocol: the session agent judges dumps it produced (L8/L4
  ammunition; the defense cites the no-external-model law).
- Read storms (`getDepositBalance` called four times in one turn) — cost
  and noise, no law broken (ammunition, severity judgment).

- [ ] **Step 2: Apply each mechanical fix with its own gate and commit**

For every row the dossier seals as mechanical: edit, run the gate
(`pnpm -C packages/next/core gate` for engine rows; emit regeneration for
bench rows), commit with an AS-IS message. No fix without a green gate.

- [ ] **Step 3: Commit the dossier**

```bash
git add docs/analysis/2026-08-19-self-accusation.md
git commit -m "docs(analysis): the self-accusation — mechanical rows fixed, the rest declared"
```

### Task 2: The fleet — one Workflow, accuse → defend → judge → synthesize

**Files:**
- None created by hand; the Workflow call persists its own script.

**Interfaces:**
- Consumes: the dossier path from Task 1; the spec's law book and inventory.
- Produces: the final verdict table (workflow return value) with
  `{ verdicts: [{ artifact, fileLine, quote, law, accusation, verdict,
  grounds, lean? }], shouts: [...] }` for Task 3.

- [ ] **Step 1: Launch the Workflow with this script (inline, session-side)**

```js
export const meta = {
  name: 'adversarial-agent-review',
  description: 'Accuse, defend and judge the current agent under the ten laws',
  phases: [
    { title: 'Accuse', detail: 'six artifact accusers' },
    { title: 'Defend', detail: 'defense pairs over accusation batches' },
    { title: 'Synthesize', detail: 'one verdict table' },
  ],
}
const SPEC = '/Users/marcos/Dev/js/looprun/looprun/docs/superpowers/specs/2026-08-19-adversarial-agent-review-design.md'
const DOSSIER = '/Users/marcos/Dev/js/looprun/looprun/docs/analysis/2026-08-19-self-accusation.md'
const OLD = '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas'
const NEW = '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-next'
const CORE = '/Users/marcos/Dev/js/looprun/looprun/packages/next/core/src'
const ACCUSATIONS = { type: 'object', properties: { accusations: { type: 'array',
  items: { type: 'object', properties: {
    artifact: { type: 'string' }, fileLine: { type: 'string' },
    quote: { type: 'string' }, law: { type: 'string' },
    accusation: { type: 'string' },
    severity: { type: 'string', enum: ['mechanical', 'judgment'] } },
    required: ['artifact', 'fileLine', 'quote', 'law', 'accusation', 'severity'] } } },
  required: ['accusations'] }
const RULINGS = { type: 'object', properties: { rulings: { type: 'array',
  items: { type: 'object', properties: {
    fileLine: { type: 'string' },
    verdict: { type: 'string', enum: ['KEEP', 'REVERT', 'RESHAPE', 'SHOUT'] },
    grounds: { type: 'string' }, lean: { type: 'string' } },
    required: ['fileLine', 'verdict', 'grounds'] } } }, required: ['rulings'] }
const TARGETS = [
  { id: 'A1', paths: `${NEW}/cards.ts`, focus: 'personas, prose guards, gates, preconditions, tenses, caps' },
  { id: 'A2', paths: `${NEW}/world.ts and ${NEW}/world-kit.ts against ${OLD}/gen/world.ts`, focus: 'world fidelity, the note vs the old stateBlock law, TARGET_ENTITY, served views' },
  { id: 'A3', paths: `/Users/marcos/Dev/js/looprun/agentspec-bench/tools/atlas-next-port/emit.ts and ${NEW}/MAPPING.md rules 29-33`, focus: 'every projection adjustment' },
  { id: 'A4', paths: `${CORE} (this campaign: facts note, groundedDates, report word merge, cap, result two-phase render, afterOf, read freshness, finish legends, teaching corrections)`, focus: 'engine law soundness and AS-IS comments' },
  { id: 'A5', paths: 'the judging protocol: scratchpad build-judge-input.js and the verdicts.jsonl files under atlas-next/test/2026-08-19-final-r4/rep1', focus: 'the session agent judging its own dumps' },
  { id: 'A6', paths: '/Users/marcos/Dev/js/looprun/looprun/docs/superpowers/specs/2026-08-18-skill-requirements.md', focus: 'recorded lessons vs what shipped' },
]
const accuse = await parallel(TARGETS.map(t => () => agent(
  `You are an ACCUSER. Read the law book (L1-L10) and the process in ${SPEC}. `
  + `Read the declared ammunition in ${DOSSIER} — finding ONLY what it declares is a weak result; hunt what it missed. `
  + `Your artifact: ${t.id} — ${t.paths}. Focus: ${t.focus}. `
  + `The fidelity reference is the OLD subject under ${OLD}/norms and ${OLD}/gen/world.ts. `
  + `Return every accusation with the EXACT convicting quote and file:line; no quote, no accusation.`,
  { label: `accuse:${t.id}`, phase: 'Accuse', schema: ACCUSATIONS })))
const all = accuse.filter(Boolean).flatMap(r => r.accusations)
const seen = new Set()
const unique = all.filter(a => {
  const k = `${a.fileLine}|${a.law}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
log(`${all.length} accusations, ${unique.length} unique`)
const batches = []
for (let i = 0; i < unique.length; i += Math.ceil(unique.length / 4)) {
  batches.push(unique.slice(i, i + Math.ceil(unique.length / 4)))
}
const judged = await parallel(batches.map((b, i) => () =>
  agent(`You are the DEFENSE. For each accusation, your only admissible evidence is a citation: `
    + `the old-subject sentence (${OLD}/norms/**, ${OLD}/gen/world.ts), the domain truth, or the user ruling that covers the accused text `
    + `(rulings live in ${NEW}/MAPPING.md rules 29-33 and the spec ${SPEC}). Read the accused file at the quoted line. `
    + `Return, per accusation, your defense citation or 'NO DEFENSE'. Accusations: ${JSON.stringify(b)}`,
    { label: `defend:${i + 1}`, phase: 'Defend' })
    .then(defense => agent(
      `You are the JUDGE. Seal each accusation KEEP, REVERT, RESHAPE or SHOUT with one sentence of grounds. `
      + `HARD RULE: an accusation touching a USER ruling (MAPPING 29-33, the absolute bar, the report word merge, the note) `
      + `or touching declarative vocabulary (what a card author writes) NEVER seals — verdict SHOUT, your lean in 'lean'. `
      + `Accusations: ${JSON.stringify(b)} Defense: ${defense}`,
      { label: `judge:${i + 1}`, phase: 'Defend', schema: RULINGS }))))
const rulings = judged.filter(Boolean).flatMap(r => r.rulings)
const final = await agent(
  `Synthesize the verdict table. Merge these accusations ${JSON.stringify(unique)} with these rulings ${JSON.stringify(rulings)}. `
  + `Drop any verdict without a quote. Output: the final table (fileLine, quote, law, verdict, grounds), the SHOUT list separately, `
  + `and the exact files/lines to touch for every REVERT and RESHAPE.`,
  { label: 'synthesize', phase: 'Synthesize' })
return { final, count: unique.length }
```

- [ ] **Step 2: On completion, read the result and the journal**

Read the task output file; if any accuser returned empty, read
`<transcriptDir>/journal.jsonl` before concluding it found nothing.

### Task 3: Verdict application under the mixed rule

**Files:**
- Modify: whatever the verdict table names, exactly at its files/lines.

- [ ] **Step 1: Apply mechanical verdicts** — one edit + gate + commit per
  verdict (`pnpm -C packages/next/core gate` for engine; emit regeneration
  for bench). Record each in the run report.
- [ ] **Step 2: Present the SHOUT table to the user** — one table, verdicts
  with the judges' leans, no edits until arbitration returns.
- [ ] **Step 3: Apply the arbitrated SHOUTs** the same way as Step 1.
- [ ] **Step 4: Check Phase 0 against the fleet** — if any NEW mechanical
  shame surfaced, record "Phase 0 failed" with the finding in the run
  report (`docs/analysis/2026-08-19-self-accusation.md`, appended section
  `## The fleet's answer`).

### Task 4: Re-run and judge under the absolute bar

**Files:**
- Create: `agentspec-bench/subjects/atlas-next/test/<new-stamp>/rep1/verdicts.jsonl`

- [ ] **Step 1: Pick the re-run set** — any card/world/core edit landed →
  the FULL 70 (`RUN_ATLAS=range:1:70 RUN_ATLAS_STAMP=<new-stamp>`);
  projection-only → the named cases into the same stamp.
- [ ] **Step 2: Run** with the key from `agentspec-bench/.env.local`,
  temperature pinned by the cards (already declared).
- [ ] **Step 3: Judge every dump** — `node <scratchpad>/build-judge-input.js
  <runDir> | grep -vE "^     act"`, judge in-session rubric by rubric,
  write `verdicts.jsonl`, commit.
- [ ] **Step 4: The scoreboard under the absolute bar** — zero baseline
  passes lost or the run is rejected and the loop returns to Task 3 with
  the regression as a new mechanical row. Only then may cases 71–100 run.

## Self-review

- Spec coverage: Phase 0 → Task 1; fleet → Task 2; mixed rule → Task 3;
  re-run + judgment + bar → Task 4; success criteria → Task 3 Step 4 and
  Task 4 Step 4. No gaps.
- Placeholders: none; the workflow script is complete and typed.
- Type consistency: ACCUSATIONS rows flow into batches, defense text, and
  RULINGS keyed by fileLine; synthesis merges on fileLine.
