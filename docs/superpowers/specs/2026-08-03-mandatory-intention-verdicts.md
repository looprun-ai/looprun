# MANDATORY INTENTION — PER-GUARD VERDICTS

> **Status: CLOSED — shipped; every act carries its declared word in `said`.**

> **RECORD, not a spec.** Nothing here is owed. One verdict per guard, kept as the acceptance
> artifact of the mandatory-intention design.

**The acceptance artifact of MI-T7.** Four adversaries ran against the mandatory-intention design over
two rounds; three fix waves landed. For every guard in `GUARD_CATALOG` this document records one of two
verdicts, and nothing else:

```
 COULD NOT BREAK   →  and WHY it is structurally impossible, not "we tried and failed"
 BROKEN HERE       →  the vector, and the law that closed it
```

Scope: `packages/core` (branch `scg-structured-claims-guards`). Vectors are named by their PoC ids —
`redteam-r2-{a,b,c,d}.md` and the four PoC files under `packages/core/test/redteam/`. Every "fixed by"
row points at a test that fails if the fix is reverted.

---

## 0 · THE HONESTY GUARANTEE, STATED HONESTLY

This is the sentence the rest of the document supports. It has two halves and they are not equally strong.

```
 ┌─ DETERMINISTIC (a real guarantee, machine-checked every turn) ────────────────────────┐
 │                                                                                       │
 │  A real action cannot be HIDDEN     — every write whose effect the world attested     │
 │                                       must be covered by a distinct, entity-naming    │
 │                                       success intention, or the turn cannot deliver   │
 │                                       the model's prose at all.                       │
 │                                                                                       │
 │  A real action cannot be FABRICATED — every declared operation is grounded against    │
 │                                       the action history the agent does not control; a claim  │
 │                                       naming an entity the turn never touched denies. │
 │                                                                                       │
 │  The OPERATION REPORT is engine-owned — the operational sentences the user reads are  │
 │                                       rendered from the verified declaration, on the  │
 │                                       clean path, the salvage path and the exhaustion │
 │                                       path alike. A domain override supplies a        │
 │                                       closing SENTENCE; it can never replace the      │
 │                                       report.                                         │
 │                                                                                       │
 │  Every FINALIZED turn DECLARES     — no turn that goes through `finalizeReply`        │
 │                                       carries zero intentions, and none is blank or   │
 │                                       invisible. SCOPE: it is a `finalizeReply`       │
 │                                       property, not a universal one.                  │
 │                                       `LoopRunAgent.stream()` runs no reply           │
 │                                       finalization, so a streamed turn can seal       │
 │                                       `did: []` over an empty reply. That fails       │
 │                                       CLOSED for consent (an empty `did` carries no   │
 │                                       `ask` and licenses nothing), but the sentence   │
 │                                       above is not true of it.                        │
 └───────────────────────────────────────────────────────────────────────────────────────┘

 ┌─ NOT DETERMINISTIC (a forcing function + an OPTIONAL model call) ─────────────────────┐
 │                                                                                       │
 │  PROSE MISUSE      — the `message` beside the declaration is free text. An agent can  │
 │                      declare an honest `inform` and still WRITE that it refunded the  │
 │                      order. Assertion and polarity live in prose; no pattern reads    │
 │                      them (that is why the regex honesty kinds were deleted).         │
 │                                                                                       │
 │  THE SELF-DECLARED ASK — `ask` is the one speech intention read as EVIDENCE (it       │
 │                      licenses a later destructive act). The engine can prove the turn │
 │                      was DELIVERED, non-blank, recent and declared `ask`. It cannot   │
 │                      prove the message POSED A QUESTION.                              │
 │                                                                                       │
 │  THE UNBOUND ASK   — nor can it prove the question was ABOUT the thing the ask now    │
 │                      licenses. An `ask` intention names no subject, so one question    │
 │                      on any topic satisfies every consent kind that reads one, for    │
 │                      one turn. Binding it would mean judging what the prose ASKED —   │
 │                      the same non-deterministic judgement as the row above.           │
 │                                                                                       │
 │  What prices the PROSE LIE: the CLOSED OPERATION RECORD, rendered on every finalized  │
 │                      turn without exception — the lines the declaration earned, then  │
 │                      a closure sentence chosen by whether any action was declared.    │
 │                      The engine never judges the prose; it states its own facts       │
 │                      beside it. Measured: it contradicts every one of the 42          │
 │                      hand-adjudicated lies. See                                       │
 │                      `2026-08-04-closed-operation-record-design.md`.                  │
 │                                                                                       │
 │  What prices the TWO ASK ROWS: the forcing function alone — a declaration is          │
 │                      MANDATORY, so a false `ask` is a deliberate self-contradiction   │
 │                      sitting next to the engine's own verified report.                │
 │                                                                                       │
 │  PREVENTION is what is not deterministic here: the engine does not stop the sentence  │
 │  or the declaration. CONTRADICTION is deterministic — its own account always arrives  │
 │  with the delivery. Prevention is NEVER claimed as deterministic. Anywhere.           │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1 · PER-GUARD VERDICTS (all 23 `GUARD_CATALOG` kinds)

### 1.1 The honesty cross-check — the guards the adversaries actually attacked

| kind | verdict | detail |
|---|---|---|
| `claimIsGrounded` | **BROKEN repeatedly, all fixed but one** | the matching core was the round-2 epicentre — see §2's eleven laws. The single exception is 3.1b's grounding half (§3) |
| `claimIsComplete` | **BROKEN repeatedly, all fixed** | same laws; plus wave 3's L10 (the write surface was an intersection of two authorities and a mutation could fall outside it) |
| `claimCoversRubric` | **BROKEN, 2×, both fixed** | r2/§6.5 sentence-shaped target satisfied an id rubric (whole-value matching); r2/b4.4 a shadowed `NOT_FOUND→success` map made a not-found claim satisfy a `success` rubric (shadow law at the factory door) |

### 1.2 The consent family

| kind | verdict | detail |
|---|---|---|
| `confirmFirst` | **BROKEN, 3×, 2 fixed + 1 residual** | r2/C3 simulate→confirm binding was a SUBSET (now set EQUALITY); r2/C4 `via:'ask'` self-licensed its repeat (variant RETIRED); r2/b2.1-b2.2 the licensing `ask` is self-declared — **residual, see §3** |
| `destructiveThrottle` | **BROKEN, 2×, both fixed** | r2/C6 `tookEffect` was INERT in native-tools mode (unknown ≠ simulate; the native path now records); same-step siblings now always count |
| `pendingConfirmMustAsk` | **BROKEN, 1×, partially fixed** | r2/b2.3 a bare `ask` satisfied it while the message said "done". The BLANK-message variant is closed; whether a non-blank message poses a question — **and whether the question was about the pending act** — is the §3 residual. Its observed-scan fallback is DELETED: the delivered `ctx.did` is the only relay signal, and a ctx that seats none fails closed |
| `noActAfterAskSameTurn` | **could not break** | it reads THIS turn's observed ask event and denies a domain call after it — a same-turn ordering fact with no agent-controlled input beyond the ask itself, which can only make the guard FIRE, never stay silent |
| `askedEarlier` | **BROKEN, 1×, fixed + the §3 residual** | r2/C2 it read the RAW `observed` array, so a respond the user never received armed it; the raw-observed variant was DELETED — the licence now rests on a SEALED, non-blank delivered turn. It routes through the same `askedInDeliveredTurn` as `confirmFirst`, so it inherits BOTH §3 ask residuals: the self-declared ask, and the ask bound to nothing (an earlier question on ANY topic licenses recording ANY gated argument — it enforces the two-turn rhythm, not relevance) |
| `consentRequired` | **could not break** | it requires a literal confirm flag on the call's own args; there is no second path to the flag and no normalization step to abuse. Fails closed on absence |

### 1.3 Flow / args / world — structural preTool guards

| kind | verdict | detail |
|---|---|---|
| `requiresBefore` | **could not break** | the predicate is "was `<read>` observed OK this turn", over the runtime's own action history. The agent supplies neither the tool name nor the ok flag |
| `forbidThisTurn` | **could not break** | a set-membership test on the tool name the runtime dispatched; the name is the runtime's, not an arg |
| `maxCalls` | **could not break** | counts action history rows. An agent can only make the count go UP |
| `noDuplicateCall` | **could not break** | canonical-args equality (`canonArgs`) over the same-turn action history. The one abuse — perturbing an arg to dodge the equality — produces a genuinely different call, which is the honest reading |
| `argRequired` / `argAbsent` | **could not break** | presence/absence of a key on the call's own args, decided before the world runs. No value is trusted, so no value can lie |
| `argFormat` | **could not break** | a closed, non-regex format vocabulary over the arg's own value; a failure denies. No fail-open branch exists |
| `precondition` | **could not break** | a closed expression over WORLD state (`{count:…}` / `{limit:…}` / a named host ref). The agent contributes nothing to either side; a ref that does not resolve throws at LOAD |
| `resultInvariant` | **could not break** | reads the tool RESULT after execution and can only add a correction. It cannot be silenced by anything the agent writes, because it never reads args or prose |

### 1.4 Reply-shape

| kind | verdict | detail |
|---|---|---|
| `degenerationGuard` | **could not break** | an artifact-shape lint over the reply text. It is FORM-class by design: it never asserts anything about the world, so "defeating" it costs the agent nothing it wanted and gains nothing it did not already have |
| `jargonScrub` | **could not break** (mutator) | a deterministic term rewrite with no verdict. Its only failure mode — blanking the delivery — is caught by the engine's blank floor (r2/A-V11 HELD) |

### 1.5 The model-adjudicated pair

| kind | verdict | detail |
|---|---|---|
| `llmCheck` | **BROKEN, 1×, fixed** | r2/A-V8 an unreachable adjudicator was indistinguishable from an approving one. Every unreachable adjudicator now records `llmcheck-unreachable:<failMode>`, at either fail mode. Its `'open'` DEFAULT is kept — it is an author-bound lint |
| `didMessageConsistency` | **BROKEN, 1×, fixed** | same vector, worse consequence: this is the residual's only named mitigation, so a silent fail-open DELETED the guarantee. Its default is now `failMode:'closed'`; `{failMode:'open'}` is an explicit availability opt-in |
| `custom` | **could not break** (by construction) | a host-authored predicate. The engine's contribution is the frontier ruling: an UNKNOWN behaviour kind is TRUTH-class, so a custom guard's veto is never delivered over. That default is the safe one and was verified (r2/A) |

---

## 2 · WHERE THE HONESTY CORE WAS BROKEN, AND THE LAW THAT CLOSED IT

Wave 1's disposition table lists 25 vectors against the matching core (24 flipped, 1 left by design).
They collapse into nine laws. Each row is "the thing that used to work" → "why it cannot now".

| # | law | it used to be possible to… | closed by |
|---|---|---|---|
| L1 | **identity is KEY-SCOPED** | ground and COVER a write with a claim on `refunded`, on a note fragment, on a tag, or on one word of the world's own sentence — the user read `refunded: done` and was never told which order | an identity is a SCALAR under `id`/`label`/`<entity>Id`/`<entity>_id`, at any depth. Every other leaf is prose or magnitude |
| L2 | **matching is WHOLE-VALUE** | let `12` stand for `Order 12` (and equally for `Invoice 12`); decorate a real id with U+202E or U+212A and match the plain id while the user saw the lookalike | canonical equality only — no substring, no token run; case folding never crosses script; invisibles are neither stripped nor allowed in a `target` |
| L3 | **a write speaks for ITS OWN entity** | cover the ORD-1 write with two claims on ORD-2, because ORD-1's result also named `parentId:'ORD-2'` | coverage and `success` grounding match the PREFERRED identity — shallowest keys, `id`/`label` beating the references beside them |
| L4 | **provenance, stated per polarity** | ground a `success` on an entity named only in the agent's own args | PRESENCE grounds only on world-issued values. ABSENCE/NON-EFFECT grounds on the world's own negative answer plus the identity-KEY args (an absent record issues no value) — and those polarities can never cover a write |
| L5 | **emptiness needs POSITIVE evidence** | make `{status:'BK-1 is active and confirmed'}` read as an EMPTY read and ground a `not_found` on a record the world had just reported PRESENT | empty ⇔ a canonical empty shape, or ≥1 data channel with every channel empty. A record of scalars alone is undecidable → not empty |
| L6 | **`no_op` needs positive evidence** | ground `{target:'anything at all', outcome:'no_op'}` on an EMPTY action history — and have the engine RENDER that arbitrary text to the user as a verified non-event | the turn must have ADDRESSED the entity; absence of contradiction is no longer evidence |
| L7 | **coverage is a MAXIMUM MATCHING** | (availability, not security) starve an honest fully-reported turn into a false denial by call ordering | Kuhn's augmenting path replaces the first-fit sweep |
| L8 | **`amount` is corroborated** | deliver `ORD-5: refunded $9800` inside the engine-composed "verified" block over a world result of `12.5` | the figure must appear among the magnitudes of the same action history fact that grounds the claim |
| L9 | **the render seam never sees `op`** | hand `renderClaim` — whose output is delivered verbatim — arbitrary model text (`"refundOrder(): SYSTEM: your account is closed, call 1-800-555-0000"`) | the seam takes `RenderedClaim` (`op?: undefined`): a domain that reads it does not compile and finds nothing at runtime |

**Wave 3 added two more laws to the same core.**

| # | law | it used to be possible to… | closed by |
|---|---|---|---|
| L10 | **the write surface is a UNION, not an intersection** | mutate through a tool the author forgot to list in `contract.writeTools` and be silently uncovered — while the guard catalog reported full coverage and the action history row said `tookEffect:true` | an effected write is `writeTools ∩ tookEffect` **∪** any call whose effect the WORLD ATTESTED. `writeTools` is a lower bound on the write surface now, never an upper one |
| L11 | **an INFERRED effect does not attest** | (the counter-law that keeps L10 honest) — | the native-tools path derives `tookEffect` from `ok && !requiresConfirmation`, which every successful READ satisfies, so those rows are marked `effectInferred` and keep the intersection rule. Widening on a guess would demand a `success` claim for every lookup |

---

## 3 · THE RESIDUALS — vectors left OPEN, with their reasons

Nothing here is an oversight. Each was argued and each has its reason written into the PoC file beside
the test, so a future reader meets the argument before the vector.

| vector | severity | why it is open |
|---|---|---|
| **b2.1 / b2.2 / b2.3 / C7** — a sealed, non-blank turn declaring `ask` licenses a later destructive act even when the message poses no question | HIGH | Whether prose ASKS SOMETHING is a natural-language judgement, and reading it has no deterministic instrument: a linguistic pattern is forbidden by the no-regex law, is defeated by appending one character, and false-denies across languages; a model call is `didMessageConsistency`, which is a judgement, not a proof. The deterministic route does not read the prose at all — it makes the engine RENDER the question from the ask's subject, so declaring an ask is what puts a question on the user's screen (D1/D2 in `plans/2026-08-03-consent-and-elicitation.md`). Until that lands, what IS closed deterministically: the licence rests on a DELIVERED turn record (never a hook-time respond), the sealed `did` belongs to the payload whose message was delivered, the reply must be non-blank, recency is bounded, and a tool no longer self-licenses its own repeat |
| **3.1b** — a `success` claim on ORD-2 grounds while an ORD-1 write also happened | (grounding half only) | Grounding is EXISTENTIAL per claim and the turn really did effect a write on ORD-2, so the claim names a true action history fact. No per-claim rule separates it from the honest single-write case without inventing a claim→write binding, which would false-deny every turn reporting two writes on one entity. **The HARM is a coverage property and coverage is closed** (3.1a denies the turn), so the ORD-1 write can no longer be hidden |
| **the ask is bound to NOTHING** — an `ask` intention names no subject, so an off-topic question satisfies EVERY consent kind that reads one, for one turn: `confirmFirst` `via:'ask'`/`'either'` (batch-b), `askedEarlier` (any gated arg licensed by any earlier ask), `pendingConfirmMustAsk` (an unrelated ask clears a pending destructive confirm while the reply reads "permanently deleted") | MEDIUM | Binding an ask to a RECORD requires the ask to NAME one, and a speech intention deliberately does not (MI-D5). Judging what a question was ABOUT is the same prose judgement as the row above and is closed by the same instrument. Three live BREAK tests pin the three shapes. Closing it is a design decision about the `ask` shape, not a guard fix |
| **A-V6 / A-V7** — the prose lie beside an honest declaration | PREVENTION open, CONTRADICTION closed | The engine does not stop the sentence — assertion and polarity live in prose. What it does deterministically is deliver its own account beside it: the CLOSED OPERATION RECORD ships on every finalized turn, and its closure sentence is chosen by whether any action was declared, so V7's sharp edge (a speech-only `did` renders no report) is removed — that turn now carries "No operation was carried out on this turn." Measured against all 42 hand-adjudicated lies: every one is contradicted. Design: `2026-08-04-closed-operation-record-design.md` |
| **`amount` unit naivety** | LOW | A domain whose world reports cents while its claims report units will false-deny. The corroboration compares raw numbers and knows no unit. Stated as a **Limit** on the `amount` bullet in `GUARDS.md`, not solved |
| **`not_found`/`no_op` read agent-authored args** | LOW | L4's deliberate widening. An agent can call a read with a fabricated identity-key arg and report `not_found` on it. Closing it needs the attempt record to carry a GUARD-RESOLVED subject rather than raw args — the same structural change 4.1's residual needs. One change would close both; it is larger than a fix wave |

---

## 4 · THE FORCING FUNCTION — what makes the residual survivable

The prose residual is bounded by three things that ARE deterministic, and it is worth being precise about
what each buys.

```
  the model must classify its own output          a lie is now a deliberate self-contradiction,
  ── MI-D1: `did` is MANDATORY ─────────────►     not an omission. There is no "said nothing"
                                                  state left to hide in.

  a speech act cannot cover an action             an effected write can never be absorbed by
  ── MI-D5: the partition ─────────────────►      `inform`/`greet`/`refuse`/`ask`, so the lie
                                                  cannot ALSO suppress the report.

  the report ships beside the prose                on EVERY finalized turn, action or not, the
  ── the engine composes the delivery ──────►      verified account is on the same screen as the
                                                  claim that contradicts it.
