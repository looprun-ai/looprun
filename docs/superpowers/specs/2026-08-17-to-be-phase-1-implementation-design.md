# TO-BE Implementation — Phase 1 Build Design

> **CLOSED — merged to `main` (`4996432`).** The phases after it built on this base.

The TO-BE design itself is `2026-08-12-to-be-blueprint-v3.md` (amended, adversarially
verified). The execution shape — fresh build, five phases, per-phase gates, the old engine
alive until the final swap — is `docs/superpowers/refactoring.md`. This document designs the BUILD of
phase 1 and fixes the cross-phase decisions every later phase inherits. Phases 2–5 each
get their own build design when their turn comes, informed by what the prior gate revealed.

```
 phase │ builds                                    │ gate
───────┼───────────────────────────────────────────┼──────────────────────────
  1    │ contract leaf + ports + THE turn machine  │ scripted-model proofs
       │ ← THIS DOCUMENT                           │ (no network)
  2    │ consent · honesty · disclosure · masking  │ MVP cases, hostile world
  3    │ LoopRunAgent facade + server + mastra     │ hermes-sim
  4    │ eval harness + atlas subject port         │ validate + lints green
  5    │ the arbiter                               │ FULL Atlas ≥ 85/100
```

---

## 1 · CROSS-PHASE DECISIONS

These four decisions bind every phase, not only phase 1.

### 1.1 The fresh build lives at `packages/next/*`

A parallel package tree under a temporary scoped name. Phase 1 creates
`packages/next/core` as `@looprun-ai/next-core`; phase 3 adds `packages/next/mastra` and
`packages/next/server` the same way. The old engine at `packages/core` (and its siblings)
is never touched.

The swap (end of phase 5, ONE commit): move each `packages/next/<name>` to
`packages/<name>`, restore the final package name `@looprun-ai/<name>`, rewrite the import
specifiers, delete the old packages.

Why a parallel tree and not a subdirectory of the old package or a separate repo:

| property | how the parallel tree pays it |
|---|---|
| new-tree lints have a natural border | every structural lint scopes to `packages/next/**` from day 1 and goes repo-wide at the swap |
| phase 3 spans several packages | server and mastra get TO-BE versions too — one directory holds them all under one convention |
| the package's dependency surface is one line | `next-core` has its own `package.json` with a single declared dependency (zod), reviewable at a glance; the L0 leaf's "imports NOTHING" law is the layer lint's job |

### 1.2 One branch per phase

Each phase is built on its own branch (`to-be-phase-1`, `to-be-phase-2`, …) and merges to
main exactly when its gate passes. Main therefore only ever contains phases whose gate is
paid. The merge is trivial by construction — the branch only adds files under
`packages/next/`.

### 1.3 The §11 name gate is scoped until the swap

The blueprint's §11 rename register makes every retired identifier (`say`, `view`,
`intake`, `toolDefs`, …) a build failure. While the old engine lives, that law
applies to `packages/next/**` only — the old engine legitimately still carries the old
names. At the swap the gate goes repo-wide, which is what makes the old vocabulary
physically unable to survive the deletion commit.

### 1.4 Docs and skill are untouched during phases 1–4

`docs/superpowers/refactoring.md`'s own law: the R11 skill+tutorial update is paid ONCE, at the swap.
During the build phases the only documents that change are the specs and plans under
`docs/superpowers/`. README, `docs/tutorial/**`, `GUARDS.md` generation, and the
`agentspec` skill all update in the swap move, against the finished engine.

---

## 2 · THE PHASE-1 CUT

`docs/superpowers/refactoring.md` names phase 1 "contract leaf + ports + THE one turn machine".
In blueprint classes, the exact border:

