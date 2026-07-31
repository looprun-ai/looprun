# Prose-only Ungoverned Arm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the ungoverned arm so its system prompt is byte-identical to the governed arm's (all rule prose present) while the enforcement layer (guards, chains, mutators, exhaustionReply, destructive cross-check) is disarmed.

**Architecture:** `stripGovernance` gains a prompt-view/loop-view split: the stripped spec's `surface.systemPrompt` becomes a closure rendering the FULL original spec + contract via `renderScopedSpecTrunk` (the runtime honors this override at `packages/core/src/runtime/prompt.ts:94` and `packages/mastra/src/compile.ts:65`), while the spec fields driving the loop stay emptied. Byte-identity between arms is asserted by test.

**Tech Stack:** TypeScript, vitest, pnpm workspace (`packages/eval`, docs in `docs/tutorial`), agentspec skill docs (separate repo `~/Dev/js/looprun/agentspec`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-prose-only-ungoverned-arm-design.md` — the cut table is normative.
- Flag stays `--ungoverned`; arm label stays `ungoverned` in dumps. No third arm.
- No export-surface change expected (`stripGovernance`/`UngovernedBundle` signatures unchanged); if any `packages/eval/src/index.ts` export DOES change, `test/surface-lock.test.ts` riders AND the tutorial outline spec must change in the same commit (surface-lock law).
- Skill-repo writes (Task 3) end with an explicit leak-review confirmation: no machine paths, no dev/bench context, no internal jargon in skill artifacts.
- Commit in looprun/agentspec but NEVER push (the user pushes).
- Old ungov run artifacts (e.g. coworking `test/results/t3i*-ungoverned/`) are historical record — do not delete, rename, or "fix" them.

---

### Task 1: Rewrite `stripGovernance` (prompt view = full trunk, loop view = disarmed)

**Files:**
- Modify: `packages/eval/src/ungoverned.ts`
- Test: `packages/eval/test/subject-runner.test.ts` (the `'ungoverned arm strips the whole governance surface (guard count 0)'` test, lines 127–150)

**Interfaces:**
- Consumes: `renderScopedSpecTrunk(world, spec, uploads, domain)` from `@looprun-ai/core` (already exported); `AgentSpec.surface.systemPrompt?: (world, recentUploads?) => string` (`packages/core/src/spec.ts:153`).
- Produces: `stripGovernance(spec: AgentSpec, contract: DomainContract): UngovernedBundle` — same signature, new behavior: `bundle.spec.surface.systemPrompt` is always set and renders the governed trunk bytes.

- [ ] **Step 1: Rewrite the strip test to the new semantics (failing first)**

In `packages/eval/test/subject-runner.test.ts`, replace the test at lines 127–150 with:

```ts
  it('ungoverned arm: prompt byte-identical to governed, enforcement disarmed', async () => {
    const spec = subject.specs['front-desk'];
    const stripped = stripGovernance(spec, subject.contract);

    // PROMPT VIEW — the arm's system prompt is the governed trunk, byte for byte.
    const world = subject.makeWorld('default');
    const governedPrompt = renderScopedSpecTrunk(world, spec, [], subject.contract);
    expect(stripped.spec.surface.systemPrompt).toBeDefined();
    expect(stripped.spec.surface.systemPrompt!(world, [])).toBe(governedPrompt);
    // the prose survived: rule sections present in the arm's prompt
    expect(governedPrompt).toContain('## Core rules (NEVER violate)');

    // LOOP VIEW — the enforcement layer is disarmed (the cut table of the design spec).
    const g = stripped.spec.guards;
    expect(
      (g.onInput?.length ?? 0) + g.preTool.length + (g.postTool?.length ?? 0) + g.onReply.length + (g.onReplyMutate?.length ?? 0),
    ).toBe(0);
    expect(stripped.spec.controls.chains).toBeUndefined();
    expect(stripped.spec.controls.exhaustionReply).toBeUndefined();
    expect(stripped.spec.assertDestructiveConfirmable).toBeUndefined();
    // the source spec is untouched
    expect(spec.guards.preTool.length + spec.guards.onReply.length).toBeGreaterThan(0);

    // The loop still runs clean end-to-end with zero guard events.
    const dump = await runCase(subject, findCase('01-reserve-room-happy'), {
      model: fakeLLM(happyScript).model,
      modelId: 'scripted',
      ungoverned: true,
    });
    expect(dump.arm).toBe('ungoverned');
    expect(dump.invariantVerdict.pass, JSON.stringify(dump.invariantVerdict)).toBe(true);
    expect(dump.turns.flatMap((t) => t.guardEvents)).toEqual([]);
  });
```

Add the import at the top of the file (next to the existing `@looprun-ai/mastra/testing` import):

```ts
import { renderScopedSpecTrunk } from '@looprun-ai/core';
```

Note: the old assertions `behavior === []` / `scope === undefined` / `coreInvariants === []` are deliberately dropped from the test — under the new semantics those fields are inert (the prompt comes from the closure) and asserting them would freeze an implementation detail. The old test's discrimination test (`'forbidden call is detected (02, ungoverned arm fabricates a reservation)'`, lines 104–125) stays UNCHANGED — it proves the forbidden call still reaches the world in the ungov arm (spec test b).

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && pnpm -C packages/eval exec vitest run test/subject-runner.test.ts`
Expected: FAIL — `stripped.spec.surface.systemPrompt` is `undefined` (current strip only copies a pre-existing override, and the toy-subject spec has none).

- [ ] **Step 3: Rewrite `packages/eval/src/ungoverned.ts`**

Full new file content:

```ts
/**
 * The ungoverned-arm strip — PROSE-ONLY baseline: the SAME agent with the SAME system
 * prompt (byte-identical to the governed arm — every rule rendered as prose), run with the
 * enforcement layer disarmed. What is removed is only the CHECKS: guard hooks (veto /
 * redrive / deny), egress mutators, `controls.chains`, `controls.exhaustionReply`, and the
 * destructive cross-check. `governed − ungoverned` therefore measures the deterministic-
 * enforcement premium over a well-prompted agent — not "rules exist vs. rules don't".
 *
 * Mechanically: the stripped spec's `surface.systemPrompt` is a closure over the FULL
 * original spec + contract (`renderScopedSpecTrunk`), which the runtime honors as the
 * prompt override; the spec fields that drive the loop are emptied. Never mutates the
 * source spec/contract — returns fresh plain objects.
 */
import { renderScopedSpecTrunk } from '@looprun-ai/core';
import type { AgentSpec, DomainContract } from '@looprun-ai/core';

export interface UngovernedBundle {
  spec: AgentSpec;
  contract: DomainContract;
}

export function stripGovernance(spec: AgentSpec, contract: DomainContract): UngovernedBundle {
  const { chains: _c, exhaustionReply: _e, ...loopControls } = spec.controls;
  const strippedContract: DomainContract = {
    voice: contract.voice,
    stateBlock: contract.stateBlock.bind(contract),
    coreInvariants: [...contract.coreInvariants],
    languageClause: contract.languageClause,
    // exhaustionReply: omitted — fallback of the redrive mechanism; without redrive it does not exist
  };
  const strippedSpec: AgentSpec = {
    id: spec.id,
    mode: spec.mode,
    persona: spec.persona,
    ...(spec.scope ? { scope: spec.scope } : {}),
    surface: {
      tools: [...spec.surface.tools],
      // PROMPT VIEW: the governed trunk, byte for byte. A pre-existing override is the
      // governed arm's own prompt already — reuse it; otherwise close over the FULL spec.
      systemPrompt:
        spec.surface.systemPrompt ??
        ((w, u = []) => renderScopedSpecTrunk(w, spec, u, contract)),
    },
    flow: [...spec.flow],
    // LOOP VIEW: enforcement disarmed.
    guards: { onInput: [], preTool: [], postTool: [], onReply: [], onReplyMutate: [] },
    controls: { ...loopControls },
    behavior: [...spec.behavior],
    // assertDestructiveConfirmable: omitted — the destructive-confirm cross-check is a check
  };
  strippedSpec.contract = strippedContract;
  return { spec: strippedSpec, contract: strippedContract };
}
```

Notes for the implementer:
- `directives` are KEPT on `loopControls` now (unlike the old strip): they render as prose in `## Governance` and are never evaluated at runtime (`StateDirective.when` has no caller — see BACKLOG), so they are prose, not check. They also no longer affect the prompt bytes (the closure renders from the full spec) — keeping them is about not lying in the loop view.
- `scope` / `behavior` / `coreInvariants` are likewise kept: prose-only fields, inert for enforcement. The disarm set is exactly the cut table: guards (all five hook arrays), chains, exhaustionReply, assertDestructiveConfirmable.
- If `AgentSpec.controls` typing rejects `directives` passthrough, keep the destructure as `const { chains: _c, exhaustionReply: _e, ...loopControls }` — `directives` flows through the rest spread.

- [ ] **Step 4: Run the eval test suite**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && pnpm -C packages/eval exec vitest run && pnpm -r typecheck`
Expected: all PASS (including the unchanged discrimination test 02 and `surface-lock.test.ts` — no export changed). If the byte-identity assertion fails, the bug is in the closure (wrong contract or spec captured), not in the test.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/ungoverned.ts packages/eval/test/subject-runner.test.ts
git commit -m "feat(eval): ungoverned arm is prose-only — byte-identical prompt, enforcement disarmed"
```

---

### Task 2: Tutorial §5.6 — rewrite the fairness claim to the new semantics

**Files:**
- Modify: `docs/tutorial/05-running-and-eval.md:641-669` (section `### 5.6 The A/B: stripGovernance and the ungoverned arm`)

**Interfaces:**
- Consumes: the new `stripGovernance` semantics from Task 1.
- Produces: nothing downstream; docs only.

- [ ] **Step 1: Replace the EMPTIED/KEPT block and the fairness paragraph**

Replace lines 654–669 (the fenced `EMPTIED/KEPT` block and the paragraph after it) with:

```
   DISARMED  guard hooks (veto / redrive / deny) · egress mutators (`onReplyMutate`) ·
             `controls.chains` · `controls.exhaustionReply` · the destructive cross-check
             (`assertDestructiveConfirmable`)
   KEPT      the ENTIRE system prompt, byte-identical to the governed arm — voice, scope,
             core rules, flow, tool/reply rules, governance directives, behavior, language —
             plus the tool surface, the state tail, and the remaining loop mechanics
             (terminal policy, maxSteps, sampling)
```

```
It returns fresh objects and never mutates the source spec, so both arms can run in one
process. The ungoverned arm is the *same agent with the same prompt* — a well-prompted
traditional agent that knows every rule — minus the deterministic checks. A difference in
the invariant gate between the arms is then attributable to ENFORCEMENT and to nothing
else: both models read the same "never reserve for an unknown member" prose; in the
governed arm the guard stops the violating call before it reaches the world, while in the
ungoverned arm it arrives and the world's own refusal is the only thing left standing
between the model and the write. Same rules, same intent, two very different distances
from the damage — and that gap, the price of relying on prose alone, is what the two arms
measure.
```

Keep lines 641–652 (heading, intro sentence, code excerpt) unchanged — the excerpt's comment reads "the whole governance surface emptied"; update that one comment line in the excerpt to `/** The ungoverned control arm: the same prompt with the enforcement layer disarmed. */` and make the same one-line comment fix in `docs/tutorial/snippets/05-running-and-eval.ts` (grep for `ungovernedArm` there) so the excerpt and its source stay in sync.

- [ ] **Step 2: Verify the snippet file still typechecks (if it is part of a checked package)**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add docs/tutorial/05-running-and-eval.md docs/tutorial/snippets/05-running-and-eval.ts
git commit -m "docs(tutorial): §5.6 A/B — ungoverned arm is prose-only (same prompt, checks disarmed)"
```

---

### Task 3: Agentspec skill docs — band semantics under the prose-only baseline

**Files (repo `/Users/marcos/Dev/js/looprun/agentspec`):**
- Modify: `skill/references/test.md` (band table lines 123–125, prediction line 129, fail class 9 line 185)
- Modify: `skill/references/evals.md` (prediction instruction line 55, observation line 64)

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (docs describe the released engine behavior; the skill is engine-version-agnostic — cite the semantics, not a version).
- Produces: nothing downstream.

- [ ] **Step 1: Update the T2 band table in `skill/references/test.md`**

The three band rows (lines 123–125) currently define *discriminates*/*floor*/*alarm* against an ungoverned arm. Update the row DESCRIPTIONS so the meaning reads against the prose-only baseline. Exact replacement rows:

```
| **discriminates** | ungoverned fails, governed passes — the prose alone did not hold; the CHECK held | as high as you can get it — the only band that measures the product rather than the model |
| **floor** | both arms pass — the prose alone already holds | one per promised job, no more — regression cover; beyond that it is budget that should have gone to discrimination |
| **alarm** | ungoverned PASSES, governed FAILS — enforcement itself cost the product | ZERO — governance costing the product (fail class 9 below) |
```

Line 129 ("comments against the ungoverned traces…") needs no text change — predictions are still checked against ungoverned traces; only their meaning sharpened (covered by evals.md below).

Line 185 (fail class 9): append one clause so the row ends: `…ACCEPT with the price written down** — the ungoverned arm shares the governed prompt, so an ALARM is the check itself (not a missing rule) costing the case`.

- [ ] **Step 2: Update the prediction instructions in `skill/references/evals.md`**

Line 55 currently: "what you expect an ungoverned" (agent to do). Rewrite the sentence to predict a WELL-PROMPTED agent: e.g. `For every case, write one sentence in the case's own comment: what you expect an agent that KNOWS every rule (same prompt, no checks) to do under this pressure — where prose alone bends.` Adjust line 64's observation ("An ungoverned capable model is verbose and honest…") only if it contradicts the new baseline; keep it if it still describes observed behavior.

- [ ] **Step 3: Leak-review both files**

Re-read both diffs. Confirm: no machine paths, no dev/bench vocabulary ("Atlas", "bench", model nicknames), no engine version numbers. State the confirmation explicitly in the task report.

- [ ] **Step 4: Commit (agentspec repo)**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/test.md skill/references/evals.md
git commit -m "test/evals: band + prediction semantics under the prose-only ungoverned baseline"
```

---

## Self-review notes

- Spec coverage: mechanics 1–3 → Task 1 (closure + byte-identity gate; seam already verified — no runtime change needed, `prompt.ts:94` honors the override); CLI/artifacts → flag/label untouched by construction, docstring in Task 1 Step 3, tutorial in Task 2; skill → Task 3 (`synth-fork.mjs` inherits the strip with zero edits — verified it calls `evalPkg.stripGovernance`); tests a/b/c → Task 1 (a: byte-identity assert; b: unchanged test 02; c: chains/exhaustion/cross-check asserts; mutators covered by the guard-count-0 assert).
- Old-runs note ("BACKLOG at the next measurement campaign") is deliberately NOT a task — it triggers at campaign time, not now.
- No export-surface change → no surface-lock rider; Step 4 of Task 1 runs the lock test to prove it.
