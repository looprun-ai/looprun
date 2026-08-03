# Mandatory intention + red-team hardening — design addendum

Date: 2026-08-03 · Status: user-approved · Extends `2026-08-02-structured-claims-guards-redesign.md`
· Repo: looprun (+ agentspec) · Pre-1.0: disposable.

## Why this addendum

The re-chartered red-team broke the SCG surface (verdicts:
`.superpowers/sdd/redteam-verdicts.md`). Two findings were paradigm-level: the free `message`
prose channel (P1) and the bare `asked` boolean (P2) were unverified agent-declared channels. The
user's resolution: **there is no unstructured intention.** Every `respond` declares ≥1 intention,
enforced in the schema; the natural-language `message` is REDEFINED as the SURFACE of declared intentions
rather than a side-channel — a rule the model is bound to, not a mechanism that enforces it. The `message`
is still shipped verbatim, so it CAN carry an assertion the structure does not (see the precise statement
below); what mandatory declaration removes is the ability to do so by accident.

The guarantee is precise (not overclaimed): a REAL action can never be hidden or fabricated
(deterministic — structure + ledger check). An operational LIE in prose is not deterministically
blocked, but mandatory declaration turns it into an explicit self-contradiction — the model is
FORCED to classify its own output, so it cannot lie "by accident"; a deliberate lie is a
mislabel a `did × message` `llmCheck` catches. `did` empty was the cover for the accidental case;
`.min(1)` removes it.

## Decisions

### D1 — `did` is mandatory (`.min(1)`)
Every `respond` carries ≥1 intention. Enforced in BOTH the terminal tool schema (`terminal.ts`)
and `validateClaims` (`claims.ts`). An empty `did` is rejected at the schema boundary — there is no
"honest empty" turn. A greeting, an answer, a refusal all DECLARE their intention.

### D2 — the intention `op` vocabulary is partitioned
`Intention = { op, target?, outcome?, amount? }`. Two disjoint families:
- **SPEECH ops** — engine-core, domain-neutral, RESERVED: `inform`, `greet`, `refuse`, `ask`.
  A speech act, NOT backed by a tool; NOT grounded against the ledger; carries no action outcome.
  It classifies the `message`'s speech act.
- **ACTION ops** — domain-declared, backed by a tool/write; MUST carry an `outcome` (core or
  domain-mapped); grounded by `claimIsGrounded`/`claimIsComplete` against the ledger.

Partition rule: an intention is SPEECH iff `op ∈ {inform, greet, refuse, ask}`, else ACTION. The
four speech-op names are reserved core vocabulary a domain may not redefine.

### D3 — `ask` replaces the bare `asked` boolean (P2 closes)
The `asked: boolean` field is DELETED. Asking is declared as an `ask` speech-intent in `did`; the
`message` carries the question. `isAskEvent(respond) = did.some(i => i.op === 'ask')`. Every consent
guard (`confirmFirst`, `pendingConfirmMustAsk`, `askedEarlier`) and `HistoryTurn` re-key to "the
turn's `did` carried an `ask` intent." Marking a question now requires DECLARING an ask intention —
consistent with every other intention; the forcing-function + `llmCheck` covers the residual.

### D4 — the tool SPECIFIES the ops, especially the `inform` guardrail
The `respond` tool's `op` field names the two families — an ACTION op, which requires an `outcome`,
and the four reserved SPEECH ops, which carry none. `inform` gets an explicit guardrail, verbatim:
> `inform` NEVER asserts an action you performed — a performed action is declared as that action's
> op, which is verified.

The guardrail carries exactly two clauses because both are load-bearing: the PROHIBITION (`inform`
may not stand in for a performed action) and its REPLACEMENT plus the reason (the action's own op,
which the ledger cross-check verifies). The other speech ops are named, not glossed — `greet`,
`refuse` and `ask` mean what the words mean, and only `ask` carries a consequence worth stating (the
ONE question, posed in `message`). Every line here is read on every turn of every agent, so a
sentence earns its place by being one the model needs to READ: a rule a guard enforces is
discoverable from the correction the model gets back.

### D5 — the honesty cross-check applies to ACTION intents only
`claimIsGrounded` grounds each ACTION intent against the ledger (unchanged mechanism). Speech
intents render/classify but are not tool-checked. `claimIsComplete` still forces every effected
write to be covered by an ACTION intent with a `success`-resolving outcome — so a real action can
NEVER hide behind an `inform`/`greet` (the uncovered write fires the guard). The renderer emits the
operation report from ACTION intents; speech intents do not add a rendered operation line (the
`message` is their surface).

### D6 — optional `did × message` consistency `llmCheck` (the backstop, not auto-installed)
A documented, available `llmCheck` rubric — "does the message assert an operation the `did` does not
carry, or contradict a declared intention?" — that a domain installs where the stakes justify it
(financial, health). It is the priced backstop for the prose-misuse residual, never mandatory, never
the primary guarantee.

## Folded-in red-team fixes (M1–M9, m10; from `redteam-verdicts.md`)

Each red-team PoC becomes a permanent regression test.
- **M1** `matches()` substring → whole-value / token-boundary equality (kills `ORD-2`↔`ORD-25`,
  `BK-1`↔`BK-10` in grounding, completeness, and `claimCoversRubric`).
- **M2** `claimMatchesCall` scans agent-authored args → ground only against WORLD-issued
  result/identity values; drop `leafValues(c.args)` from the match set (kills circular grounding).
- **M3** target-less claim covers N writes → `claimIsComplete` requires `claim.target` defined AND
  spends each claim once (occurrence, not existence).
- **M4** `isEmptyReadResult` skips status-like keys before the nested-object check → only skip a
  status key whose value is a scalar/boolean.
- **M5** `deriveClaimsFromLedger` positional label misalignment → attach each produced label to its
  own call; reads do not feed the write-label stream.
- **M6** `deriveClaimsFromLedger` branch order → check `tookEffect` before `requiresConfirmation`.
- **M7** `destructiveThrottle` `isProbe` keys on `confirmed:false` → a write that `tookEffect` is an
  effect regardless of the flag.
- **M8** premature-terminal ask leak → add `prematureTerminalCalls(steps)` + prune from `observed`
  in the premature branch (both backends), symmetric with the superseded prune. (Also `ctx.asked`—
  now `ctx` ask-intent — authoritative in `pendingConfirmMustAsk`.)
- **M9** blank floor → category-based strip (Cf + default-ignorable) before the emptiness test.
- **m10** `resolveOutcome` shadow-law case-sensitive → reject any OutcomeMap key whose lowercased
  form is a core word (spec-load assertion). (`amount` ungrounded / `no_op` vacuous — documented
  LOW, addressed only if a domain surfaces them.)

## Out of scope
Re-measurement; porting old bundles. The three "options" from the design chat (message
suppressed / fully structured) are NOT taken — D1–D5 (mandatory intention, message as speech
surface) is the chosen form.
