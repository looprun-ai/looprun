# Guard priority — design

Date: 2026-08-06 · Status: design, not yet built · Scope: engine, skill, generated subjects
Sibling: `2026-08-06-plain-names-design.md`, shipped in v0.13.0. This rename is independent of it and
obeys the same two rules — no compatibility alias, and no name is explained by what it replaced.

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
precondition   installed by the engine as the state gate   →  changeAllowed:precondition
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
precondition           world          changeAllowed      no
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

## What carries the name

Three surfaces carry it, and all three move together.

```ts
export type Priority = 'agent' | 'changeAllowed' | 'consent' | 'honesty' | 'always';

const PRIORITY_ORDER: Record<Priority, number> =
  { agent: 0, changeAllowed: 1, consent: 2, honesty: 3, always: 4 };

interface GuardBinding   { priority: Priority; … }
interface MutatorBinding { priority: Priority; … }

addGuard(hook, target, guard, { priority?, id? })
addReplyCheck(guard, { priority?, id? })
addMutator(mutator, { priority?, id? })
```

`Priority` is exported from `@looprun-ai/core`, so this is a breaking change to the public type.
`packages/eval/src/norms-config.ts` passes the field on seven installs; each becomes `priority`.

**The minted id does not change.** When an author passes no `{ id }`, the prefix comes from the same
default on both sides:

```
`${opts?.layer    ?? 'agent'}:${guard.kind}#${++this.seq}`   →  agent:precondition#3
`${opts?.priority ?? 'agent'}:${guard.kind}#${++this.seq}`   →  agent:precondition#3
```

So no author-written guard re-points, and no case target or profile key in a generated subject moves
for a guard the author added. Only the engine's own seven installs carry a new prefix.

## One rule for the seven engine ids

An engine-installed guard's id is its PRIORITY and its KIND, with no exception:

```
priority        kind                    id
────────────────────────────────────────────────────────────────
always          noDuplicateCall         always:noDuplicateCall
always          degenerationGuard       always:degenerationGuard
honesty         claimIsGrounded         honesty:claimIsGrounded
honesty         claimIsComplete         honesty:claimIsComplete
consent         confirmFirst            consent:confirmFirst
consent         destructiveThrottle     consent:destructiveThrottle
changeAllowed   precondition            changeAllowed:precondition
```

The state gate is the one id today that does not name its kind — its kind is `precondition` and its
id says `writeGate`, the name of the declaration that installed it. Under the rule the declaration's
name leaves the id, because the priority already says which declaration it came from.

The name must also stay domain-agnostic: the engine mints ONE id for every domain, and the condition
behind it is the domain's own. `changeAllowed:precondition` says the engine's two facts — the
question the guard answers and the check it performs — and says nothing the engine cannot know.

## The one place the rename changes behaviour

Two lines decide which guards the coverage census demands a case for:

```ts
// packages/eval/src/lint-subject.ts:43  ·  packages/eval/src/validate.ts:93
.filter((b) => !b.disabled && b.layer !== 'minimal')
```

`minimal` splits into three priorities, so there is no single value to transcribe. The rule becomes:

```ts
.filter((b) => !b.disabled && b.priority !== 'always')
```

**What that changes, and why it is the rule the comment always stated.** The exclusion exists for
guards "the constructor installs on every spec in every domain". Only `always:*` is that. The other
two arrive from THIS bundle's own declarations — `honesty:*` iff `contract.writeTools` is non-empty,
`changeAllowed:*` iff the contract declares the gate — exactly as `consent:*` arrives from
`destructiveTools`. A bundle that declares a write surface and never exercises the honesty pair has
a coverage hole, and the census is the thing that exists to name it.

Measured on the atlas bundle's `evals/cases.ts`, the demand is already met:

```
id                          case targets   counted today   counted after
─────────────────────────────────────────────────────────────────────────
base:confirmFirst                     44        yes             yes
base:destructiveThrottle               8        yes             yes
minimal:claimIsGrounded               59        no              yes   ← new demand, already met
minimal:claimIsComplete                7        no              yes   ← new demand, already met
minimal:writeGate                      5        no              yes   ← new demand, already met
minimal:noDuplicateCall                1        no              no
```

The rule change files no finding against the bundles that exist, and holds every future one to the
sentence the code already carried.

## The contract fields

The declaration keeps naming what the author declares; the priority names what the guards do with
it. They are two different things and do not have to share a word.

```ts
contract.writeTools    = [...]                             which tools change the world
contract.changeAllowed = { ok, reason, prose?, exempt? }   when any change is permitted at all
```

`contract.writeGate` becomes `contract.changeAllowed`: the field answers "is a change allowed",
which is what its `ok` predicate returns. `writeTools` stays — it is genuinely a list of tools, and
three separate things consume it (both honesty guards, the state gate's install surface, and
`claimIsGrounded`'s notion of which calls count as writes).

The field name reaches five places beyond its declaration:

```
packages/core/src/spec.ts             the read, and two construction-error messages
packages/core/src/assembled-prompt.ts the `writeGate?` input the prompt renders from
packages/core/src/guards/catalog.ts   the `precondition` entry's "when to reach for it" prose
packages/eval/src/lint-subject.ts     the WRITE-REFUSED-UNGATED finding's repair sentence
packages/core/GUARDS.md · tutorial 03 · 04 · 05
```

The finding's NAME stays `WRITE-REFUSED-UNGATED`: it names a world that refuses a write no lane
gates, which is what it always named, and no rename touches the words in it.

## The rename, on a real bundle

Seven engine ids change; every `agent:` id is untouched.

```
hook       today                        becomes

