# The Cx Program — five specs that close the engine's side doors

The engine holds three ways of knowing the world that production does not offer — a rehearsal
seam, a whole-world snapshot, and a deterministic choice desk built on them — and a read
declaration split across three names. This program removes the first three and unifies the
fourth, one spec at a time, each measured before the next begins. The register of record is
`BACKLOG.md` rows C1–C4 and C6; this document is the program-level design those rows point to.

## The frame

```
base: minimal-core (merge to main only after the certification)

C1 ────► C2 ────► C3 ────► C4 ────► C6 ────► FULL RULER (once)
rehearsal choice   state    order    needs    the program's
seam out  gate out one door two-pass one decl certification
│         │        │        │        │
gate      directed directed directed directed
green,    subset   subset   subset   subset
no run
```

| program rule | what it is |
|---|---|
| one spec per item, five specs | each carries the four law sections: measurement · implementation · documentation · skill |
| item N+1 starts | only with item N implemented, gate green, directed subset judged — in session, like every verdict in these repos |
| micro-test before spec | C3 is the one unmeasured item — its accumulation prototype runs on its own branch BEFORE its spec is written |
| the full ruler | runs ONCE, after C6: atlas-c20's 100 cases + harborpoint + trialworks, judged in session |
| D1 | out of this program — a later implementation round (backlog row D1: the floors at the doors) |
| skill cadence | every item ships engine + docs + skill in the same working session; the skill is never "later" |

Each item's own spec is written when its turn comes, carrying its measurement section with the
run directories named. This document fixes the scope, the mechanism and the acceptance of each.

## The rulings this design carries

| ruling | decision |
|---|---|
| value guards | `valueFromUser` + `valueFromUserOrRecord` stay as a pair, record fields required; no merged factory, no source-pure split (OR is not composable in the walk — the first refusal ends it) |
| argument-family names | a guard's name is its law read as a sentence: `argAbsent` → `argForbidden`, `argFormat` → `argMatchesFormat`, `argCondition` → `argSatisfiesCondition`, `checkResult` → `resultSatisfiesCondition`; `argRequired`, `argMatchesRecord`, `mustAccountFor` and the value pair keep their names |
| removals | `lieCheck`, `impossibilityCheck`, `hallucinationCheck` are deleted (the engine-owned-question backlog rows own what replaces them); `swapTerms` is untouched here and re-homes at D1's exit door |
| keeps | `argForbidden`, `argMatchesRecord`, `mustAccountFor` stay — they have saved cases before |
| state validity | every accumulated row is `{ value, at }` on the injected clock; a row older than the declared validity (default 5 minutes) is unread |
| the world rule, whole | NOTHING in the engine reaches the world except a tool execution — the engine is written as if every world were MCP |
| dry runs | no engine seam, ever; a surface that offers a dry run offers it as one more tool, and the spec carries no observation about it |

## C1 — the rehearsal seam comes out

**What dies** (a dead path today — no subject declares `simulation`):

| piece | where |
|---|---|
| the `rehearse` seam on the port | `packages/core/src/contract/ports.ts:10-11` |
| the world's implementation | `packages/core/src/world/world-builder.ts:83` (+ the `simulate` coercion at `:72`) |
| the consent-path caller: rehearsal cancelling a held question, simulation-on-hold | `packages/core/src/run/call-runner.ts:56, 191-202, 251-284` |
| session revocation + wiring | `packages/core/src/run/session.ts:49-50`, `packages/core/src/run/turn.ts:281` |
| the vocabulary: `simulation`, `simulationRevoked`, the simulated result on a hold | `packages/core/src/contract/vocabulary.ts:31, 45, 59, 86, 299, 339` |
| the declaration route: `simulate` minted into a card's schema | `packages/core/src/cards/facts.ts:28, 43, 58` |

**What the consent path becomes** — the law the documentation states AS-IS:

```
a held act → the question opens → approved → the act RUNS
→ if the world refuses, the world's own refusal reaches the operator
  (the engine has two moves: call, or do not call — nothing is known beforehand)
```

The refusal that comes BEFORE a question still exists — but only from the contract's own
guards, and that ordering is C4's.

