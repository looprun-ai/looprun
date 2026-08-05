# Conditional destructiveness, the contract write gate, and the parity law — the need

Date: 2026-08-05 · Status: the need, and the propagation it owes · Owner: to brainstorm

Three gaps found by a generated subject's T1 review, each confirmed by execution against the
running engine, and each producing a defect a careful author could not have avoided. They are one
document because the third changes shape depending on whether the second lands.

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
raised no question for that branch, so no challenge exists and none ever will. Measured:

```
placeHold({scope:'asset', confirmed:true})
  world  → ok:true, requiresConfirmation:false        the act is legitimate
  guard  → DENY "The user has not confirmed this action … run it only after their next
                 message carries the confirmation they were asked for."
                                                       a confirmation nobody will ask for
```

The model is primed to send that flag by the tool's own schema description, so the deny is not a
rare path.

### What authors do instead, and what it costs

Leave the tool out of `destructiveTools` and hand-write a gate that reads `ctx.consent`. One
generated bundle did exactly that for `updateMemberRole`. The costs:

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

Two neighbours from the same review, both decidable and both cheap once this machinery exists:

- **an `addGuard` with no explicit `{ id }`.** The engine mints `${layer}:${kind}#${++seq}`, a
  positional counter. Two cases in one bundle target `agent:requiresBefore#1`; inserting one
  id-less guard above silently re-points both, and a T3 profile keyed on it breaks the same way.
- **the guard-target diff keyed on `(agent, guardId)`, not `guardId`.** A guard id shared across
  lanes is satisfied by any lane targeting it, so a copy that no case on ITS lane can reach reads
  as covered. One bundle had two such guards, both inert, both passing in either arm.

## Why these three and not more

Each was found by execution, not by reading, and each produced a defect the author could not have
avoided by being more careful:

| gap | what the author had to know that the vocabulary did not say |
|---|---|
| conditional destructiveness | that listing a tool denies a branch the world executes, unrecoverably |
| the write gate | that the world refuses on three conditions, and that `workspaceFrozen()` is one |
| the parity law | that five sibling lanes wrote a gate this one did not |

A vocabulary that requires an author to hold all three in their head is where the next bundle fails
the same way.

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
| 1 | `docs/tutorial/03-agent-anatomy.md` — the `destructiveTools` and `destructiveLabels` rows, and the protocol a destructive tool must honour | the protocol binds the destructive branch, and the protective branch runs untouched |
| 1 | `docs/tutorial/05-running-and-eval.md` — the run-start throw | what `assertDestructiveConfirmable` checks when the confirmation record is only sometimes required |
| 2 | `GUARDS.md` — the contract table, `cfg.contract.writeTools` row | `writeGate` beside it: one declaration installing the state gate on every spec that carries a write |
| 2 | `docs/tutorial/03-agent-anatomy.md` — the `CONTRACT` block and the `writeTools?` row | the contract's second switch, and what a bundle loses by omitting it |
| 2 | `docs/tutorial/04-guards.md` — the auto-install ladder | a rung: `IFF contract.writeGate`, on every spec carrying a write |
| 2 | `catalog.ts` — the `precondition` entry | the condition every lane shares is a contract declaration; `precondition` stays the gate for what one lane alone refuses on |
| 3 | `packages/eval/src/lint.ts` and its `lint-spec-quality` / `lint-subject` neighbours | where the parity law and the two id laws live |
| 3 | `docs/tutorial/05-running-and-eval.md` — the preflight lint table | the lints an author runs before spending a token, and the violation string each new law prints |
| 3 | `packages/eval/README.md` | what `--spec-laws` covers |
| 3 | `BACKLOG.md` — the probe-parity lint row | the parity law's execution half and that row are the same question |
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

Files: `guard-catalog.md`, `norms.md`, `spec-template.ts`, `test.md`, `ship.md`,
`scripts/lint-authoring.mjs`.

### 4 · The proof record

| change | governed | record |
|---|---|---|
| §1 — the predicate, the throttle, the run-start assertion | `packages/core/src/**` + `packages/core/GUARDS.md` | required |
| §2 — the contract switch and the installed gate | `packages/core/src/**` + `packages/core/GUARDS.md` | required |
| §3 — the parity law and the two id laws | `packages/eval/src/**` | not a governed surface |

`confirmFirst` is a kind with a per-kind completeness describe, and §1 adds a polarity to it: the
call the predicate declines to gate, which the world executes and the guard stays silent on. The
proof carries that branch or the ratchet asserts a completeness the guard no longer has.

The skill lands in a repo with no proof gate of its own, which is why its change is named here.

## Explicitly out of scope

Any route that lets a domain read `ctx.consent` more comfortably. The value of §1 is that it removes
the reason to read it at all; a friendlier accessor would keep the surface and grow its use.