```
INSIDE phase 1                            │ OUTSIDE (owner)
──────────────────────────────────────────┼──────────────────────────────────
contract/ WHOLE                           │ ConsentDesk ─────────┐
  vocabulary.ts · ports.ts ·              │ HonestyCheck         │ phase 2
  CanonicalCall                           │ DisclosureDesk       │ (they ARE
                                          │ Masker · Judge       │ the phase-2
run/ — the machine walking                │                      │ name)
  Engine · Turn · CallRunner ·            │ cards/ REST          │
  Rulebook · StatusClerk ·                │  (AgentFactory,      │ phase 2
  ActionHistory · Session ·               │  CardCheck,          │
  ModelSeat · PromptWriter ·              │  SurfaceGate,        │
  FinishDesk · DeliveryWriter             │  Wordings, the other │
                                          │  catalog species)    │
cards/cards.ts + cards/facts.ts —         │ world/ (WorldBuilder,│ phase 2
  the L1 TYPE modules (declarations,      │  WorldGates,         │
  no logic): Guard · Limits ·             │  PatchDesk) — incl.  │
  CompiledAgent · SurfaceFacts · ToolFact │  world.ts vocab      │
cards/catalog.ts — SEED: exactly the 4    │ facades/server       │ phase 3
  phase-1 species                         │ eval/ (real)         │ phase 4
                                          │
proof fixtures                            │
  ScriptedModel · hostile ToolPort stub · │
  RecordsPort stub · hand-built           │
  CompiledAgent                           │
```

Three consequences of this cut, stated so no task discovers them mid-build:

1. **`CompiledAgent` is hand-built — `AgentFactory` does not exist yet.** `Engine.create`
   takes `{ compiled: CompiledAgent; toolPort; recordsPort; seat }`. Phase-1 proof
   fixtures construct the `CompiledAgent` value directly, which is exactly why the rest
   of `cards/` can wait for phase 2 without blocking the machine.

2. **`Turn` and `CallRunner` grow per phase — phase 1 builds the walk without desks.**
   The phase-1 walk: input guards → model loop → finish checks and bounded redrives →
   compose → seal. The consent steps of the full walk (consume typed codes, licensed
   calls, sweep expiries) and the `hold`/`simulate` verdict routes arrive WITH ConsentDesk
   in phase 2. Phase-1 `CallRunner` routes `refuse` · `owe` · `restate` · `allow`. The
   `owe` route pays the debt with ONE forced micro-step — single-tool surface, the
   session's own seat fills the read's args; the engine never derives another call's
   arguments — and an unpaid debt refuses with the owning rule, so the turn always
   answers the user.
   Phase-1 `DeliveryWriter` composes record lines, denials and the closure — the Masker
   collaborator and the rewrites arrive in phase 2.

3. **Guards in phase 1 = the complete PIPE + one species per verdict route.** The four
   Rulebook phase arrays (input/preTool/postTool/reply), first-non-allow-wins on
   input/preTool, collect-all on postTool/reply, and `guards()` returning the SAME arrays
   the checks iterate — all phase 1. The species live where they live forever —
   `cards/catalog.ts` (§5.2 homes the author-called factories AND the auto set in this
   module). A fixture never hand-rolls a species' semantics: `onlyAfter` and `maxCalls`
   are author-called factories the fixtures call; `noDuplicateCall` (always-on floor) and
   `argRequired` (schema-auto) are auto-installed species — with `AgentFactory` absent,
   the fixtures perform its derivation by hand and install all four into the frozen
   arrays a `CompiledAgent` carries. The phase-1 seed is exactly the four species that
   exercise each verdict route:

   | species | proves |
   |---|---|
   | `onlyAfter` | `owe` (read prerequisite → engine-side reads) and `refuse` (write prerequisite) |
   | `maxCalls` | `refuse` with scope + reason |
   | `noDuplicateCall` | `restate` — first result restated, no re-execution |
   | `argRequired` | schema-auto instantiation + loud coercion rejection |

   Every other species enters with its host mechanism (judged species with `Judge` in
   phase 2, pattern factories with `cards/`, consent species with `ConsentDesk`).

---

## 3 · SCAFFOLD

