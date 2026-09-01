# C6+C3 — `needs` is the one declaration, and nothing reaches the world but a tool call

One item, two halves, C6 leads: without the declared path there is no C3. The Cx program's
closing engine change (`docs/superpowers/specs/2026-08-31-cx-program-design.md`); the full
ruler runs once after it, as the program's certification.

```
C6   onlyAfter · onlyAfterWhen  ──►  needs — ONE declaration carrying the whole relation:
     (two names, args the model         { read, args: declared renames, pick, when }
      fills in a micro-step)            the ENGINE arms the read; the disclosure reads
                                        the same declaration

C3   RecordsPort.snapshot()     ──►  the ReadsLog — what the tool calls of THIS conversation
     (the whole world, read or          answered, each answer stamped on the injected clock,
      unread, behind every guard,       stale after its validity; guards, grading, the tail
      the photos and the tail)          and the micro-step all read it and nothing else
```

## The rulings this design stands on

| ruling | consequence here |
|---|---|
| a real MCP answer is undocumented nested JSON — no `booking` key, no `id`, no schema | **the ENGINE never guesses a payload's shape**; every engine walk into an answer follows a DECLARED path (`pick`, `at`, disclosure slots) |
| the engine has two moves: call, or do not call (C1) | the world's records are unreachable except through a tool answer |
| a refusal precedes any question (C4) | an absent or stale row refuses in words before any ask |
| the value pair stays (C2) | untouched; the record half changes its source (below) |

**The line this spec draws**: the engine guesses nothing, and AUTHORED code knows its own
surface. A subject's `precondition` condition is written by the author whose world returns
those answers — reading `answer.member.role` in authored code is declared knowledge, not
engine guessing. What dies is every ENGINE-side reading of an undeclared shape.

## 1 · The measurement

**The accumulation micro-test** (branch `microtest-c3-accumulation`: prototype `a7d223e`,
MCP shapes `0569c65`, analysis `4f6892c`; docs
`docs/analysis/2026-09-01-c3-the-accumulation-microtest.md` and
`…-c3-what-the-preconditions-reach.md` on that branch):

```
the same keying rule, five answers:
{ found: true, booking: { id: "bk_1001", … } }              1 row   ← the fixture's shape
{ content: [{ type: "text", text: "{\"data\":{…}}" }] }     0 rows  ← a real MCP envelope
{ ok: true, page: { cursor: null, items: [ … ] } }          0 rows
{ rentalAgreement: { reference: "bk_1001", … } }            0 rows
[ "bk_1001", "bk_1002" ]                                    0 rows
```

