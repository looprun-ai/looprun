# Conditional destructiveness, the contract write gate, and the parity law — the need

Date: 2026-08-05 · Status: the need, and the propagation it owes · Owner: to brainstorm

Four gaps found by a generated subject's T1 review, each confirmed by execution against the
running engine, and each producing a defect a careful author could not have avoided. They are one
document because the third changes shape depending on whether the second lands, and the fourth is
what the third does when it cannot be satisfied.

## 1 · A tool is destructive per TOOL; a domain is destructive per CALL

`destructiveTools` is a list of names, and `confirmFirst` installs unconditionally on each. The
domain's reality is that the same tool is destructive or protective depending on its arguments:

```
placeHold(scope:'asset')       additive, protective   world executes, no confirmation
placeHold(scope:'workspace')   freezes the tenant     world answers requiresConfirmation

resolveClaim(resolution:'deny')      moves no money   world executes, no confirmation
resolveClaim(resolution:'approve')   moves money      world answers requiresConfirmation

updateMemberRole(role:'member')      routine          world executes
updateMemberRole(role:'owner')       escalation       world answers requiresConfirmation
```

Listing such a tool denies the protective branch, and the denial is **unrecoverable**: the world
raised no question for that branch, so no approval exists and none ever will. Measured:

```
placeHold({scope:'asset', confirmed:true})
  world  → ok:true, requiresConfirmation:false        the act is legitimate
  guard  → DENY "The user has not confirmed this action … run it only after their next
                 message carries the confirmation they were asked for."
                                                       a confirmation nobody will ask for
```

The model is primed to send that flag by the tool's own schema description, so the deny is not a
rare path.

### For one shape there is no valid expression at all

When the destructive branch names a record the tool's arguments never carry, it needs a
`destructiveLabels` entry — a label-derived question is the only one such a call can answer. And a
label may only name a tool that is already destructive. Measured:

```
destructiveTools: ['releaseHold']
destructiveLabels: { placeHold: 'freeze the entire workspace' }
  → THROWS: destructiveLabels names tool(s) that are not in destructiveTools: placeHold

destructiveTools: ['releaseHold', 'placeHold']
destructiveLabels: { placeHold: 'freeze the entire workspace' }
  → constructs, and now placeHold(scope:'asset') is denied for a confirmation nobody will ask for
```

So the workspace hold is in a closed loop: it needs the label, the label needs the list, and the
list denies its protective branch. The author cannot escape by choosing differently, because both
choices are wrong. A remediation attempt on a real bundle stopped here and recorded the price in the
spec header rather than repairing it — there was nothing to repair it with.

### What authors do for the shapes that DO have an escape, and what it costs

Leave the tool out of `destructiveTools` and hand-write a gate that reads `ctx.consent`. One
generated bundle did exactly that for `updateMemberRole`, and a remediation did it for
`resolveClaim`. The costs:

| cost | why |
|---|---|
| `destructiveThrottle` is lost | it installs from `destructiveTools`, so the blast-radius cap goes with the consent gate |
| every domain re-implements a consent read | the one surface where getting it wrong is most expensive |
| and one already did get it wrong | the same bundle carried a dead helper licensing a commit off the AGENT'S OWN reply text — the exact shape the consent law exists to forbid |

### The shape to consider

`confirmFirst` already answers one question about which call is which. This is the same question on
a second axis:

```ts
confirmFirst({ flag })          // WHICH call acts — the preview runs freely
confirmFirst({ flag, when })    // WHEN this call is destructive — a pure predicate over its args
```

```ts
// what a domain would then write
confirmFirst({ when: (args) => args.scope === 'workspace' })
confirmFirst({ when: (args) => args.resolution === 'approve' || args.resolution === 'settle' })
```

The predicate is pure and reads the acting call's arguments only, so it stays inside the purity law.
Consent stays entirely inside the engine: no domain reads `ctx.consent` by hand, which is the
property that makes the whole class disappear rather than move.

**Open questions for the design.** Does `destructiveThrottle` share the predicate, or cap every call
of a conditionally-destructive tool? What does `assertDestructiveConfirmable` check when the record
is only sometimes required? Does a `when`-gated tool still need its `destructiveLabels` entry — it
does when the destructive branch names a record its arguments never carry, which is exactly the
workspace-hold shape.

## 2 · One world condition, six copies, three of them written and two of them wrong

A world refuses every write while the workspace is suspended, not onboarded, or frozen. That is one
rule about the domain, and today every lane must re-express it as its own `precondition`. Measured on
a six-lane bundle:

