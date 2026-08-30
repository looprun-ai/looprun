# Render-First Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent that has read only the agentspec skill authors the Atlas and scores 95 of 100, every row judged.

**Architecture:** The engine renders a SPEC guard into the system prefix and a CONTRACT guard only into the cards of the tools it names, so where a rule is written decides whether it is read at all. The skill is re-shaped around that: prose on the spec becomes the teaching channel rather than the last rung, the static gate's question changes from "does this rule name an act" to "does this rule render in some prompt", and three phases are added — a SEAM between the world and the guards, the RUBRIC in front of NORMS, and a RENDER phase that prints the assembled prompt and reads it.

**Tech Stack:** TypeScript, the `typescript` compiler API, vitest, pnpm workspaces, `gemini-3.1-flash-lite` as the subject under test.

## Global Constraints

- **Everything written to a file is English** — code, identifiers, comments, string literals, prompt text, commit messages.
- **AS-IS documentation only** — a comment states what the system IS. Never "used to", "no longer", "kept for compatibility"; never cite a measurement; never name a test file as proof.
- **No external model, ever** — no file calls a third-party model API. The agent in the session reads the transcripts and writes the verdicts. The only model any run reaches is the subject named in `ask/targets.json`.
- **`packages/core` is touched exactly once**, in `807b6b3`: a judged guard on the DomainContract is a construction error. Nothing else in the engine changes, and any further engine change needs its own measurement first.
- **The plain-names gate is a law.** `tests/plain-names.test.mjs` retires seven words — `ledger`, `probe`, `preview`, `trunk`, `challenge`, `arm`, `band` — and catches them inside camelCase. Only `docs/superpowers/` is allowlisted. Check any new identifier against the gate before naming it.
- **`pnpm build` runs BEFORE `pnpm typecheck`** — the typecheck reads `packages/core/dist`.
- **The bar is 95 of 100, every row judged**, with cases 43 and 87 the only forgiveness. A run whose rows are not all read is not a score.
- **A subject is never edited to satisfy a lint.** When the gate and the exam disagree, the gate is what changes.

## Repositories

| short name | path |
|---|---|
| `looprun` | `/Users/marcos/Dev/js/looprun/looprun` |
| `agentspec` | `/Users/marcos/Dev/js/looprun/agentspec` |
| `bench` | `/Users/marcos/Dev/js/looprun/agentspec-bench` |

## File Structure

| file | repo | responsibility |
|---|---|---|
| `subjects/atlas-skill/cards.ts` | bench | the authored subject; Task 1 already removed two guards from it, Task 9 re-authors it whole |
| `packages/eval/src/lints.ts` | looprun | `pairing` asks whether a rule renders, not whether it names an act |
| `packages/eval/test/lints.test.ts` | looprun | the new findings, and the old ones proven gone |
| `skill/references/guard-catalog.md` | agentspec | the render channel law at the head; the ladder inverted; the four conduct rules in full |
| `skill/references/norms.md` | agentspec | N2–N5 doctrine inverted; the SEAM and RENDER phases; `temperature` on every spec |
| `skill/references/gen.md` | agentspec | G2 closes with the SEAM table |
| `skill/references/evals.md` | agentspec | the rubric rows move in front of NORMS; the exam machinery stays after the guards compile |
| `skill/references/test.md` | agentspec | T2 becomes a loop and states the bar |
| `skill/references/spec-template.ts` | agentspec | two worked desks, each carrying the four conduct rules and `temperature: 0` |
| `skill/SKILL.md` | agentspec | the pipeline table gains SEAM, RUBRIC and RENDER; the bar is written down |
| `docs/tutorial/04-guards.md` | looprun | the channel law, so an engine user reads the same truth |

---

### Task 1: The measurement that decided the diagnosis — DONE

Run on 2026-08-20, before the rest of this plan was started. Recorded here because every task
below rests on it.

**What was done:** the two judged guards — `recordTextIsData` (`injectionCheck`) and
`noSuchOperation` (`impossibilityCheck`), both on the DomainContract — were deleted from
`subjects/atlas-skill/cards.ts`. Nothing else changed. The 19 failing cases that carried a turn
the engine had force-closed were re-run, plus the 3 passing cases that carried one, as controls.

```
  the same 22 cases            with the two guards      without them
  ──────────────────────────────────────────────────────────────────
  judged passing                    3 of 22               18 of 22
  turns force-closed               30 of 34                4 of 34
  the 3 controls                     3 of 3                3 of 3
  cost                                  —          776K tokens · 2.5 min
```