```
packages/next/core/
├── package.json          @looprun-ai/next-core
│                         deps: zod (FinishDesk's z.strictObject) — and NOTHING else
├── tsconfig.json         strict, extends the repo base
├── eslint.config.js      the R2.8 law, failing the build:
│                         @typescript-eslint/no-explicit-any at error (no
│                         eslint-disable for it anywhere) · no-unsafe-assignment ·
│                         no-unsafe-return on src/**
├── src/
│   ├── contract/         vocabulary.ts · ports.ts · canonical-call.ts
│   ├── cards/            cards.ts · facts.ts (L1 type declarations) ·
│   │                     catalog.ts (seed: the 4 phase-1 species)
│   └── run/              engine.ts · turn.ts · call-runner.ts · rulebook.ts ·
│                         status-clerk.ts · action-history.ts · session.ts ·
│                         model-seat.ts · prompt-writer.ts · finish-desk.ts ·
│                         delivery-writer.ts
└── test/
    ├── lint/             the 3 structural lints
    ├── fixtures/         scripted-model.ts · hostile-tool-port.ts ·
    │                     records-port-stub.ts · compiled-agents.ts
    └── proofs/           the gate suite (§5)
```

The three structural lints run as vitest tests from the first commit, scoped to
`packages/next/**`:

| lint | rejects | law |
|---|---|---|
| name-gate | any retired identifier from the §11 register (`say`, `view`, `intake`, `toolDefs`, …) anywhere in the tree | blueprint §11 (repo-wide at the swap) |
| layer-rule | any import pointing upward in the §6 layer picture (`contract/` importing `run/`, a proof fixture leaking into `src/`) | blueprint §6 — L0 imports NOTHING |
| purity | a regex literal or `new RegExp` in ANY `src/` file — in phase 1 the pattern factories do not exist, so the exception set is empty | charter R6.6 |

Two embedded decisions:

1. **Lint as test, not as script.** The phase gate is "proofs green" — the lints sit in
   the same suite, so `vitest run` answers the whole gate in one command. No new tooling.
2. **No network by construction AND by lint.** The proofs use `ScriptedModel` + stubs —
   and the lint additionally rejects `fetch`/`node:http`/`node:https` in phase-1 `src/`,
   making "no network" checkable, not merely accidental.

---

## 4 · BUILD ORDER — WALKING SKELETON

The skeleton principle: **from step 2 on, a whole turn always runs.** Each later step
enriches one collaborator and lands its proof — there is never a period of "several
classes finished, no turn possible". Normal TDD inside every step (red → green →
refactor), one commit per step on `to-be-phase-1`.

```
 step │ builds                                    │ proof that turns green
──────┼───────────────────────────────────────────┼────────────────────────────
   0  │ scaffold (§3) + the 3 lints               │ lints pass on the empty tree
──────┼───────────────────────────────────────────┼────────────────────────────
   1  │ contract/ whole: vocabulary.ts ·          │ CanonicalCall: coercion,
      │ ports.ts · CanonicalCall (TDD)            │ sorted key, equals, loud
      │                                           │ badArg
──────┼───────────────────────────────────────────┼────────────────────────────
   2  │ THE SKELETON: one scripted turn through   │ P1 — sealed transcript
      │ everything minimal: Engine · Turn ·       │ [toolCall, toolResult,
      │ Session · ActionHistory · PromptWriter ·  │  reply] in order, in a
      │ FinishDesk · DeliveryWriter · CallRunner  │  complete TurnRecord ·
      │ (allow route) · StatusClerk (yes→done     │ P11 (frozen seal) ·
      │ row) · ModelSeat (single target)          │ P12 (serialized entry)
      │ (rulebook EMPTY)                          │
──────┼───────────────────────────────────────────┼────────────────────────────
   3  │ StatusClerk complete — the whole grading  │ P5 — every row of the
      │ table incl. snapshot diff over the        │ table, diff row included
      │ RecordsPort stub                          │
──────┼───────────────────────────────────────────┼────────────────────────────
   4  │ Rulebook — the 4-phase pipe + census      │ P3 (refuse) · P4 (owe) ·
      │ + catalog seed: onlyAfter · maxCalls      │ P10 (census)
──────┼───────────────────────────────────────────┼────────────────────────────
   5  │ catalog seed: noDuplicateCall +           │ P2 (restate, no
      │ argRequired                               │ re-execution) + loud
      │                                           │ coercion rejection
──────┼───────────────────────────────────────────┼────────────────────────────
   6  │ FinishDesk complete: bounded redrives,    │ P8 — forced finish +
      │ earlyFinish, forceFinish, closure         │ closure as a pure function
      │                                           │ of the acts
──────┼───────────────────────────────────────────┼────────────────────────────
   7  │ ModelSeat complete: certification,        │ P6 (TurnFailure discards
      │ reroute between attempts, local brakes ·  │  the draft) · reroute never
      │ TurnFailure                               │  mid-turn
──────┼───────────────────────────────────────────┼────────────────────────────
   8  │ PromptWriter byte-stable (R7.3)           │ P7 — system() byte-identical
      │                                           │ across turns
──────┼───────────────────────────────────────────┼────────────────────────────
   9  │ GATE: whole suite + P9 (serial emission   │ all green = phase 1 paid,
      │ order) + final sweep                      │ merge to main
```