```
preset suspended       guards that fire across all six lanes:  0
preset notOnboarded    guards that fire across all six lanes:  0
preset workspaceHold   fieldops ✓  billing ✓  rentals (one write only)  fleet ✗  workspace ✗
```

The two lanes that did write the gate keyed it on `workspaceFrozen()`, which the world defines as a
workspace-scoped HOLD — one third of the condition. So the bundle enforced the third that was
easiest to name and missed the two that were not, on the lanes that remembered at all.

Worse than a silent gap: on the suspended preset a DIFFERENT guard fires and steers the reply toward
the wrong desk, on the turn whose graded item is "say the workspace is suspended".

### The shape to consider

The engine already has this mechanism and uses it for honesty:

```
contract.writeTools  ──►  installs claimIsGrounded + claimIsComplete on EVERY spec
contract.writeGate   ──►  would install the state gate on EVERY spec that carries a write
```

```ts
const CONTRACT = {
  writeTools: WRITE_TOOLS,
  writeGate: {
    ok: (world) => world.status() !== 'suspended' && world.onboarded() !== false,
    reason: 'This workspace is suspended — no operation can be carried out until it is restored.',
  },
}
```

Six copies become one declaration, and the incoherence between lanes stops being expressible. This
is also the only repair that would have prevented the defect rather than caught it: an author cannot
key on a third of a condition they never write.

**Open questions.** Does a lane opt out — a protective tool that must stay usable while frozen is
real (a compliance hold is the canonical one)? An exemption LIST on the contract, or a per-spec
override? Does the gate render prose into the trunk, and if so does every lane render the same
sentence?

## 3 · The parity law — what the lint checks depends on whether §2 lands

The finding under both gaps is the same: **a world refuses a write for a reason no spec gates.**
That is decidable, and it is true for any bundle, so it belongs with the engine's artifact laws
(`looprun-eval lint --spec-laws`) rather than with a skill's authoring conventions.

```
for every condition the world's write path refuses on
  for every lane carrying a write
    there is a spec-side gate keyed on that condition
```

Without §2 the lint is the whole repair, and it accuses every lane that missed a copy. With §2 the
lint narrows to what the contract cannot cover — a lane that opts out without recording why, and a
gate whose predicate reads less than the condition it claims. **Design §2 first; the lint's shape
falls out of it.**

**The predicate has to be preset-aware, and a first attempt at it was wrong.** The obvious phrasing
— *a case may not target a guard bound to tools the case never calls* — produces false accusations.
A real one, caught when a reviewer swept the presets instead of the tool list:

```
agent:availabilityAnswerReadsTheAccount   bound to checkAvailability
case 57                                   calls createBooking, never checkAvailability
   → accused as a phantom target

but: the case runs on the accountHold preset, and on that preset the guard DENIES until the
     agent reads the account. createBooking is itself gated behind checkAvailability by a
     sibling guard, so the forced path reaches it. It goes quiet only when the agent complies.
```

A guard that is silent because the agent obeyed is doing its job. The decidable question is
therefore about STATE, not about the call list:

```
a case's target must be non-silent on at least one preset the case runs on,
evaluated before the agent has complied with it
```

Two neighbours from the same review, both decidable and both cheap once this machinery exists:

- **an `addGuard` with no explicit `{ id }`.** The engine mints `${layer}:${kind}#${++seq}`, a
  positional counter. Two cases in one bundle target `agent:requiresBefore#1`; inserting one
  id-less guard above silently re-points both, and a T3 profile keyed on it breaks the same way.
- **the guard-target diff keyed on `(agent, guardId)`, not `guardId`.** A guard id shared across
  lanes is satisfied by any lane targeting it, so a copy that no case on ITS lane can reach reads
  as covered. One bundle had two such guards, both inert, both passing in either variant.

## 4 · An accepted coverage gap has two ledgers that disagree

`GUARD-NEVER-TARGETED` is an engine artifact law, and it offers no way to accept a gap. A bundle
that records one keeps the engine red:

```
norms/bundle.test.ts   COVERAGE_GAPS: { fleet: ['agent:workspaceStateStopsRegistryWrites'] }
                       → 30/30 pass

looprun-eval lint --spec-laws
                       → GUARD-NEVER-TARGETED: 'agent:workspaceStateStopsRegistryWrites'
                         lint: 2 violation(s)
```