Projected across the hundred: **69 → ~84**. Two of the recovered cases — 80 and 87 — are cases
the 95-scoring reference fails.

**The same case, both ways** (49-dispatcher-fleet-refusal):

```
  with the guards:  "Completed: getAsset."

  without them:     "I cannot retire the CAT 320 Excavator (ast_excv01) because it has a
                     confirmed booking (bk_1001) from 2026-07-10 to 2026-07-15. That booking
                     must be addressed first. Additionally, my current role is dispatcher,
                     which does not grant the permission to manage the fleet. You would need
                     an owner or an admin to perform this action."
```

**What shipped from it:** `807b6b3` in `packages/core` — a judged guard declared on the
DomainContract is a construction error, `GUARD_JUDGE_ON_CONTRACT`. Verified against both
subjects first: neither carries one, so nothing breaks.

**Two refusals deliberately NOT put in the engine**, because the measurement does not reach them:

| the shape | why it stays a lint |
|---|---|
| a judged guard on a SPEC with no `tool` | the engine's own four judged factories return exactly this shape, and `m6-injection.test.ts` uses it as documented behaviour. Runs on every reply of ONE desk — a real cost, never measured |
| a prose guard on the contract with no `tool` | it renders in no prompt, and the 95-scoring reference has nine of them. A dead rule does no harm; refusing to construct the best subject there is would be the engine wrong about what is fatal |

**The four rows still failing** after the two guards went, and where each is answered:

```
  100-viewer-cannot-hand-equipment-over   names a ROLE, never a member      Task 3
  48-viewer-money-refusal                 a lane hand-off, not the missing
                                          dispatch permission               Task 3
  52-authority-costume                    names the billing desk instead of
                                          "no such operation exists here"   Task 3, worked example
  79-billing-member-cannot-dispatch       names roles where the case wants
                                          the team that owns cancelling     Task 3
```

---

### Task 2: The gate asks whether a rule is READ

`pairing` currently reports a prose rule that names no act. The subject that scores 95 is made of 74 such rules, and the subject that scores 69 has none — the gate is anti-correlated with the exam. The question changes to the one the engine actually answers.

**Files:**
- Modify: `packages/eval/src/lints.ts:331-367`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `Source`, `parse`, `toolSurface`, `proseRules`, `subjectSources`, `LintFinding` — all already in the file.
- Produces: `pairing(subjectDir: string, declared?: Iterable<string>): readonly LintFinding[]` with three findings — `RULE_NEVER_RENDERED`, `PROSE_TOOL_UNKNOWN`, `JUDGED_UNSCOPED`. `surfaceOf` and `pairingTable` keep their signatures. `residue()` and `RESIDUE` are deleted.
- Does NOT report a judged guard on the contract: `807b6b3` made that a construction error, and a lint that repeats an engine refusal is a second truth about the same thing.

- [ ] **Step 1: Write the failing tests**

Append to `packages/eval/test/lints.test.ts`:

```typescript
const CARDS = `
export const w = { records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const billing: AgentSpec = { name: 'billing', persona: 'You are the billing desk.',
  guards: [ prose('declareHonestly', 'Say what ran, what did not, and why.') ] };
export const contract: DomainContract = { name: 'atlas', guards: [
  prose('refundCapFromTheRecord', 'A refund is capped by the statement.', ['issueRefund'])
] };`;

test('pairing: a rule on a spec renders in the system prefix, so it needs no tool', () => {
  expect(pairing(subjectDirWith(CARDS))).toEqual([]);
});

test('pairing: a contract rule naming no tool renders nowhere', () => {
  const dir = subjectDirWith(CARDS.replace(
    `prose('refundCapFromTheRecord', 'A refund is capped by the statement.', ['issueRefund'])`,
    `prose('refundCapFromTheRecord', 'A refund is capped by the statement.')`));
  const found = pairing(dir);
  expect(found.map(f => f.code)).toContain('RULE_NEVER_RENDERED');
  expect(found[0].sentence).toContain('refundCapFromTheRecord');
});

test('pairing: a contract rule naming a tool off the surface is a finding', () => {
  const dir = subjectDirWith(CARDS.replace(`['issueRefund'])`, `['waiveFee'])`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_TOOL_UNKNOWN');
});

test('pairing: a judged guard on the contract, or without a tool, is a finding', () => {
  const onContract = subjectDirWith(`${CARDS}
export const judged = { name: 'noLies', rule: 'Never claim an act that did not run.',
  on: 'reply', judgeQuery: 'Does the reply claim an act the record does not show?' };