The concrete skeleton of step 2:

```
scripted model says:  "call getBooking(bk_1001)" → then "reply: done"
stub ToolPort has:    getBooking answering { id: 'bk_1001' }, done: 'yes'
minimal machine:      reads the script, runs the call, seals the reply
proof:                the sealed TurnRecord holds [toolCall, toolResult, reply]
                      in that order
```

---

## 5 · THE GATE — PROOF SUITE

The gate instrument is the whole suite green, no network. Twelve proofs, each tied to
the law it verifies:

| P | proof | law |
|---|---|---|
| P1 | a scripted turn seals `[toolCall, toolResult, reply]` in order, complete `TurnRecord` | R2.7 |
| P2 | duplicate call → `restate`: first result reprinted, executor NOT called again | R8.2 |
| P3 | `refuse` → act not-done/blocked with the guard's sentence in the delivery; the model continues the turn | R5.6 |
| P4 | `owe` → the read is model-filled via ONE forced single-tool micro-step, runs origin `'engine'`, recorded BEFORE the call's re-check; an unpaid debt refuses and the turn still answers | R5.2 |
| P5 | the StatusClerk table: `yes`→done · `no`→refused · `unknown`→unknown (never "nothing changed") · throw on read→`TurnFailure` · throw on write→unknown · veto→blocked · snapshot diff over the RecordsPort stub: a state change under `done:'no'` corrects the act to done and mints `recordCorrected` | R3.6 |
| P6 | `TurnFailure` mid-turn discards the draft: zero partial acts sealed, clean retry | R2.10 |
| P7 | `system()` byte-identical across turns; only the tail varies | R7.3 |
| P8 | forced finish on exhaustion + closure as a pure function of the acts (never empty, never fabricated) | R7.2 |
| P9 | two calls in one step execute serially, in emission order | R2.6 |
| P10 | `guards()` returns THE SAME arrays the phase checks iterate — the census is never a parallel copy | R1.5 |
| P11 | the sealed `TurnRecord` and every ctx travel deep-frozen (mutation throws); sealed history is shared by reference across turns | R2.9 |
| P12 | two concurrent `chat` calls on one session serialize — the second turn sees the first's sealed record, never a torn draft | R8.3 |

The hostile ToolPort stub is part of the instrument: it answers `done:'no'`,
`done:'unknown'` and throws on declared calls, so P5 exercises real hostility at the
seam, not fixture optimism.

### What phase 1 does NOT prove — each item already owned

| deferred | owner |
|---|---|
| consent lifecycle, honesty, disclosure, masking, judged guards | phase 2 gate (MVP cases on a hostile world) |
| the `simulationRevoked` mint (a simulation that mutated state) | phase 2 — simulation arrives with the `hold`/`simulate` routes |
| card compilation (`AgentFactory`/`CardCheck`/`SurfaceGate`/catalog), real world (`WorldBuilder`) | phase 2 |
| facade / server / mastra | phase 3 gate (hermes-sim) |
| the Atlas | phases 4–5 |

---

## 6 · SPEC VERIFICATION — ONE JUDGE

The design risk is paid at the blueprint (independently designed, adversarially judged,
compliance-verified). This document is a projection of that blueprint into build order.
Its verification is ONE pass — a single judge checking (a) fidelity: every phase-1 class,
signature and law named here matches blueprint v3 verbatim; (b) charter: no requirement
the phase-1 cut silently drops. The real gate of the phase is the proof suite itself.
