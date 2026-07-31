# Prose-only ungoverned arm — design

Date: 2026-07-31 · Status: approved · Repos touched: looprun (engine), agentspec (skill docs)

## Problem

Today's ungoverned arm (`stripGovernance`) empties `spec.guards` — and because the trunk
renderer derives ALL rule prose from the guards ("no guard prose outside the trunk"),
emptying the guards deletes the **prose and the check at once**. The control arm is an
agent that was never told the rules. No real team builds that agent: a developer without
looprun still writes the rules into the prompt in natural language. So `governed −
ungoverned` measured "rules exist vs. rules don't" — a strawman — instead of the product's
actual claim: **what deterministic enforcement buys over a well-prompted agent**.

The naked arm's only irreplaceable job was raw non-vacuity ("does this rule change
anything at all"), and the prose-only baseline answers that question almost as well (a
case both arms pass does not bite, whatever the baseline). Decision: **prose-only
REPLACES naked** (option B′). No third arm; naked dies with no alias.

## The new semantics

```
ungoverned (new) = the SAME agent, the SAME system prompt (byte-identical to governed),
                   run with the enforcement layer disarmed.

governed − ungoverned = the deterministic-enforcement premium. The honest number.
```

### The cut (confirmed)

| mechanism | new ungov | rationale |
|---|---|---|
| Full trunk (voice, scope, core rules, flow, tool/reply/input rules, governance, behavior) | **ON** | the prose — the "traditional agent" |
| Guard hooks (veto, redrive, deny) | OFF | the check |
| `onReplyMutate` (egress rewrite) | OFF | deterministic check with no prose |
| `controls.chains` (forced tool order) | OFF | enforcement; the order is already prose in `## Flow` |
| `exhaustionReply` | OFF | fallback of the redrive mechanism — without redrive it does not exist |
| `assertDestructiveConfirmable` (destructive cross-check) | OFF | check |
| `stateBlock` on the tail, terminal policy, maxSteps, sampling | ON | loop mechanics, identical in both arms |

## Mechanics (engine, `@looprun-ai/eval`)

`stripGovernance` is rewritten around **two views of the same spec**:

1. **Prompt view**: render the trunk of the FULL spec (`renderScopedSpecTrunk`) and pin
   the result as the arm's system prompt via `surface.systemPrompt`. If the runtime does
   not honor a `surface.systemPrompt` override, expose that seam in
   `runSpecConversation` — verifying which is the FIRST implementation step.
2. **Loop view**: the spec that runs the loop carries empty `guards`, no `chains`, no
   `exhaustionReply`, no `assertDestructiveConfirmable`, no mutators — the cut above.
3. **Byte-identity gate**: a test asserts the ungov arm's assembled system prompt equals
   the governed arm's, byte for byte. This invariant IS the design; if it cannot hold
   (e.g. the override seam renders differently), the implementation is wrong, not the test.

## CLI / artifacts

- Flag stays `--ungoverned`; arm label stays `ungoverned` in dumps (no compat concern
  before 1.0 — the name is kept because it is still the right name).
- `ungoverned.ts` docstring and tutorial §5.6 rewritten: "same agent, same prompt, minus
  the checks". The old §5.6 fairness claim ("attributable to governance and nothing
  else") becomes true under the new semantics; today it is only true for existence-of-rules.
- Old ungov runs (coworking `test/results/t3i*-ungoverned/`) remain as historical record
  of the old baseline — NOT comparable with new runs. A note goes into the BACKLOG /
  retired section at the next measurement campaign.

## Skill (agentspec repo)

- `references/test.md`: T2 band table + fail class 9 — *discriminates* now means "the
  prose alone does not hold; the check holds". ALARM keeps its shape (ungov passes,
  governed fails) with the sharper reading: enforcement itself cost the product.
- `references/evals.md`: the per-case prediction sentence now predicts a WELL-PROMPTED
  agent's behavior (it knows the rules; will it follow them under pressure?).
- `scripts/synth-fork.mjs` inherits the new strip for free (calls
  `evalPkg.stripGovernance`).
- Leak-review with explicit confirmation on every skill artifact write.

## Tests (engine)

a. Byte-identity of the assembled system prompt between arms.
b. Scripted model violates a rule → governed vetoes (guard event recorded), ungov
   executes (forbidden call reaches the world) — the discriminator preserved.
c. The ungov loop view carries no chains / mutators / exhaustionReply /
   assertDestructiveConfirmable.

## Out of scope

- No re-runs now; re-banding happens at the next measurement campaign.
- No third arm; no `--arm naked`.
- No change to invariant evaluation, fold, cert, or the judge.