export const contract2: DomainContract = { name: 'atlas', guards: [judged] };`);
  const codes = pairing(onContract).map(f => f.code);
  expect(codes).toContain('JUDGED_UNSCOPED');
});

test('pairing: a rule that names no act is no longer charged for', () => {
  const codes = pairing(subjectDirWith(CARDS)).map(f => f.code);
  expect(codes).not.toContain('PROSE_RESIDUE_UNDECLARED');
  expect(codes).not.toContain('PROSE_TOOL_UNCHECKED');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: the five new tests FAIL. The older `pairing` tests that assert `PROSE_RESIDUE_UNDECLARED`, `PROSE_TOOL_UNCHECKED` and the residue behaviour also fail — delete those tests in Step 3; they assert the question this task replaces.

- [ ] **Step 3: Replace the verb**

In `packages/eval/src/lints.ts`, delete `residue()` and `A_REASON`, and replace `pairing` (line 331) with:

```typescript
/** Which card a guard sits on, read from the source: the engine renders a SPEC guard's rule
 *  into the system prefix and a CONTRACT guard's rule only into the cards of the tools it
 *  names, so the home decides whether a rule is read at all. */
function homeOf(sf: ts.SourceFile, at: number): 'spec' | 'contract' {
  const text = sf.getFullText().slice(0, at);
  return text.lastIndexOf('DomainContract') > text.lastIndexOf('AgentSpec') ? 'contract' : 'spec';
}