preTool    minimal:noDuplicateCall   →  always:noDuplicateCall
           minimal:writeGate         →  changeAllowed:precondition
           base:confirmFirst         →  consent:confirmFirst
           base:destructiveThrottle  →  consent:destructiveThrottle

onReply    minimal:degenerationGuard →  always:degenerationGuard
           minimal:claimIsGrounded   →  honesty:claimIsGrounded
           minimal:claimIsComplete   →  honesty:claimIsComplete

           agent:moneyPermission     →  agent:moneyPermission
           agent:refundCappedAtPaid  →  agent:refundCappedAtPaid
```

## What breaks, and where it surfaces loudly

A guard id is a join key in three places, and all three fail loudly rather than silently:

- **case `targets`** — `looprun-eval lint --spec-laws` rejects a target that resolves to no
  installed guard, so a stale id is a red gate, not a silent pass.
- **profile keys** — a generated subject's own `applyProfile` throws on an unknown guard id, and its
  bundle test iterates every `profiles/*.ts` and asserts each `guardProse` key resolves.
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

There is also an asymmetry: the four engine priorities are CLOSED sets — `changeAllowed` holds one
guard, `consent` two, `honesty` two, `always` two, always the same ones. `agent` is open: any of the
21 kinds, any number of times. It is not a category of the same sort; it is everything else.

## Where the names live

Measured with `rg "minimal:|base:|LAYER_ORDER|\bwriteGate\b|layer:|\.layer\b|\bLayer\b"`, excluding
`node_modules`, `dist` and every path under `results/`:

```
repo               hits   files   note
──────────────────────────────────────────────────────────────────────────────
looprun             169      43
agentspec-bench     613      29   468 of these are 8 run transcripts — excluded
looprun-bench        44      24   excluded, see below
agentspec            10       3
homeservices          5       4
lawfirm               5       3
accounting            1       1
```

**`looprun-bench` is excluded, on the rule its sibling design set.** Each of its editions pins the
engine that measured it, so an edition renames only when it is rebuilt on a post-rename engine.

**A run transcript is excluded.** `agentspec-bench/subjects/atlas/test/*/cases.jsonl` records what a
model did on a date, guard denials and all. Editing the ids inside makes the record disagree with
the run that wrote it. That leaves 145 hits across 21 files in that repo, of which
`subjects/atlas/evals/cases.ts` (71) and `subjects/atlas/gen/world.ts` (32, all `writeGate`) are the
bulk.

The `agentspec` skill is small and exact — three files, ten spots:

```
skill/references/guard-catalog.md   the auto-install list (`base:confirmFirst`,
                                    `base:destructiveThrottle`), "every other kind is
                                    agent-layer", the binding-resolution order
                                    `agent → full → base → minimal`, the `precondition`
                                    row's `contract.writeGate`, the world-refuses-every-write row
skill/references/norms.md           the profile JOIN KEY namespaces (`agent:*`, `base:*`,
                                    `minimal:*`), and two statements of `contract.writeGate`
skill/references/spec-template.ts   "agent-layer guards" in the file's opening map
```

**`layer` stays ordinary English and the sweep must not touch it.** The skill's own vocabulary uses
the word for something else entirely, in twenty-four places:

```
the two-layer law · the action layer · the language layer · the honesty layer · the governance layer
```

None of those name a guard's priority, and renaming them would replace a working idea with a
mismatched one.

## What makes it verifiable

The join-key check is the real gate, and it already ships: `looprun-eval lint --spec-laws` resolves
every case target against the guards its bundle installed, so a target left on a dead id is a red
run. Every subject repo runs it.

A narrow grep gate holds the four dead identifiers out of every file a person reads:

```
BANNED, exact          minimal:      base:      LAYER_ORDER      writeGate
BANNED, identifier     Layer  as a type name or import
                       layer  ONLY where it is a property: `layer:` or `.layer`
UNTOUCHED              layer  as a word — "the action layer", "the two-layer law"

EXCLUDED PATHS         **/results/**                       a number taken on a date
                       **/test/*/cases.jsonl               a run's own transcript
                       looprun-bench/                       every edition pins its engine
                       node_modules/  dist/
```

`CHANGELOG.md` is read by the gate the way a benchmark result is — not at all. A dated release note
keeps the names its release shipped, and the record of a breaking rename IS the pair of names:

```
Breaking, @looprun-ai/core: Layer → Priority, GuardBinding.layer → .priority,
contract.writeGate → contract.changeAllowed, and the seven engine guard ids.
```

## Order of work

The engine first, because everything else quotes it. Then the skill, whose references teach the
names to every future subject. Then the subjects, which quote both.

```
1  looprun          Layer → Priority, LAYER_ORDER → PRIORITY_ORDER, the binding field, the seven
                    ids, contract.writeGate → contract.changeAllowed, the catalog's
                    confirmation → consent, delete `full`, the census rule, GUARDS.md, tutorial
                    03 · 04 · 05 and the tutorial snippet; the grep gate ships here
2  agentspec        guard-catalog.md, norms.md, spec-template.ts
3  agentspec-bench  case targets, profile keys, bundle-test ledgers, gen/world.ts, thinking logs
4  accounting · lawfirm · homeservices    eleven hits across eight files
```

Each repo lands as one commit — a partial rename is worse than none, since a reader then meets both
vocabularies in the same file.

Acceptance: the grep gate exits zero on every repo in the list, and every subject's
`lint --spec-laws` reads clean — the target check is what proves no id was missed.