Two ledgers for one law, and the subject's own record does not reach the engine's. The right
resolution in that instance was to write the missing cases, which is what the law wants. But a gap
that genuinely cannot be closed — a guard whose condition the exam's world offers no preset for —
has nowhere to be recorded except a file the law does not read.

**Open question.** Does the law read an accepted-gap declaration off the subject, the way
`CROSS_LANE_CASES` is read? Or is "no accepted gaps" the correct absolute, and a guard with no
reachable case is always a defect in the exam or the world rather than a fact to record?

## Why these four and not more

Each was found by execution, not by reading, and each produced a defect the author could not have
avoided by being more careful:

| gap | what the author had to know that the vocabulary did not say |
|---|---|
| conditional destructiveness | that listing a tool denies a branch the world executes, unrecoverably — and for one shape, that neither choice available is correct |
| the write gate | that the world refuses on three conditions, and that `workspaceFrozen()` is one |
| the parity law | that five sibling lanes wrote a gate this one did not, and that a guard silent because the agent complied is not a phantom |
| the two ledgers | that recording an accepted gap in the subject leaves the engine's law red |

A vocabulary that requires an author to hold all four in their head is where the next bundle fails
the same way. The first row is the sharpest: there, holding all four would not have helped, because
the shape has no correct expression to reach.

## What ships beside the code

Four surfaces publish the vocabulary an author reads, and each states today's shape as a closed
rule: `confirmFirst` has nothing to configure, a destructive tool is a name on a list, a world
condition is a `precondition` each lane writes for itself. A merge that leaves them saying so ships
a vocabulary no author reaches — and §1 and §2 are worth nothing unless the author reaches them.

### 1 · The catalog entry is the source

`packages/core/src/guards/catalog.ts` holds the `confirmFirst`, `destructiveThrottle` and
`precondition` entries; `pnpm docs:guards` renders them into `docs/tutorial/04-guards.md` and its
snippet, and CI holds the two together. Every wording change starts in the catalog and the chapter
is regenerated, never hand-edited.

The `confirmFirst` entry is where §1 is most visible, and the entry has to carry both halves at once:

```
about the CONSENT     nothing is configurable — the agent has no channel to produce one
about the CALL        two questions: WHICH call acts (flag), WHEN it is destructive (when)
```

### 2 · The doc surfaces

| § | surface | what changes |
|---|---|---|
| 1 | `catalog.ts` — `confirmFirst`, `destructiveThrottle` | the second option, and whether the throttle reads the same predicate or caps every call of the tool |
| 1 | `GUARDS.md` — the auto-install table, `cfg.destructiveTools` row | the list installs a gate whose predicate decides the branch, not a gate on every call |
| 1 | `GUARDS.md` — the `confirmFirst` option paragraph | the option count, and that the new option answers WHEN rather than WHICH |
| 1 | `GUARDS.md` — the `destructiveLabels` row | a conditionally destructive tool still owes a label when its destructive branch names a record its arguments never carry |
| 1 | `GUARDS.md` — the construction-throw list, "a `destructiveLabels` entry for a tool that is not destructive" | one half of the deadlock, stated as a law: it stands only if the predicate reaches a label some other way |
| 1 | `GUARDS.md` — the auto-install table's ⊆-validation of `cfg.destructiveLabels` | the same rule at its second statement; the two agree or the vocabulary contradicts itself |
| 1 | `docs/tutorial/03-agent-anatomy.md` — the `destructiveTools` and `destructiveLabels` rows, and the protocol a destructive tool must honour | the protocol binds the destructive branch, and the protective branch runs untouched |
| 1 | `docs/tutorial/05-running-and-eval.md` — the run-start throw | what `assertDestructiveConfirmable` checks when the confirmation record is only sometimes required |
| 2 | `GUARDS.md` — the contract table, `cfg.contract.writeTools` row | `writeGate` beside it: one declaration installing the state gate on every spec that carries a write |
| 2 | `docs/tutorial/03-agent-anatomy.md` — the `CONTRACT` block and the `writeTools?` row | the contract's second switch, and what a bundle loses by omitting it |
| 2 | `docs/tutorial/04-guards.md` — the auto-install ladder | a rung: `IFF contract.writeGate`, on every spec carrying a write |
| 2 | `catalog.ts` — the `precondition` entry | the condition every lane shares is a contract declaration; `precondition` stays the gate for what one lane alone refuses on |
| 3 | `packages/eval/src/**` — the entry point that owns the parity law | the preset-aware predicate reads the world's presets, so the law lands in `lintSubject(subject)` or `lintSpecExecution(specs)`, not in `lintSpecQuality(specs, toolDefs)`, which never sees a preset |
| 3 | `docs/tutorial/05-running-and-eval.md` — the preflight lint table | that table publishes what each lint receives; the law's row states its inputs, and the violation string each new law prints |
| 3 | `packages/eval/README.md` | what `--spec-laws` covers |
| 3 | `BACKLOG.md` — the probe-parity lint row | the parity law's execution half and that row are one question: a check that must RUN the flow rather than read it |
| 4 | `docs/tutorial/05-running-and-eval.md` — `lintSubject`'s findings, the `GUARD-NEVER-TARGETED` line | whether a gap can be accepted at all, and if so what the subject writes to accept it |
| 4 | `packages/eval/src/lint-subject.ts` — the violation string | it names the defect; if a declaration is readable, it names the escape too |
| — | `docs/tutorial/04-guards.md` | regenerated for §1 and §2 through the catalog, hand-edited for neither |
| — | `README.md` | nothing: it names no destructive, contract or lint vocabulary |