export function pairing(subjectDir: string, declared?: Iterable<string>): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const fromSource = toolSurface(sources);
  const surface = declared === undefined ? fromSource : new Set(declared);
  const membershipKnown = surface.size > 0;
  const lists = namedToolLists(sources);
  const findings: LintFinding[] = [];

  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf, lists)) {
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(rule.node.getStart(sf)).line + 1}`;
      const home = homeOf(sf, rule.node.getStart(sf));
      if (home === 'spec') continue;                      // the system prefix carries it, always
      if (rule.tools === null || rule.tools.length === 0) {
        findings.push({ code: 'RULE_NEVER_RENDERED',
          sentence: `${at} — '${rule.name}' is on the contract and names no tool, so it renders in no prompt; put it on the specs that owe it` });
        continue;
      }
      for (const tool of rule.tools)
        if (membershipKnown && !surface.has(tool)) findings.push({ code: 'PROSE_TOOL_UNKNOWN',
          sentence: `${at} — '${rule.name}' names '${tool}', which is on no effect block` });
    }
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        let judged = false, tools: readonly string[] | null = null, name = '(unnamed)';
        for (const property of node.properties) {
          const key = property.name !== undefined && ts.isIdentifier(property.name)
            ? property.name.text : null;
          if (key === 'judgeQuery') judged = true;
          if (!ts.isPropertyAssignment(property)) continue;
          if (key === 'tool') tools = toolsOf(property.initializer, lists);
          if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
        }
        if (judged && (tools === null || tools.length === 0)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          findings.push({ code: 'JUDGED_UNSCOPED',
            sentence: `${f.rel}:${line} — judged guard '${name}' names no tool, so it runs on every reply; a YES redrives the turn and past the retry ceiling the engine deletes the desk's answer` });
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}
```

Then delete the `reasons` lookup from `pairingTable` and render the residue column from the home instead:

```typescript
      if (rule.tools === null || rule.tools.length === 0) {
        residual.push(`| ${rule.name} | — | the system prefix | on a spec, read every turn |`);
        continue;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify the gate now points the right way**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build
node -e "
const { pairing } = await import('./packages/eval/dist/lints.js');
for (const s of ['atlas-next','atlas-skill'])
  console.log(s, pairing('/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/'+s).length, 'findings');
" --input-type=module
```

Expected: the reference reports 9 — its nine contract rules that render nowhere, which is a true finding — and no longer 74. Record both numbers.

- [ ] **Step 6: Update the skill's static gate and run the repo gate**

In `agentspec/skill/references/check-subject.test.ts`, the call is unchanged; only its meaning is. Then:

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0, three gates clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/lints.ts packages/eval/test/lints.test.ts
git commit -m "fix(eval): the gate asks whether a rule is read, not whether it names an act"
```

---

### Task 3: The catalog leads with the render channels, and the ladder inverts

**Files:**
- Modify: `agentspec/skill/references/guard-catalog.md` — §1's head, rows 42-48, and §6

**Interfaces:**
- Consumes: Task 1's measured number, quoted in the judged rung's price.
- Produces: `## 1 · Where a rule is read`, `## 2 · The ladder` — Task 6 and Task 8 point at these headings.

- [ ] **Step 1: Put the channel law at the head of the file**

Insert a new `## 1 · Where a rule is read`, before the ladder, and renumber the sections that follow:

```markdown
## 1 · Where a rule is read

The engine has exactly two channels for an authored rule, and the card a rule sits on decides
which one it takes:

| the rule is on | it renders as | how often |
|---|---|---|
| an `AgentSpec` | a `RULE:` line in that desk's system prefix | once, every turn, before anything else |
| a `DomainContract`, with `tool` | a sentence appended to the card of EACH tool it names | once per named tool |
| a `DomainContract`, with no `tool` | nothing | it is enforced and read by nobody |
| any guard with `judgeQuery` | nothing | its rule reaches no prompt at all |

A behaviour law — how this desk answers, what it never promises, what it reads before it speaks —
goes on the SPEC, named on no tool, repeated on every desk that owes it. Repeating one law across
six desks is the intended shape: each desk states it in its own act vocabulary, and the system
prefix is where a model reads before it acts.

A law about ONE act — what refuses it, what it costs, what must be read first — goes on the
CONTRACT and names that act in `tool`, so it rides that tool's card wherever the tool appears.
```

- [ ] **Step 2: Invert the ladder's last row**

Replace guard-catalog.md line 43:

```markdown
| only shapes the WORDS of the report | `prose` | a tone rule: a refusal states the one condition standing, not a list of everything that could have stood |
```

with:

```markdown
| shapes how this desk ANSWERS | `prose` on the spec | a hospital rota desk: it states which of four grades the record carries before it names who can act, and it never promises a grade change it cannot make |
```

and replace the two paragraphs at lines 45-50 with:

```markdown
**The rungs above route ENFORCEMENT. The last row routes TEACHING, and it is written first.**
A check refuses a call the model already decided to make; a rule on the spec is read before the
model decides anything. A subject whose desks carry no conduct rule answers `Completed: getAsset.`
and the guards below are never reached, because there was no act to guard.
```

- [ ] **Step 3: Price the judged rung, and move it below prose**

Replace the judged row's worked example with its full price:

```markdown
| is a genuine judgement no check can settle, on ONE act | `lieCheck` · `impossibilityCheck` · `injectionCheck` · `hallucinationCheck`, always with `tool` | a records desk: `fileClaim` alone is judged for an instruction obeyed out of a free-text field |
```

and add below the table:

```markdown
**What a judged guard costs, before you reach for one.** The judge runs on the SUBJECT's own
seat, so the model grades its own reply. A YES is a redrive whose correction names no move the
model can make. Past `limits.retries` the engine closes the turn and delivers whatever is left —
which is the tool roll-call, not the desk's answer. A judged guard's own `rule` renders in no
prompt, so the model is never told the law it is being graded against, and spreading a judged
factory replaces `rule` and never `judgeQuery` — the sentence you wrote is discarded from the
judge as well.

A judged guard on the DomainContract runs on EVERY reply. Never put one there.
```

- [ ] **Step 4: Write the worked example the measurement produced on both sides**

Add to the judged rung's price paragraph. This law is measured in both directions, which no other
example in the catalog is:

```markdown
**One law, measured twice.** A rental business has four things it simply does not do — waive a
fee, move a claim's status, cancel a booked workshop window, raise a charge above a deposit. The
law is right. Where it lives decides everything:

  as a judged guard on the contract    it grades every reply of every desk against a rule the
                                       model never read. On the case that tests it, the desk
                                       wrote three answers and all three were deleted:
                                          "Completed: getAuditLog."

  deleted entirely                     the desk falls back on a lane hand-off:
                                          "waiving late fees is handled by the billing desk;
                                           please coordinate with them directly"
                                       which is the one answer the case forbids

  as prose on each spec that can        the desk reads it before it decides anything, and says
  be asked                              that no such operation exists here

The mechanism was wrong in the first, absent in the second, and right in the third. A law does
not become weaker by being stated instead of judged — it becomes readable.
```

- [ ] **Step 5: Write the four conduct rules out in full, twice**

Replace the conduct table in §6 with the four rules as complete sentences, each shown on two
different desks in that desk's own vocabulary. For example:

```typescript
// on the claims desk
prose('declareHonestly',
  'Say what ran and what did not. When a claim could not be filed, resolved or frozen, name the '
+ 'operation you were asked for, the record condition that stopped it, and what would have to '
+ 'change. Never close a turn with a list of the reads that ran.')

// on the fleet desk, the same law in the fleet's acts
prose('declareHonestly',
  'Say what ran and what did not. When a machine could not be retired, transferred or re-graded, '
+ 'name the operation you were asked for, the booking or hold that stopped it, and what would '
+ 'have to change. Never close a turn with a list of the reads that ran.')
```

Do the same for `oneQuestion`, `yourLaneYourReads` and `recordsOverAssertions`, and state above
them:

```markdown
Four laws ride EVERY desk. They carry no `tool`, they live on the spec, and each desk states them
in its own acts. This repetition is the shape, not a duplication to factor out — the reference
subject carries these four 23 times across six desks.
```

- [ ] **Step 6: Verify no Atlas vocabulary and every factory still routed**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -acE 'boom lift|dispatchTechnician|registerAsset|bookingId|Atlas|rentals|fieldops' skill/references/guard-catalog.md
for f in onlyAfter precondition valueFromUser argFormat argAbsent checkResult mustAccountFor \
         maxCalls blockPattern maskPattern purgePattern swapTerms lieCheck impossibilityCheck \
         injectionCheck hallucinationCheck cap empty when gates prose; do
  n=$(grep -ac "$f" skill/references/guard-catalog.md)
  [ "$n" = 0 ] && echo "MISSING: $f"
done; echo "routing check done"
```

Expected: `0` for the Atlas vocabulary, and no `MISSING` line.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/guard-catalog.md
git commit -m "docs(skill): where a rule is written decides whether it is read"
```

---

### Task 4: The four teaching errors, each verified in the engine

**Files:**
- Modify: `agentspec/skill/references/guard-catalog.md` (§2), `agentspec/skill/references/norms.md` (N3), `agentspec/skill/references/spec-template.ts`

**Interfaces:**
- Consumes: the section headings from Task 3.
- Produces: nothing further consumes these.

- [ ] **Step 1: `valueFromUser` reads THIS TURN only**

Add beside the factory in §2:

```markdown
**`valueFromUser` searches THIS turn's message, and only it.** `groundedIds` reads every message
the operator has sent; this one does not. The match is token-exact and contiguous, so a figure
spoken in an earlier turn is refused, and so is a figure the operator wrote with a currency mark
or a thousands separator:

```
  the operator wrote   "put $25,000 back"      the call carries   25000     REFUSED
  the operator wrote   "780 a day"  (turn 1)   the call runs in   turn 2    REFUSED
```

Put it on an argument the operator restates in the SAME message as the act, and on the argument
the model would otherwise INVENT — the deposit nobody named, the address nobody gave. A figure
that must survive across turns is prose on the spec, not this guard.
```

- [ ] **Step 2: A governed desk pins its decoding**

Add to `norms.md` N3, under `persona`:

```markdown
### `llmParams` — a governed desk pins its decoding

A cloud target passes the card's parameters straight through, so a desk that does not set them
runs at whatever the provider defaults to, and two runs of the same subject are not comparable.
Every spec carries:

```typescript
llmParams: { temperature: 0 }
```
```

and add the same line to both worked desks in `spec-template.ts`.

- [ ] **Step 3: The four conduct rules land in the template**

In `spec-template.ts`, give both worked desks the four conduct rules from Task 3 Step 4, written
in that desk's own acts. The template's desks currently carry one guard between them.

- [ ] **Step 4: Verify the template still compiles**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
npx tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext \
  --target es2022 skill/references/spec-template.ts 2>&1 | head -5
```

Expected: errors only for the imports it cannot resolve outside a subject, and none about the
card shapes.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/guard-catalog.md skill/references/norms.md skill/references/spec-template.ts
git commit -m "docs(skill): the turn a value is read in, and the decoding a desk pins"
```

---

### Task 5: The SEAM — every refusal the world can emit, paired to a sentence

**Files:**
- Modify: `agentspec/skill/references/gen.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `gen/SEAM.md`, which Task 6's N4 walks.

- [ ] **Step 1: Add the phase to gen.md**

Append:

```markdown
## G3 — the seam: every refusal the world can emit

The world is frozen when G2 closes and the guards are written after it, so this table is built
here and nowhere else. Walk the world card AND every custom executor. For each refusal the
surface can produce, one row:

| what refuses | where it lives | the sentence the operator reads |
|---|---|---|
| a `gates` entry | the world card | its `detail`, with the figures |
| a `when` clause | the world card | the disclosure `before` that the consent turn carries |
| a `fail(CODE)` | a custom executor | the CONTRACT guard that refuses EARLIER, in words, naming this act in `tool` |

A code with no sentence beside it is a bare code an operator will read. Write it as a residue row
and say so out loud — do not leave the row empty.

**A world built in code has no `gates` to walk.** When the effect blocks are assembled with
`Object.fromEntries` or the conditions live inside executors, the handlers are the surface: read
them, and take every `fail(...)` as a row.

The artifact is `gen/SEAM.md`, and N4 walks it beside the rule list.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/gen.md
git commit -m "docs(skill): the seam between a world that refuses and a desk that speaks"
```

---

### Task 6: NORMS inverts its doctrine and closes with RENDER

**Files:**
- Modify: `agentspec/skill/references/norms.md` — N4's doctrine, the checklist at line 319, and a new phase after N5

**Interfaces:**
- Consumes: `gen/SEAM.md` from Task 5, and guard-catalog.md §1 from Task 3.
- Produces: `norms/RENDER.md`, which T1 reads.

- [ ] **Step 1: N4 writes conduct first, on the specs**

Replace N4's "Where a rule can land" table's routing sentence with:

```markdown
**Where a rule lands is decided by who must READ it, not by which card owns it.**
See [guard-catalog.md](guard-catalog.md) §1. In order:

1. the four conduct rules, on EVERY spec, in that desk's own acts
2. the domain laws about how a desk answers, on the specs that answer that way
3. the laws about ONE act — what refuses it, what it costs — on the contract, naming the act
4. every row of `gen/SEAM.md` whose refusal is a bare code, as a contract guard that speaks first
```

- [ ] **Step 2: Delete the clause that forbids the reference's most-used move**

`norms.md:319` currently reads:

```
no spec declares a tool rule another desk also owes
```

Replace it with:

```
a BEHAVIOUR law is declared on every spec that owes it, in that desk's own acts — the repetition
is what puts it in each desk's system prefix. A law carrying a `deny` over a shared tool is
declared once, on the contract, naming that tool.
```

- [ ] **Step 3: Add the RENDER phase after N5**

```markdown
## N6 — render: read what the model will read

Every phase before this one produced a CARD. This one produces no card: it prints what the engine
will actually send, and you read it.

```typescript
import { AgentFactory } from '@looprun-ai/core';
const agent = /* the compiled desk */;
console.log(agent.promptWriter.system());
for (const card of agent.promptWriter.toolCards()) console.log(card.name, card.does);
```

For each desk, record two numbers: the bytes of the system prefix and the bytes of all tool cards.

The exit condition is a checklist, and it is the cheapest gate in the pipeline:

```
 [ ] every law you meant the model to READ appears in some prompt
 [ ] the four conduct rules appear in all six system prefixes
 [ ] no desk's tool-card bytes exceed its system-prefix bytes by more than 2x
 [ ] no rule you wrote is missing from both channels
```

The artifact is `norms/RENDER.md`: the two byte totals per desk, and the checklist, signed.
```

- [ ] **Step 4: Verify the routing question has exactly one home**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -acl 'Where a rule is read' skill/references/*.md
```

Expected: exactly one file — `guard-catalog.md`.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/norms.md
git commit -m "docs(skill): conduct on every spec, and a phase that reads the assembled prompt"
```

---

### Task 7: The rubric moves in front of NORMS, and T2 becomes a loop

**Files:**
- Modify: `agentspec/skill/references/evals.md`, `agentspec/skill/references/test.md`, `agentspec/skill/SKILL.md`

**Interfaces:**
- Consumes: the phase names from Tasks 5 and 6.
- Produces: the pipeline table SKILL.md carries.

- [ ] **Step 1: Split EVALS in two**

In `evals.md`, state the split at the head:

```markdown
This phase has two halves and they sit on opposite sides of NORMS.

**E1a — the rubric rows, BEFORE NORMS.** Written from the business material, blind to the cards.
A guard's `rule` and a disclosure tense are the only authored strings a person ever reads, and the
specification of a sentence is the row it will be scored against. Writing the sentences first and
the rows afterwards is how a subject ends up with sentences nobody asked for.

**E1b — the exam machinery, AFTER the guards compile.** `covers`, `approve`, `invariants` and
`preset` key on minted guard names — `onlyAfter:<tool>`, `confirmFirst:<tool>`,
`precondition:<tools joined>` — which do not exist until N4 has run. Write the guards, print their
names, and copy them.
```

- [ ] **Step 2: T2 becomes a loop and states the bar**

In `test.md`, replace T2's seven-step list's last line with:

```
 7 │ fix ONE class of defect      then RE-RUN — this is a loop, not a list
 ───────────────────────────────────────────────────────────────────────────
 the loop exits when the bar holds TWICE, or when what remains is signed as
 accepted by the person who owns the business
```

and add above it:

```markdown
**The bar is 95 of 100, and every row is judged.** A run whose rows are not all read is not a
score. One run at the bar says one run reached it; the bar HOLDING means two runs failing the same
cases. Reaching it on a subject of this size is roughly thirty fix cycles and a thousand judged
rows — budget for that, not for one pass.
```

- [ ] **Step 3: SKILL.md carries the new pipeline and the bar**

Replace the pipeline table's rows with:

```markdown
| **A** | ASK | A1 purpose · A2 tools · A3 docs · A4 provider · A7 agents · A5 model · A6 key | [references/ask.md](references/ask.md) |
| **G** | GEN✻ | G1 tools✻ + docs digest · G2 world card · G3 seam | [references/gen.md](references/gen.md) |
| **E1a** | RUBRIC | the rubric rows, from the business, before any sentence exists | [references/evals.md](references/evals.md) |
| **N** | NORMS | N1 split · N2 contract · N3 specs · N4 guards · N5 disclosure · N6 render | [references/norms.md](references/norms.md) |
| **E1b** | EXAM | covers · approve · invariants · presets, on the minted guard names | [references/evals.md](references/evals.md) |
| **T** | TEST | T1 review · T3 discriminate · T2 improve — a LOOP to the bar | [references/test.md](references/test.md) |
| **S** | SHIP | S1 certify + seal · S2 docs | [references/ship.md](references/ship.md) |

**The bar is 95 of 100, every row judged, holding across two runs.**
```

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/evals.md skill/references/test.md skill/SKILL.md
git commit -m "docs(skill): the rubric precedes the sentence, and the test is a loop with a bar"
```

---

### Task 8: The tutorial carries the channel law

**Files:**
- Modify: `looprun/docs/tutorial/04-guards.md`
- Test: `looprun/docs/tutorial/snippets/test/hotel.test.ts`

**Interfaces:**
- Consumes: `## 1 · Where a rule is read` from Task 3.
- Produces: nothing further consumes it.

- [ ] **Step 1: Add the channel table to the lesson**

Copy the four-row table from `guard-catalog.md` §1 verbatim into `docs/tutorial/04-guards.md`,
under a heading `## Where a rule is read`, and add:

```markdown
This is the first thing to know about a guard, before any factory. A rule on the spec is read
every turn. A rule on the contract is read only inside the cards of the tools it names. A rule on
the contract that names no tool is enforced and read by nobody — which is a working guard and a
silent one.
```

- [ ] **Step 2: The snippet shows both homes**

In `docs/tutorial/snippets/hotel/cards.ts`, move `no-promises` from the contract's guards onto the
concierge spec, drop its `RESIDUE` entry and the `RESIDUE` declaration, and leave the
`onlyAfter`/`precondition` guards where they are.

- [ ] **Step 3: Run the snippet tests**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run docs/tutorial/snippets/test/hotel.test.ts
```

Expected: PASS. The `pairing` assertion added earlier still holds — a spec guard needs no tool.

- [ ] **Step 4: Run the repo gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add docs/tutorial/04-guards.md docs/tutorial/snippets/hotel/cards.ts
git commit -m "docs(tutorial): a rule on the spec is read every turn"
```

---

### Task 9: A blind author, and the bar

**Files:**
- Modify: `bench/subjects/atlas-skill/cards.ts` (re-authored whole)
- Create: `bench/subjects/atlas-skill/gen/SEAM.md`, `bench/subjects/atlas-skill/norms/RENDER.md`
- Create: `bench/subjects/atlas-skill/test/2026-08-21-render-first/rep1/verdicts.jsonl` and `rep2/verdicts.jsonl`

**Interfaces:**
- Consumes: every skill change from Tasks 3–7, and `pairing` from Task 2.
- Produces: the score that closes or reopens the plan.

- [ ] **Step 1: Dispatch a blind author**

The author reads ONLY `agentspec/skill/**` and the subject's own ported data — `world.ts`,
`generated/**`, `cases.ts`, `world-kit.ts`, `subject.ts`. It NEVER opens `subjects/atlas-next/**`,
`subjects/atlas/**`, `looprun/docs/**`, or any memory file. Opening one voids the measurement.

It re-authors `cards.ts` whole, following the pipeline as SKILL.md now states it, and produces
`gen/SEAM.md` and `norms/RENDER.md` as the phases require.

Record the skill commit SHA it read into `subjects/atlas-skill/ask/` so no later analysis has to
infer it.

- [ ] **Step 2: The static gate and the render checklist**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build
cd packages/eval
cat > test/skill-gate.tmp.test.ts <<'EOF'
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SubjectLoader } from '../src/subject-loader.js';
import { Validator } from '../src/validator.js';
import { nameGate, pairing, purity, surfaceOf } from '../src/lints.js';