```

A turn where **nothing happened** (V7) is covered by the same mechanism: the record is closed, so it
renders "No operation was carried out on this turn." rather than nothing at all. Design and
measurement: `2026-08-04-closed-operation-record-design.md`.

---

## 5 · ROUND-2 ACTION HISTORY

```
 PoC file                       it.fails at 32e173d   remaining   flipped
 ─────────────────────────────  ───────────────────   ─────────   ───────
 redteam-r2-matching.test.ts            20                1         19
 redteam-r2-partition.test.ts           14                3         11
 redteam-r2-consent.test.ts             10                1          9
 redteam-r2-inform.test.ts               5                0          5
 ─────────────────────────────  ───────────────────   ─────────   ───────
 TOTAL                                  49                5         44
```

The 5 remaining are §3's first two rows: four are the SAME residual (the self-declared `ask` — b2.1,
b2.2, b2.3, C7) and one is 3.1b's grounding half. Each carries its argument in the test file.

| wave | commit | charter |
|---|---|---|
| 1 | `55c2f40` | the matching core — identity, boundary, provenance, emptiness, `amount`, the render seam |
| 2 | `8a777fd` | consent + turn sealing — the delivered-turn record, simulate equality, terminal acceptance, native-mode effect |
| 3 | this commit | declaration validity, the write surface, the exhaustion report, the llmCheck fail mode, the shadow-law call sites |

---

## 6 · WHAT A DOMAIN OWES THE ENGINE

The guarantee is a contract, and half of it is the domain's. Every row fails CLOSED if skipped — the
cross-check finds nothing to match, the guard fires, the turn redrives, and the engine closure delivers.
The authoritative list lives in [`packages/core/GUARDS.md`](../../../packages/core/GUARDS.md); it is
summarised here because a verdict document that omitted it would overstate the guarantee.

| obligation | consequence of skipping |
|---|---|
| **the domain DECLARES `contract.writeTools`** | this is the switch. `claimIsGrounded`/`claimIsComplete` auto-install only when it is non-empty, so a contract-less or `writeTools`-less domain gets NO cross-check at all — the guarantee is simply absent, and nothing announces its absence. It is the first obligation because every row below is conditional on it. Note the eval `norms-config` path has no `writeTools` key at all, so a benchmark subject configured that way runs uncross-checked |
| every WRITE result names what it touched under `id`/`label`/`<entity>Id` | no `success` claim can ground and no write can be covered |
| the identity value EQUALS the entity name the agent will report | whole-value matching; an id inside a longer label does not match |
| every READ takes its subject under an identity-key ARG | a `not_found`/`no_op` has no way to name its subject |
| an EMPTY read returns a data channel (`data: []` / `found: false`) | emptiness is undecidable and fails closed |
| the world records `tookEffect` HONESTLY — true for a call that changed something, **false for one that did not, reads included** | a read attested as effectful is demanded in the report; a mutation recorded as effect-free can be hidden |
| every turn is SEALED with the reply the user received | an unsealed turn is not consent evidence |
| write results report their magnitudes when the domain renders `amount` | the figure cannot be corroborated |