**Skill**: `references/gen.md` contradicts itself today — the three hostile-world laws forbid
a `simulate` argument and a `rehearse` seam, while the tool-entry field table still teaches
`simulation` and the gates section still states "the engine REHEARSES". The `simulation` row
leaves the table, the rehearsal paragraph is rewritten to the new truth, and the three laws
stand without exception.

**Acceptance, no model run**: workspace gate green, and the rendered-prompt byte diff over the
live subjects is ZERO — nothing declares the seam, so nothing the model sees changes.

## C2 — the deterministic choice dies, and a value with no source is refused

**What dies**, one move, no shim:

```
engine:  choiceFromUser (catalog.ts:799-840) · the choose verdict in the walk ·
         ChoiceDesk and its minted codes · answeredOption · choiceKey
runner:  the {answer} case-script turn
bench:   atlas-c20's ECHO_TURNS + withEcho — the 12 sealed scripts return to their
         original form and run again
emit:    the choiceFromUser mapping in declaration/write-cards
skill:   every line that names them (author.md · evals.md · guard-catalog.md)
```

`confirmFirst` is untouched: minted by the engine for every destructive act, licensed by the
minted code alone.

**What replaces it** — the source pair the catalog already carries. Migration per card, the
author choosing per argument: atlas-c20 (5 declarations), atlas-c21 (6), hp-armon (4),
hp-armoff (4). trialworks declares none.

**The inherited open question, resolved with no new mechanism.** How a spoken word becomes a
stored token: the refusal puts the declared tokens in front of the operator, and the
operator's echo puts one into their own words —

```
OPERATOR  "deixa a escavadeira em estado bom"        (the register's token is 'good')
MODEL     updateAssetCondition{ condition: 'good' }
GUARD     valueFromUser → REFUSED ('good' is not in the operator's words)
DESK      "the register takes good, fair or poor — which do I write?"
OPERATOR  "good"                                      ← now it IS in their words
MODEL     updateAssetCondition{ condition: 'good' } → RUNS
```

Zero code, zero language matching, zero question desk — the refuse→ask→echo cycle the engine
already has.

**Authoring note (goes to the skill)**: a source-gated argument needs ECHOABLE tokens — a
boolean (`includeDelivery: true`) is not one a person types naturally; the author declares
vocabulary a person can echo, or does not gate the argument. The T-loop finds the per-argument
fit.

**Riding the same spec**: the argument-family renames and the three judged-check removals from
the rulings table above.

