# Guard priority — design

Date: 2026-08-06 · Status: design, not yet built · Scope: engine, skill, generated subjects
Sibling: `2026-08-06-plain-names-design.md` (the seven word renames), independent of this one.

## What a guard id says today, and what it should say

Every guard carries an id whose prefix is a LAYER:

```ts
export type Layer = 'minimal' | 'base' | 'full' | 'agent';
const LAYER_ORDER: Record<Layer, number> = { agent: 0, full: 1, base: 2, minimal: 3 };
```

The names come from a class hierarchy that no longer exists, so a reader decodes nothing from them:
`minimal:writeGate` reads as a product tier, `base:confirmFirst` as a default, and neither says why
the guard is installed or when it runs. `full` is assigned nowhere — it holds a slot in the ordering
for a member that never arrives.

The prefix does two real jobs, and both deserve a name that carries them:

```
ORDER    resolveBindings sorts each hook by it, so the first denial the model sees is chosen by it
READING  it is the first thing anyone reads on every guard, in every case target and profile key
```

## The name: priority

The field is `priority`, and it takes five values:

| priority | what it answers | guards |
|---|---|---|
| `agent` | the spec author wrote this | any kind, any number |
| `changeAllowed` | does the world accept a change at all right now? | the state gate |
| `consent` | did the user authorise this act? | `confirmFirst` · `destructiveThrottle` |
| `honesty` | did the agent tell the truth about what it did? | `claimIsGrounded` · `claimIsComplete` |
| `always` | no condition — this holds on every agent | `noDuplicateCall` · `degenerationGuard` |

Each value names the QUESTION the guard answers. That is what separates them: two guards installed
from the same declaration can answer different questions, and two that answer the same question can
come from different declarations.

`full` is deleted, with its slot in the ordering.

## Priority is not the kind's category

The catalog gives every KIND a category — a fixed property of the kind, the same for whoever binds
it. Priority is a property of the BINDING. The same kind appears at two priorities in one bundle:

```
precondition   installed by the engine as the state gate   →  changeAllowed:workspaceOpen
precondition   written by hand by the author               →  agent:viewerIsReadOnly
```

They coincide where an auto-installed guard's job matches its kind's category, and diverge where it
does not:

```
guard                  category       priority         same?
claimIsGrounded        honesty        honesty            yes
claimIsComplete        honesty        honesty            yes
confirmFirst           confirmation   consent            same idea, two words  ← unified below
destructiveThrottle    confirmation   consent            same idea, two words  ← unified below
noDuplicateCall        flow           always             no
degenerationGuard      reply          always             no
the state gate         world          changeAllowed      no
```

`noDuplicateCall` is a FLOW check that happens to be unconditional; `degenerationGuard` is a REPLY
check that happens to be unconditional. The category says what they inspect, the priority says they
depend on no declaration.

**The catalog's `confirmation` category becomes `consent`.** Where the two vocabularies mean the
same thing, they use the same word — a synonym invented to avoid the coincidence would be a second
term to learn. `consent` is also the engine's own word throughout the consent law.

## The order, and the principle behind it

```
1  agent            the author's correction wins the automatic one
2  changeAllowed    what makes the act IMPOSSIBLE comes before what makes it UNAUTHORISED
3  consent          authorisation only matters if the act can happen at all
4  honesty          what was said is checked after what was done
5  always           hygiene last: the least informative denial
```

Ordering only decides anything WITHIN a hook — guards on different hooks never compete. Measured on
a six-agent bundle, only two hooks carry more than one priority:

```
preTool    agent:48   changeAllowed:6   consent:12   always:6
onReply    honesty:12   always:6
```

So the total order above is well defined and each hook uses a slice of it. `honesty` never competes
with `changeAllowed` or `consent`; they live on different hooks.

**Open, and deliberately not decided here.** Whether `agent` should come before `changeAllowed`.
The principle on line 2 argues it should not — an author's correction masking "the workspace is
suspended" tells the operator to fix the wrong thing. But no measured case shows that defect: the
one case that looked like it (`64-suspended-workspace`) passes today, and for another reason
entirely — the agent read the suspension from its prompt and refused before calling anything.
Changing the order without a case that fails is a change nobody can check.

## The contract fields

The declaration keeps naming what the author declares; the priority names what the guards do with
it. They are two different things and do not have to share a word.

```ts
contract.writeTools    = [...]                            which tools change the world
contract.changeAllowed = { ok, reason, prose?, exempt? }   when any change is permitted at all
```

`contract.writeGate` becomes `contract.changeAllowed`: the field answers "is a change allowed",
which is what its `ok` predicate returns. `writeTools` stays — it is genuinely a list of tools, and
three separate things consume it (both honesty guards, the state gate's install surface, and
`claimIsGrounded`'s notion of which calls count as writes).

## The rename, on a real bundle

Seven engine ids change; every `agent:` id is untouched.

```
hook       today                        becomes

preTool    minimal:noDuplicateCall   →  always:noDuplicateCall
           minimal:writeGate         →  changeAllowed:workspaceOpen
           base:confirmFirst         →  consent:confirmFirst
           base:destructiveThrottle  →  consent:destructiveThrottle

onReply    minimal:degenerationGuard →  always:degenerationGuard
           minimal:claimIsGrounded   →  honesty:claimIsGrounded
           minimal:claimIsComplete   →  honesty:claimIsComplete

           agent:moneyPermission     →  agent:moneyPermission
           agent:refundCappedAtPaid  →  agent:refundCappedAtPaid
```

The state gate also loses its stutter: the priority names the question and the guard names what it
checks, so `minimal:writeGate` becomes `changeAllowed:workspaceOpen`.

## What breaks, and where it surfaces loudly

A guard id is a join key in three places, and all three fail loudly rather than silently:

- **case `targets`** — `looprun-eval lint --spec-laws` rejects a target that resolves to no
  installed guard, so a stale id is a red gate, not a silent pass.
- **profile keys** — `applyProfile` throws on an unknown id.
- **`COVERAGE_GAPS`-style ledgers in a subject's own bundle test** — asserted exactly.

Generated subjects carry stale ids in their cases and thinking logs; the sweep is mechanical (seven
strings) and the gates above catch anything missed.

## Why keep `agent` as a priority

The catalog's categories could group every guard and `agent` would disappear. Two things are lost if
it does:

- **The order.** `agent` first is what makes an author's correction win. An author's `custom` guard
  would fall into the `custom` category, which has no reason to run first.
- **Whose rule is this.** Reading a generated bundle, the most frequent question is whether a rule
  came from the author or the engine. Categories answer what a guard checks, never who wrote it.

There is also an asymmetry: the four engine priorities are CLOSED sets — two, one, two and two
guards, always the same ones. `agent` is open: any of the 21 kinds, any number of times. It is not a
category of the same sort; it is everything else.

## Order of work

```
1  engine     the Layer type → Priority, LAYER_ORDER → PRIORITY_ORDER, the seven ids,
              contract.writeGate → contract.changeAllowed, the catalog's confirmation → consent,
              delete `full`, GUARDS.md and the tutorial
2  skill      guard-catalog.md category table, norms.md, spec-template.ts, lint-authoring.mjs
3  subjects   case targets, bundle-test ledgers, thinking logs; re-run every gate
```

Acceptance: `minimal:`, `base:`, `full` and `writeGate` return zero hits across the repos, and every
subject's `lint --spec-laws` reads clean — the target check is what proves no id was missed.