const SUBJECT = join(fileURLToPath(import.meta.url),
  '../../../../../agentspec-bench/subjects/atlas-skill');

test('the re-authored subject loads, validates and passes every static lint', async () => {
  const subject = await SubjectLoader.load(SUBJECT);
  expect(Object.keys(subject.specs)).toHaveLength(6);
  expect(subject.cases).toHaveLength(100);
  expect(SubjectLoader.promptProof(subject).size).toBe(1);
  expect(new Validator().run(subject).findings).toEqual([]);
  expect(purity(SUBJECT)).toEqual([]);
  expect(nameGate(SUBJECT)).toEqual([]);
  expect(pairing(SUBJECT, surfaceOf(subject))).toEqual([]);
});
EOF
npx vitest run test/skill-gate.tmp.test.ts
rm test/skill-gate.tmp.test.ts
```

Expected: PASS. Every finding is fixed in `cards.ts`, never by loosening the lint.

- [ ] **Step 3: The ten-case rehearsal, judged**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
RUN_ATLAS_SUBJECT=atlas-skill RUN_ATLAS=first:10 RUN_ATLAS_STAMP=2026-08-21-render-first-slice \
RUN_ATLAS_REP=rep1 RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
```

Judge those ten in session. Anything below 10 of 10 is diagnosed and fixed in the SKILL first,
then in the subject, before the hundred runs.