**Measurement — already paid**: over the 19 atlas cases that reach a choice, the gate removed
scores 13/19 against the run of record's 10/19, every moved case tracing to the gate itself.
What the gate bought is 2 invented values in 15 gated acts (case 44 priced a 350 delivery on a
turn that never mentions delivery; case 72 wrote `condition: 'good'` from "the hydraulic job
finished early") — both exactly what a source rule refuses. The blind c21 author declared
`updateMemberRole/role` under `valueFromUser` unprompted while the gate stood available.

**Directed subset**: the 19 choice cases + the 12 unlocked scripts + the echo neighbours
(29, 30, 32, 37, 44, 68, 72, 93) + harborpoint's choice cases.

## C3 — nothing reaches the world but a tool call

**The rule, whole**: the engine is written as if every world were MCP. `RecordsPort.snapshot()`
dies with every consumer. The unifying fact: `state` is already `| null` everywhere, because
`mcpWorld`/`liveWorld` exist without records — the rule deletes the non-null branch and leaves
ONE code path, identical for a local fixture and a remote surface.

| snapshot consumer today | becomes |
|---|---|
| guard ctx (`call-runner.ts:104`) | the accumulation: every tool result seats its rows as `entity/id → { value, at }` on the injected clock (the consent-code clock), across the whole session |
| grading's before/after photos (`call-runner.ts:274-304`, `status-clerk.ts`) | an act's status comes from the tool's OWN answer — result or refusal — exactly what an MCP surface already gives |
| the prompt tail/`note` (`turn.ts:317`, `prompt-writer.ts`) | the turn head renders from accumulated returned rows, never from the records; before any read there is no tail |
| micro-step raw state (`turn.ts:258`) + `maskState` | the accumulation |

**Validity**: a row older than the declared validity (default 5 minutes, declarable on the
contract) is UNREAD. Ageing out is not a refusal of its own — the row simply is not there, and
the owed-read machinery that forces a first read forces the fresh one. A record another user
may have changed never decides anything past its validity.

**Guard migrations**: `precondition`/`recordOf` (an absent or stale target row refuses in
words: the row was not read this conversation — read it first), `valueFromUserOrRecord` (only
a returned row licenses), `onlyAfterWhen` and `argSatisfiesCondition` (predicates over the
accumulation), `groundedIds`/`groundedDates` (grounded on DELIVERED text — the tail the model
was actually shown — plus acts and accumulation).

**Grading without photos, same act**:

```
releaseDeposit(dep_9) → tool answers { status: 'released' }  → act "done"
releaseDeposit(dep_9) → tool refuses DEPOSIT_NOT_HELD        → act "not-done"
(no photos — only what the tool answered; fixture and MCP indistinguishable)
```

**Micro-test FIRST, on its own branch** — the one unmeasured item:

```
accumulation prototype → the subset of cases with state guards
measures: (a) how many cases today DEPEND on a never-read row (the hole)
          (b) how many start refusing with "read it first" (the cost)
          (c) what the tail's move to accumulation costs (atlas's suspension rides it)
acceptance: no regression outside the "licensed from an unread row" class
```

**Directed subset**: every case crossing a state guard.

## C4 — the records refuse before the desk asks

```
checkPreTool, two passes over the covering guards:
  pass 1: ONLY the deny hooks     → the first refusal ends the walk
  pass 2: restate · owe · hold    (choose no longer exists — C2)
```

**Connection to C1**: "the desk never asks about an act already refused" lost its dishonest
mechanism (rehearsing the world) and gains the honest one here — over what the engine REALLY
knows, its own guards. The world still answers only when called.

**Measurement — already paid**: prototype on branch `microtest-required-precondition`
(`1bb10b9`), 92 cases across three subjects, both arms, judged case by case — 2 paid (atlas 77
and 93, where the reply stated a refusal and offered a menu in the same breath), ZERO
regressions, 25 ungated trialworks controls byte-identical. The spec REBUILDS it on the
post-C2/C3 engine: the prototype's clause skipping a guard about to ask is never written,
because the guard that refused its own question died with C2.

**Directed subset**: 77 + 93 + their neighbours + harborpoint's consent family.

## C6 — `needs`: the owed read is one declaration

```
today: onlyAfter(tool, read) + onlyAfterWhen(tool, read, when) + the pick alias (shipped)
C6:    needs — one declaration carrying the whole relation:
       { read, args: declared renames of the act's own args,
         pick: { list, by, key },              ← which row of a list read speaks
         when: optional, over the accumulation }
```

| | `onlyAfter` today | `needs` |
|---|---|---|
| declares | the read's NAME only | the whole relation |
| the read's args | the MODEL fills them in a forced micro-step (one extra model call, fallible) | the ENGINE arms the read by declared rename — zero model calls |
| condition | a separate guard (`onlyAfterWhen`) | `when` on the same declaration |
| one row of a list | a loose alias | `pick` on the same declaration |
| consent disclosure | does not know the read | reads the SAME declaration |

The model micro-step survives only for undeclared surfaces. Old names deleted, no shim; ~40
declarations migrate across the four cards; emit + docs + skill in the same session.

**Why it closes the program**: C3 makes every `precondition` (57 declarations) demand a read
behind it — a dead refusal and two extra round-trips wherever the model did not read first.
`needs` is the author naming WHICH read, and the engine paying it itself, in the same turn,
on fresh rows. C3 creates the demand; C6 delivers the declared mechanics.

**Directed subset**: every case crossing an `onlyAfter`/`onlyAfterWhen` chain, plus case 18 —
the one case exercising the shipped pick (the hold's reason woven into the consent ask).

## The close

```
C6 green → FULL RULER, once: atlas-c20's 100 + harborpoint + trialworks,
judged in session — the program's certification. Then: merge minimal-core → main.
```

## Out of scope, registered

Backlog row **D1 — the floors at the doors**: engine-owned always-on floors; the ENTRY door
(router) is deterministic because it runs before any model call, including the router's own;
`maxCalls` and the judged injection question at the CALL door; `maskPattern`/`purgePattern`/
`swapTerms` and structural PII shapes at the EXIT door; a floor may arm at both doors.
`injectionCheck` (judged, in use on c21) lives until D1 lands and dies there.