### 3 · The `agentspec` skill

This is the surface that decides whether an author ever writes a predicate or a `writeGate`, and it
lives in the sibling `agentspec` repo — its own commit, its own cycle, and the reason it belongs in
the plan rather than in a discovery later.

The skill routes the author into the exact defect §1 describes:

```
skill/references/guard-catalog.md — the ADVICE
  "only genuinely destructive tools get confirmFirst. A gate that blocks a required
   single-turn call fails the exam"

skill/references/norms.md — the CHECKLIST
  "every destructive tool is in destructiveTools"
```

A tool that is destructive on one branch satisfies neither reading: listing it blocks the required
call, leaving it off breaks the checklist. The author resolves the contradiction the only way it
resolves today — off the list, with a hand-written `ctx.consent` read. `confirmFirst({ when })` is
what makes both readings true at once, and the skill must say which one to write.

The same for §2: `precondition` is published as world-only by design, and nothing tells an author
that a condition six lanes share belongs to the contract instead. The skill's own laws-to-guards
table is where that routing lives.

The two neighbours of §3 are authoring-time rules before they are lint rules: every `addGuard`
carries an explicit `{ id }`, and a guard id is reachable only from the lane that owns it.

§4 is the skill's obligation whichever way the open question resolves, because the second ledger has
no publisher. The skill names `norms/bundle.test.ts` as the bundle's own assertion file; the ledgers
written inside it — the accepted-gap record, and the cross-lane record the open question compares it
to — appear in no reference the skill ships and on no engine surface. So the design is not choosing
between two mechanisms that exist:

```
reads a declaration    the skill states where the record lives, what a valid entry says,
                       and that a gap with no reason is a lint failure of its own

no accepted gaps       the skill states that a guard no case can reach is a defect in the
                       exam or in the world — the repair is a preset, never a record
```

Files: `guard-catalog.md`, `norms.md`, `spec-template.ts`, `test.md`, `ship.md`,
`scripts/lint-authoring.mjs`.

### 4 · The proof record

| change | governed | record |
|---|---|---|
| §1 — the predicate, the throttle, the run-start assertion, the label/list coupling | `packages/core/src/**` + `packages/core/GUARDS.md` | required |
| §2 — the contract switch and the installed gate | `packages/core/src/**` + `packages/core/GUARDS.md` | required |
| §3 — the parity law and the two id laws | `packages/eval/src/**` | not a governed surface |
| §4 — whether the law reads an accepted-gap declaration | `packages/eval/src/**` | not a governed surface |

§1's coupling is part of the change, not a side effect: `destructiveLabels` may only name a tool
already on the list, so whatever `when` does to the list has to keep the label reachable for the
branch that needs one. A design that gates by predicate but still requires list membership for a
label leaves the deadlock exactly where it is.

`GUARDS.md` states that rule twice — in the construction-throw list and in the auto-install table's
⊆-validation — and those two sentences are the acceptance test in prose: after the change they read
true together, or the workspace hold still has no expression.

`confirmFirst` is a kind with a per-kind completeness describe, and §1 adds a polarity to it: the
call the predicate declines to gate, which the world executes and the guard stays silent on. The
proof carries that branch or the ratchet asserts a completeness the guard no longer has.

The skill lands in a repo with no proof gate of its own, which is why its change is named here.

## Explicitly out of scope

Any route that lets a domain read `ctx.consent` more comfortably. The value of §1 is that it removes
the reason to read it at all; a friendlier accessor would keep the surface and grow its use.