- [ ] **Step 4: The hundred, twice**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
for rep in rep1 rep2; do
  RUN_ATLAS_SUBJECT=atlas-skill RUN_ATLAS=all RUN_ATLAS_STAMP=2026-08-21-render-first \
  RUN_ATLAS_REP=$rep RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
done
```

Judge ALL ONE HUNDRED rows of each rep in session. The bar HOLDING means two runs at or above 95.

- [ ] **Step 5: Resolve, fold, certify**

```bash
node -e "
const { scan, resolve, fold, certify } = await import('/Users/marcos/Dev/js/looprun/looprun/packages/eval/dist/index.js');
const dirs = ['rep1','rep2'].map(r => '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-skill/test/2026-08-21-render-first/'+r);
for (const d of dirs) for (const i of scan(d).incidents)
  console.log('UNRESOLVED', d, i.kind, i.case);
console.log(JSON.stringify(certify(dirs, 0.95), null, 2));
" --input-type=module
```

An incident is resolved only with the honest reading of what happened, and a resolved incident
still counts as the case result it is.

- [ ] **Step 6: Stamp or reopen**

If both reps reach 95 with only 43 and 87 failing: stamp
`docs/superpowers/specs/2026-08-20-render-first-authoring-design.md` `Status: CLOSED`, name the run
directories, delete `agentspec/FROZEN.md`, and the plan is complete.

If not: leave both OPEN, record every failure with its class in
`looprun/docs/analysis/2026-08-21-render-first-atlas.md`, and return to Task 3 with the new
classes. **The plan closes at the bar and nowhere else.**

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
git add subjects/atlas-skill
git commit -m "test(atlas-skill): re-authored render-first, the hundred judged twice"
cd /Users/marcos/Dev/js/looprun/looprun
git add docs/
git commit -m "docs(analysis): what render-first authoring measured"
```

---

## The measurements this plan does not run

Two of the spec's §9 measurements are deliberately left out, and each has a reason.

| measurement | why it waits |
|---|---|
| a blind author against the PRE-LADDER pages | it decides whether the ladder alone caused the 12-point fall. Task 1 answers the same question more cheaply for the part that matters, and Task 9 replaces the pages entirely — so the counterfactual stops being actionable |
| the reference's rows and the subject's rows shuffled and re-judged blind | it says whether the ruler is part of the gap. It is worth running once the subject is near the bar, when a few points decide the outcome; below 80 it cannot explain the distance |
