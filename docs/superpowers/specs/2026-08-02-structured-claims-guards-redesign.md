# Guards redesign from zero — structured turn-claims + ledger cross-check

Date: 2026-08-02 · Status: **SUPERSEDED — historical record of the approved direction** · Repo: looprun
(+ agentspec) · Pre-1.0: disposable.

> **SUPERSEDED by `2026-08-03-mandatory-intention-design.md` and its verdicts.** This document records the
> direction as approved on 2026-08-02; the shipped surface moved past it. Read the design addendum and
> `packages/core/GUARDS.md` for the law. What is stale here, specifically:
>
> | in this doc | what shipped |
> |---|---|
> | `asked?: boolean` on `respond` (§"Core mechanism"), and `did.asked` | DELETED — asking is an `ask` INTENTION inside `did` (`hasAskIntent` is the only reader) |
> | `did` optional | MANDATORY, `.min(1)`, with a speech/action partition on `op` |
> | `degenerationGuard` listed as a delete candidate | it ships |
> | "a fabricated claim cannot reach the user" | true of the engine-rendered operation REPORT only; the agent's `message` still ships verbatim beside it |

## Why from zero

The red-team broke text-scanning guards structurally: `replyMentions('BK-1')` passes on
"Não encontrei BK-1" — a literal check cannot read polarity, and no better pattern fixes it
(patterns are the banned fragility). The reliable guards were already the STRUCTURAL ones
(confirmFirst-on-args, maxCalls-on-counts, requiresBefore-on-call-log). Conclusion: the reply
prose must stop being the thing guards read. The agent DECLARES what it did, structured, and
the engine cross-checks the declaration against the WORLD LEDGER — which the agent does not
control. A guard that cannot be made sound this way is deleted (a guard failing 0.1% is worse
than honest absence — user law).

## Core mechanism (engine-owned)

The turn terminal is structured:
```ts
respond({
  message: string,                 // NON-operational prose only (greeting, explanation)
  did: TurnClaim[],                // the agent's structured claim of operations this turn
  asked?: boolean,                 // this turn poses a question (for two-step/ask gates)
})
type TurnClaim = { op: string; target?: string; outcome: Outcome; amount?: number }
type Outcome =   // CORE, domain-neutral, ledger-checkable
  | 'success' | 'failure' | 'not_found' | 'blocked' | 'refused'
  | 'pending_confirmation' | 'no_op'
```

**The user-facing operation report is RENDERED BY THE ENGINE from `did`** (verified first).
The agent's free `message` may not assert operations — the operational sentences the user reads
come from ledger-verified structure, so a fabricated claim cannot reach the user THROUGH THE REPORT.
(As shipped: `composeDelivery` ships the agent's `message` verbatim beside that report, so an operational
assertion written in prose is a priced residual, never a blocked one. See the supersession note above.)

### The cross-check guards (deterministic, ledger-grounded — the new honesty core)

| guard | check (over `did` × `world.toolCalls`) |
|---|---|
| `claimIsGrounded` | every `did` with `outcome:success` has a matching write call with `tookEffect:true` targeting the same entity; `failure`/`blocked`/`refused` match an `ok:false`/veto; `not_found` matches a read returning empty; `no_op` matches no write. Mismatch → violation. |
| `claimIsComplete` | every write that `tookEffect:true` this turn appears in `did` (no silent action hidden from the user). |
| `claimCoversRubric` | rubric-declared targets appear in `did` with the required outcome polarity (replaces replyMentions/replyConfirmsLabels — polarity is a FIELD). |

These resurrect the 8 deleted honesty guards AS DETERMINISTIC (they were fragile only because
they scanned prose). `op` names are advisory labels; the check keys on `target` + `outcome` vs
the ledger, never on op-name semantics.

## Three-tier classification (ALL 23 guards re-derived)

```
① STRUCTURAL / LEDGER   sound & deterministic — the default home
   honesty (claimIsGrounded/Complete/CoversRubric) · confirmFirst · destructiveThrottle ·
   requiresBefore · precondition · consentRequired · maxCalls · noDuplicateCall · argRequired ·
   argAbsent · argFormat · resultInvariant · askedEarlier · noActAfterAskSameTurn ·
   pendingConfirmMustAsk (now: did.asked reflects a pending simulate) · forbidThisTurn

② llmCheck              ONLY no-ledger-signal semantics (e.g. "gave legal advice?", "tone")
   the honest small residual; declared explicitly per subject

③ DELETE                cannot be ① or ②, or fails a red-team break with no sound fix
   candidates surfaced by the rewrite: replyMentions, replyConfirmsLabels, replySingleQuestion,
   replyMaxOccurrences, degenerationGuard (artifact-only — keep as a RENDER lint, not a claim),
   jargonScrub (mutator, keep — deterministic egress rewrite), emptyReply (subsumed: the
   engine renders from did, an empty did+message is a no_op claim). Each deletion RECORDED with
   the break that justified it.
```

Every value-shape red-team break (argFormat non-string, argRequired []/{}, argAbsent null,
emptyReply zero-width) is fixed by construction in the rewrite (strict typed checks, not
`typeof`/`trim` guesses). The runtime breaks (D2 adjudicator shape-validation, D4 sibling in
observed, D5 postTool-violation persistence) are fixed in the same rewrite.

## Layering (engine core + agentspec extends)

- Engine owns: the `TurnClaim`/`Outcome` core, the cross-check guards, the did→message renderer.
- agentspec extends: domain `op` vocabulary; domain outcome values that **MUST declare a
  core-outcome mapping** (`'settled' → 'success'`) so the ledger cross-check stays engine-owned
  and never becomes semantic; domain coverage/polarity rules over the structure.
- The no-regex law stands; no guard reads conversation text except llmCheck (②).

## The red-team, re-chartered (the certification IS the failure to break)

- Charter: **prove a forbidden thing passes.** Run to exhaustion. A clean sheet AFTER genuine
  adversarial effort is the certification — not "tests passed".
- A verdict "unbreakable only by removing ambiguity X" is a FINDING: structure X (→①) or delete
  the guard. "Impossible to make sound" is the signal we are hunting.
- Attacks must include: agent lies in `did` (ledger catches) · agent omits a `did` for a real
  effected call (claimIsComplete catches) · structure correct, prose contradicts (the REPORT is
  engine-rendered, but the `message` beside it is not — this became the priced residual, not an
  impossibility) · every prior batch-a/b/c/d vector re-run against the new surface.
- Red-team runs as multiple independent adversaries per guard; their break tests become
  permanent regression. No guard ships until its adversary reports "could not break, and here is
  why it is structurally impossible."

## Deliverables (phased)

1. Engine core: `TurnClaim`/`Outcome`, structured `respond` terminal, did→message renderer.
2. The three cross-check guards + re-derivation of tier ①; delete tier ③ (recorded); llmCheck ② unchanged.
3. agentspec: domain vocabulary extension + mapping law; template + norms + guard-catalog rewrite; leak-review.
4. Re-chartered red-team over the new surface; break-tests → regression; per-guard impossibility statement.

## Out of scope

Re-measurement (happens when the user wants a number); porting old TS bundles (regenerated).