A shape-guessing accumulation works only on worlds this repository writes. What survives the
micro-test: the injected clock, the validity rule (a row answers for its declared life;
reading again restarts it), and the byte bound (the log never exceeds the world it was read
from; directed-read turns carry a fraction of today's whole-world tail).

**The preconditions census** (same analysis): 56 preconditions across the five live subjects —
30 read only the call's own record, 26 reach the snapshot, and 24 of those 26 are one shape,
the acting-member role gate (`actingField`/`whoCan` over `workspace` + `members`).

**The onlyAfter census** (this session, cards.ts per subject):

| subject | onlyAfter | onlyAfterWhen |
|---|---|---|
| atlas-c20 | 16 | 0 |
| atlas-c21 | 6 | 1 |
| atlas-next | 17 | 0 |
| harborpoint | 6 | 0 |
| trialworks | 5 | 0 |
| **total** | **50** | **1** |

**What the model micro-step costs today**: `onlyAfter`'s owe ships `args: {}`
(`catalog.ts:76`) and the model fills them in a forced single-tool step (`turn.ts:251-276`) —
one extra model call per unpaid read, fallible by construction (`filled === null` refuses the
debt). The disclosure path already does it right: `DisclosureDesk.owedReads` arms declared
renames engine-side, zero model calls, and `pick` binds one row of a list answer (case 18's
reason rides the woven ask). C6 gives every owed read that mechanics.

**The four registered cases** (`39-deposit-float-cap`, `47-plan-downgrade`,
`51-sole-owner-protected`, `55-friend-deposit-release`, BACKLOG C3 row): measurement targets
of the directed subset, NOT acceptance — repaying them needs authored standing refusals over
returned reads, and where they land is the owner's ruling.

## 2 · The implementation

### 2a · C6 — the `needs` factory; the old names die

`packages/core/src/cards/catalog.ts:59-89` (`onlyAfter`) and `:739-780` (`onlyAfterWhen`)
are replaced by ONE factory:

```typescript
export function needs(tool: string, spec: {
  readonly read: string;                                   // the owed read (or write prereq)
  readonly args?: Readonly<Record<string, string>>;        // read arg → held call's own arg
  readonly pick?: { readonly list: string; readonly by: string; readonly key: string };
  readonly when?: (reads: ReadsView) => boolean | null;    // null = cannot tell yet
  readonly rule?: string;                                  // omitted = the engine sentence
}): SeedGuard
```

- **owe**: the read has not succeeded within its validity → owe
  `[{ alias: read, tool: read, args: <declared renames resolved from the held call> }]`.
  The engine arms and runs it (origin `'engine'`, recorded). The model micro-step survives
  ONLY where `spec.args` is undefined and the read's schema requires arguments — the
  undeclared surface.
- **when**: evaluated over the ACCUMULATION — the answers this conversation already holds.
  `false` = the requirement does not bind and the guard stands down; `true` = it binds;
  `null` = the answers that would tell are themselves unread, and the order binds fail-closed.
  Nothing is knowable before a call, so a condition that cannot answer never waives the read.
- **deny**: a read that ran and did not succeed this turn refuses (`did not succeed this
  conversation`); a non-read prerequisite denies without owing, as today.
- **compile-merge**: the relation lands in `DisclosureBinding.needs[tool]` under
  `alias = read`, so a consent ask weaves the same declaration. An act declaring the same
  alias in BOTH its disclosure block and a `needs` guard throws at construction — one
  declaration, one home.

Emit follows in the same move: `packages/emit/src/declaration.ts:13-15,121` (factory list),
`write-cards.ts:83` and `against-surface.ts:119-121,310` (the `after` arg becomes the `read`
relation). Old names deleted everywhere, no shim.

### 2b · C3 — the ReadsLog (new: `packages/core/src/run/reads-log.ts`)

The prototype's surviving half, shapeless:

```typescript
export const DEFAULT_READ_VALID_FOR_MS = 5 * 60 * 1000;   // limits.readValidForMs overrides

export class ReadsLog {
  constructor(now: () => number, validForMs?: number)
  /** Every answer lands whole and opaque, keyed by (tool, canonical args key). */
  record(tool: string, argsKey: string, answer: Json): void
  /** The last valid answer of this read — masked at the record seam; null = unread/stale. */
  latest(tool: string, argsKey?: string): { readonly answer: Json; readonly at: number } | null
  /** The tail's view: every read with a valid answer, newest per (tool, argsKey). */
  entries(): readonly { tool: string; argsKey: string; answer: Json; at: number }[]
}
```

No `rowsOf`, no entity guessing, no id hunting. A declared `pick` (or an authored condition)
is the only way into an answer.

### 2c · The snapshot's four consumers, and the port's death

| consumer | today | becomes |
|---|---|---|
| guard ctx | `call-runner.ts:99` `recordsPort?.snapshot()` | `ctx.reads` — the ReadsLog view; `CallCtx.state` leaves the vocabulary |
| grading | `call-runner.ts:231` after-photo + `StatusClerk` diff overrule | `grade(input, effect)` — the tool's OWN answer alone: yes → done, no → refused, unknown → unknown; `evidence: 'diff'` and `recordCorrected` (`vocabulary.ts:54`) die |
| the tail | `turn.ts:312` whole snapshot + `facts.tail` filter + `facts.note` | `READS:` — the ReadsLog entries, masked, each labeled with its read and age; before any read there is no tail; `tail` and `note` leave `SurfaceFacts` (`vocabulary.ts:289-294`) — the world speaks through tools only |
| the micro-step | `turn.ts:258` same snapshot | the same `READS:` rendering |

`RecordsPort` dies (`ports.ts:8`) with its wiring (session/engine deps). The WORLD keeps its
own records internally — `patch-desk.ts:67` serves executors — the engine just stops seeing
them.

```
grading without photos, the same act (already the MCP surface's only shape):
releaseDeposit(dep_9) → answers { done: 'yes', … }        → done
releaseDeposit(dep_9) → refuses DEPOSIT_NOT_HELD          → not-done (refused)
```

### 2d · The state-reaching guard families migrate to declared sources

| factory | today reads | becomes |
|---|---|---|
| `precondition` | `{ record, state }` — the snapshot, any entity | `{ record, reads }` — `record` is the last valid answer of the act's own declared read (picked to the target); `reads` the ReadsLog view; an authored condition reads its own surface's shapes; an absent/stale row refuses in words: *read it first* |
| `role` | declared entity paths over the snapshot (`anchor`, `from`) | declared READ paths: `{ read, at, in }` — the engine walks the declared `at` path over that read's last valid answer |
| `valueFromUserOrRecord` / `argMatchesRecord` | the record half reads `state[from]` | the record half licenses only from a RETURNED answer: `from` names a read and `at` a declared path |
| `argSatisfiesCondition` / `needs.when` | `state` where used | predicates over `reads` / the picked row |
| `groundedIds` / `groundedDates` | results + messages (already accumulation-shaped) | unchanged; verified in the proofs |

The harborpoint arm row (`tool:dockWorkStopsOnAFreeze`) migrates with them: the freeze
condition reads the last `listHolds` answer instead of `state.holds`.

### 2e · The subjects

51 `needs` migrations + 26 state-reaching precondition/role migrations across atlas-c20,
atlas-c21, atlas-next, harborpoint (+ the two arms), trialworks — each by the per-factory
mold above, emit regenerating what the declaration owns and the hand-carried cards edited in
place. `limits.readValidForMs` declarable on the contract, default 300 000.

## 3 · The documentation

| doc | change |
|---|---|
| `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` | the ports row, the walk drawing's STATE line, the grading rows (R-status/photos), the tail section — all to the ReadsLog truth |
| `docs/tutorial/01-concepts.md` | the state door: a guard sees what the tools returned, nothing else |
| `docs/tutorial/03-disclosure.md` | `needs` is the ONE declaration — the guard and the ask read it together |
| `docs/tutorial/04-guards.md` | the mechanism table: `onlyAfter`/`onlyAfterWhen` rows become `needs`; the precondition row shows the read-it-first refusal |
| `docs/tutorial/05-the-domain-card.md` | `readValidForMs` beside the other limits |
| source headers | `ports.ts`, `call-runner.ts:1-4`, `status-clerk.ts:1-2`, `vocabulary.ts` comments at 54/289 — rewritten AS-IS |

## 4 · The skill (`agentspec`, same session as the engine)

Six reference files name the old factories (`guard-catalog.md` ×9, `author.md`, `evals.md`,
`norms.md`, `resume.md`, `spec-template.ts`) and `references/check-subject.test.ts` carries
the parity lists. All move to `needs` in the same session: the catalog section teaches the one
declaration (read · renames · pick · when), the conditional-read teaching states the
after-the-answer semantics of `when`, and the authored-condition law is stated where
preconditions are taught: *your condition reads your own surface's answers; the engine walks
only declared paths*.

## Acceptance

| check | bar |
|---|---|
| workspace gate | green, no model run; proofs for: needs owe/deny/pick/when · engine-armed args · ReadsLog validity/restart · grading without photos · the READS tail |
| the micro-test bar (program law) | no regression outside the *licensed-from-an-unread-row* class |
| directed subset, escada 12 → 40 | every case crossing a state guard or an onlyAfter chain + case 18 (the woven pick) + the four registered cases — judged in session at each rung |
| FULL RULER, once, after | atlas-c20's 100 + harborpoint + trialworks, judged in session — the program's certification; each checkpoint shown before the next |

## Fresh design decisions this spec carries (for the owner's review)

1. **Authored conditions read their own surface** — the no-shape law binds the ENGINE, not
   the subject author's code.
2. **`when` verifies from the read's own answer, after it** — with no answer the read is owed
   unconditionally, because nothing is knowable before a call.
3. **`facts.note` and `facts.tail` die with the snapshot** — the world loses its sentence
   channel into the prompt; what a desk knows arrives through reads. The directed subset
   prices this (atlas's suspension NOTE rides that channel today).

## Out of scope

D1 (the floors at the doors) · the four cases' authoring ruling · hermes-sim (ruled last of
all) · any change to the value pair or the C4 walk.
