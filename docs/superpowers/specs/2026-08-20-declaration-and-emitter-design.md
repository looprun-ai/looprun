# The declaration and the emitter — design

Date: 2026-08-20 · Status: OPEN · Scope: the `agentspec` skill's pages, one new package in
`looprun`, and the Atlas subject that measures both.

An agent that has read only the skill's pages authors a governed subject. Three such authorings
are now measured. This design says what they cost, what shape answers it, and what closes it.

---

## 1 · The measurement

Three authorings of the same six-desk, thirty-one-act surface, against the same hundred cases.

```
  authoring                    checks  acts     prompt B   echoes  unlicensed  pairing
  ──────────────────────────────────────────────────────────────────────────────────────
  hand-written reference          58   31/31      99 538      31        74         9
  skill, before this session      58   31/31     141 721     142        —          —
  skill, after the page fixes     86   31/31     100 489      18         0         0
```

`agentspec-bench/subjects/atlas-next` is the reference; `atlas-render2` is the last authoring;
`atlas-render-handfixed` is that same authoring cut by hand to 99 492 B, which proves the target
reachable and is kept as the witness.

### What it cost in wall clock

```
  one desk, five acts, no gate loop                14 min
  the same, iterating until the gate held          18 min
  six desks, thirty-one acts                       36 min
    of which, before the first line of cards.ts    24 min
    tool calls before that first line                54
    transcript before that first line              1.4 MB
```

Five of those fifty-four calls read the ENGINE, not the pages: `call-runner.ts`, `rulebook.ts`,
`masker.ts`, `turn.ts`, and `vocabulary.ts` for `interface CallCtx`. Two independent blind authors
made the same excursion, because no page names the fields of the four guard contexts. Every such
excursion is a page that failed to answer, and it is paid in minutes.

### Where the authored bytes go

```
  cards.ts, six desks                59 216 B
    business sentences              ~33 200 B   56%   the product
      contract guard rules           14 000 B
      disclosure tenses              12 096 B   15 destructive acts × 4 tenses
      conduct laws                    3 200 B
      personas                        1 615 B
      facts + voice                   2 299 B
    scaffolding                     ~26 000 B   44%   imports, helpers, types, spec
                                                      objects, factory wiring, `as const`
```

### Who wrote each prompt byte

Every byte this campaign optimised is one slice. The other 86% was read by no lint, and a quarter
of it is authored prose sitting in a directory named `generated/`.

```
  world `does`      25 313   25%   54 sentences, AUTHORED in the GEN phase
  schema            27 331   27%   106 authored argument descriptions + JSON structure
  system prefixes   29 943   30%   personas, facts, voice, conduct laws
  contract rules    14 255   14%   ← the only slice any lint has measured
```

Two acts sit in all six lanes and forty-two sit in one: 53 acts occupy 84 card slots, and every
byte of a six-lane act is sent six times. The desk split decides that, and N1 splits by tool-need
without pricing it.

### What the gate does not catch

```
  cases-data.ts:259   covers: ["consent:confirmFirst",
                               "tool:refundReadsTheInvoice",
                               "honesty:claimIsGrounded"]

  the engine mints    confirmFirst:cancelBooking · onlyAfter:issueRefund · claimIsGrounded
  those three keys    resolve to no guard at all
  the subject         certified
```

`changeAllowed` appears nowhere in `packages/core/src`. A ruler that reports guard coverage from
keys resolving to nothing reports fiction, and the score every other bar depends on is read
through that ruler.

Two more defects of the same kind, each found by an author paying for it:

```
  precondition inert      the engine resolves `record` from the act's own entity and target
                          argument. A surface declaring a write with no target hands the
                          predicate `record: null` on every call: the test passes, the guard
                          sits in the census, and nothing is refused. Four guards on this
                          surface had to become hand-written denies for that reason alone

  three gate lists        test.md T1, norms.md N6 and check-subject.test.ts each name a
                          different set of verbs, and NORMS exits on the shortest
```

---

## 2 · The shape

One authored artifact, one emitter, one gate, and pages that answer.

```
  world.ts ──────────────┐
                         ├──►  emit  ──►  cards.ts        ──► AgentFactory ──► gate
  declaration.yaml ──────┘                subject.ts                            │
                                          check-subject.test.ts                 ▼
                                          gen/SEAM.md                     judged run
                                          the covers keys
                                          the WHY map
                                          the expected census
```

### 2.1 · The declaration

The only artifact an author writes. Business sentences and factory parameters; no TypeScript
ceremony.

```yaml
contract:
  voice: Warm, brief, and exact about dates and money.
  facts:
    - Check-in is from 15:00 and check-out is by 11:00.
  guards:
    - act: issueRefund
      after: getInvoice
      rule: >
        Read the invoice before a refund: what can still go back is what was PAID
        minus what has ALREADY gone back, never the total and never the balance due.
  disclosure:
    cancelBooking:
      needs: { booking: getBooking, invoice: getInvoice }
      before: Cancelling {booking.room} on {booking.day} is permanent, and {invoice.amount} stays owed.

desks:
  - name: billing
    persona: The billing desk: it raises invoices, records payments and refunds money.
    tools: [generateInvoice, payInvoice, issueRefund]
    conduct:
      declareHonestly: >
        Say what ran and what did not…
```

**YAML, not TypeScript.** The typecheck a `.ts` declaration would buy is weak — `tsc` knows `rule`
is a string and nothing else. The emitter reads the world card, so it knows the act names, their
effects, their targets and which read answers from a held call's own argument. Every validation
below is stronger than a type, and none of them is reachable by `tsc`.

### 2.2 · What the emitter refuses

```
  "onlyAfter names 'getInvioce' — the surface declares no such act"
  "issueRefund is destructive and declares no `before`"
  "the precondition over 'closeBooking' reads `record`, and that act declares no target"
  "the law 'quoteTheRecord' is on four desks and missing from fleet and claims"
  "the covers key 'honesty:claimIsGrounded' names nothing the census carries"
  "the disclosure alias 'invoice' needs getInvoice to accept 'bookingId' — it declares none"
```

### 2.3 · What the emitter never does

It writes no sentence. A declaration missing a rule is an error, never a default. This is the line
between emitting scaffolding and emitting a subject: every sentence an operator reads was written
by somebody.

### 2.4 · The pages

```
  guard-catalog.md    53 984 B today, 42% of the skill, routed to five times
                      becomes a LOOKUP: the ladder and the configuration, ~8 KB
                      the seventeen lessons move to guard-catalog-lessons.md, read
                      during onboarding and never during a run

  the guard contexts  InputCtx, CallCtx, ResultCtx, ReplyCtx — every field named,
                      with one worked deny per context

  the gate            one list, in one file
```

---

## 3 · The closing gate

The skill carries **no subject numbers**. It carries the mechanisms that reduce prompt bytes and
raise determinism; what those mechanisms are worth is measured on a subject, and the subject's own
measurement carries the numbers.

### 3.1 · What the skill must hold

| mechanism | what it prevents |
|---|---|
| the factory sentence is the default; overriding is earned per act | a subject that pays for wording the factory already wrote |
| a tool rule never restates a conduct law | the same instruction stamped once per act it names |
| a rule's cost is length × acts named × lanes holding them, counted before the sentence is written | a wide rule whose every character is paid dozens of times |
| a wide rule is licensed: `oneLawEveryAct` or `sameRefusal`, or it splits | a generic sentence covering acts that need different ones |
| `boilerplate` — repeated character runs across rendered lines, priced by the cards they are stamped on | the repetition a rare-word pairing cannot see, because its words are everywhere |
| `inertChecks` — a record test over an act the surface gives no record | a guard that compiles, censuses, and refuses nothing |
| every acting act carries a deterministic check | a law enforced by nobody |

### 3.2 · What the Atlas must measure

| bar | value | today |
|---|---|---|
| assertiveness | 95 of 100, every row judged, holding across two runs | never measured |
| tokens | ≤ 109 492 B — the reference's 99 538 B plus ten per cent | 100 489 B |
| determinism | ≥ 58 checks, 31/31 acting acts, none uncovered | 86 checks, 31/31 |
| wall clock | ≤ 1.5 min per desk — 9 min for the six | 36 min |

The ten per cent is deliberate room: a subject carrying 48% more checks than the reference will
carry more sentences, and paying for them is correct when the determinism is real.

---

## 4 · How this is tested — the small subject first

The Atlas is thirty-one acts over six desks and one authoring of it costs half an hour. Nothing
reaches it until a five-act surface has proved the same path.

```
  TIER 0   fixtures            every emitter refusal of §2.2, and every new verb
                               red before green. No subject, no model.

  TIER 1   the HOTEL           docs/tutorial/snippets/hotel — three reads, one write,
           5 acts · 1 desk     one destructive act, and an exam.ts that already ships
                               three cases with rubrics and invariants.
                               declaration.yaml → emit → gate → judged run.
                               Minutes, and three cases of model spend.

  TIER 2   the ATLAS           the four bars of §3.2. Entered only when TIER 1 is green.
           31 acts · 6 desks
```

The hotel is not a toy for this: its own `exam.ts:11` declares `covers: ['consent:cancelBooking',
…]` while the engine mints `confirmFirst:cancelBooking` at `catalog.ts:96`. The tutorial that
teaches people ships a key resolving to nothing, so `coversResolve` has a red fixture waiting for
it in the file it must protect.

---

## 5 · The implementation

### 5.1 · `packages/emit` — new package in `looprun`

```
  packages/emit/src/
    declaration.ts     the YAML shape, and the reader that validates it
    against-surface.ts every refusal of §2.2, each naming the line in the YAML
    cards.ts           the cards.ts writer
    artifacts.ts       subject.ts · check-subject.test.ts · gen/SEAM.md · covers · census
    cli.ts             `looprun emit <subject-dir>`
```

It depends on `@looprun-ai/core` for `factsFromWorld`, the factory signatures and the census, and
on `@looprun-ai/eval` for the verbs the emitted gate calls. This is the relationship the lints
already have: the tool lives in the engine, the skill's pages invoke it.

### 5.2 · `packages/eval` — three verbs

```
  boilerplate(lines, minRun)        packages/eval/boilerplate.mjs exists and is called by
                                    no gate line; it moves into lints.ts with tests
  overWide(subjectDir)              a rule naming more than one act declares its licence
  seamCovered(subjectDir, world)    every gate and every fail(CODE) in the world, paired to
                                    the guard that refuses earlier — the third column, the
                                    sentence an operator needs, stays the author's
```

### 5.3 · `packages/core` — one fix

`cards/agent-factory.ts:65` — already applied this session: a desk compiles only the disclosures
for acts in its own lane, so a contract disclosing an act one desk cannot perform no longer
crashes every other desk.

---

## 6 · The documentation

| doc | what changes |
|---|---|
| `README.md` | the emit step in the quickstart |
| `docs/tutorial/04-guards.md` | the channel law, and that a contract rule is stamped on every card it names |
| `docs/tutorial/**` | every lesson whose snippet hand-writes a card gains the declaration beside it |
| `docs/analysis/2026-08-20-skill-backlog.md` | the items this spec closes, struck through |
| `docs/analysis/2026-08-20-skill-adversarial.md` | unchanged — it is the record of the audit |
| `packages/emit/README.md` | the declaration shape, and every refusal with its message |

---

## 7 · The skill

Updated in the same working session as the engine, never after.

| page | what changes |
|---|---|
| `SKILL.md` | the pipeline table gains EMIT between NORMS and EXAM; the gate is one command |
| `references/guard-catalog.md` | becomes a lookup: the ladder, the configuration, the channel law. The seventeen lessons move out |
| `references/guard-catalog-lessons.md` | new — the lessons, read once |
| `references/guard-contexts.md` | new — `InputCtx`, `CallCtx`, `ResultCtx`, `ReplyCtx`, every field, one worked deny each |
| `references/norms.md` | N6 loses the hand counting and the three-list exit; it prints, reads, and signs |
| `references/evals.md` | the `covers` key is the census's own minted name, printed and copied, never composed |
| `references/test.md` | T1 points at the one gate |

---

## 8 · What this spec covers, and what it does not

Every finding has an id: `D`/`R`/`C`/`X`/`F` from `docs/analysis/2026-08-20-skill-adversarial.md`,
`B` from `docs/analysis/2026-08-20-skill-backlog.md`, `G` from the two blind authorings recorded
there. **Every id appears in exactly one of the two columns below.** An id in neither is a
tracking defect, and §8.3 says how that is caught.

### 8.1 · IN — this spec and its plan

Admitted on one of two tests: it moves a bar in §3, or it is a defect where something WRONG
passes the gate.

| id | what | admitted because |
|---|---|---|
| F1 | emit the card scaffolding; the author writes sentences | speed — the core of this spec |
| F2 | one conduct-law text per law, emitted onto every desk | speed |
| F3 | the four N6 hand-judgements become verbs | speed · gate integrity |
| F4 | one gate list, not three | speed · gate integrity — NORMS exits on the shortest |
| F5 | delete the six duplications | speed — the reading path |
| D1 D2 D3 D4 D6 | the five duplications F5 names | speed |
| D5 | the `covers` grammar is a fossil | gate integrity |
| C1 | `destructiveDisclosed` | determinism — a destructive act with no `before` |
| C2 | `capPaths` | gate integrity — a cap whose path never resolves |
| C3 | `coversResolve` | gate integrity — three keys resolving to nothing, certified |
| C4 | `floorRedeclared` | determinism — a card redeclaring what the engine installs |
| C5 | `conductComplete` | determinism — a conduct law missing from a desk |
| C6 | `approvable` | gate integrity — a case covering a guard that cannot fire on its preset |
| C11 | the N6 snippet does not run as printed | speed — the author debugs the page |
| C12 | the repo's declared lints do not exist | gate integrity |
| R1 | the certification bar — 0.95, and `ship.md` says otherwise | gate integrity — a ship page certifying below the bar |
| R2 | the conduct laws are six | applied this session, `93eb895` |
| R3 | the template the skill hands an author is RED under two lints the skill's own gate requires empty — seven findings converge on it | it is the first thing an author copies, and it fails the gate on arrival |
| R4 | the `WHY` map's minted names | gate integrity — the drift that produced seven findings |
| R5 | `cap.at` — the alias root | a check whose path never resolves |
| R6 R7 | a `gates` entry has no `detail`; `fail(CODE)` is `{ refuse }` | both blind authors were misled |
| R10 | the resume panel has no G3 cell | a resumed run skips a phase and authors a broken subject |
| R13 | N1's input is the world card | speed |
| R14 | `SKILL.md`'s paths | speed |
| R15 | `ask.md` — English | house law, admitted regardless of any bar |
| F6 | fix the panel and the four stale headers | merged with R10 — same defect, same edit |
| C7 C8 C9 C10 | wire the verbs that already exist | gate integrity — verbs shipped and called by no gate line |
| X6 | the two byte totals stop being a hand count | speed |
| B2 | `boilerplate` wired into the gate | tokens — 2 728 B on one subject, unreachable by `echoes` |
| B3 | a wide rule is licensed — `overWide` | tokens |
| B4 | `echoes` excludes generated lines | gate integrity — a row the author cannot act on |
| G-A | `covers` has no stated grammar | same defect as D5 and C3 |
| G-B | `{args.*}` over an optional argument | both authors found it by running the world |
| G-C | a nested argument has no rung | the ladder cannot reach a writable value |
| G-D | the four guard contexts are named nowhere | speed — the excursion two authors made |
| G-E | `promptLines` is a superset | gate integrity — rows between lines never read together |
| G-F | `precondition` names itself after all its tools | a stale mechanism sentence |
| G-G | the surface count is 54, not 31 | an author sizing its work from the wrong number |
| B1a | the DETERMINISTIC half of the byte analysis | tokens |
| B6 | the speed bar | resolved in §3.2 as 1.5 min per desk; the twenty-fold reading is refuted in §8 |
| S1 | `subject.ts` emitted | three fixed lines an author should never type |
| S2e | `check-subject.test.ts` emitted | the one gate list, generated from the verbs it runs |
| S3 | `gen/SEAM.md` emitted | every gate and every `refuse` in the world, paired; the third column stays the author's |
| S4 | the `covers` keys emitted from the compiled census | gate integrity — closes D5, C3 and G-A at the source |
| S5 | the `WHY` map emitted from the declaration's own law names | gate integrity — closes R4 |
| S6 | the expected census emitted, and the gate compares it to what compiled | determinism — a guard that vanishes is caught |
| V1 | which messages a word-check may search | two authors wrote their own tokeniser to resolve it |
| V2 | a guard deliberately not written has nowhere to be recorded | an unchecked act reads as an oversight |
| V3 | `secrets` and a rewrite are enforced and read by nobody | the channel lines ask about guards only |
| V4 | G3 walks `gates`, and a world may have none | the seam table is empty by construction |
| V5 | an argument-dependent capability fits no licence | the catalog prescribes a shape `unlicensed` flags |
| V6 | a `needs` read no read on the surface can answer | the operator approves a lift without reading it |
| V7 | the 2x ratio line is unmeasurable as written | each author picked its own reading |
| V8 | which card a shared gate belongs on — 29 copies or six | the arithmetic is taught nowhere |
| U1 | the GEN phase authors 54 `does` sentences, unmeasured | 25% of the prompt, no lint |
| U2 | the GEN phase authors 106 argument descriptions, unmeasured | same channel |
| U3 | the desk split prices no byte — two acts sit in all six lanes | every byte of a six-lane act is paid six times |
| W1 | "An invariant names the REQUIREMENT, not one path to it" is a verbatim heading in two files | survived refutation and appears in no item of the audit's own fix list |
| W2 | `gen.md`'s form/argument line omits `make`, the one form whose argument is not the target | same — a survivor the consolidation dropped |
| W3 | the unfillable-tense law is unconditional in one home and conditional in the other | same |

### 8.2 · OUT — the next spec

Not admitted: each is real and verified, and none moves a bar or lets a defect through the gate.
They are ceremony, dead pointers, and unowned files.

| id | what | why it waits |
|---|---|---|
| X1 | `S2` as a phase | its whole content is "never run it" — four deletions, no bar |
| X2 | `debate.md` — wire it or delete it | orphaned, and the decision is a product one |
| X3 | `local-performance.md` + `judge-ruler.md` — link or delete | reachable from nowhere; the judging rules matter and no bar measures them |
| X4 | `extract-fork.mjs`, `synth-fork.mjs` | named by no page, in either repo |
| X5 | `local-performance.md`'s parenthetical title | wording |
| R8 | `sync` and `census` signatures | tooling documentation |
| R9 | `ask/targets.json`'s schema | no authoring reaches it |
| R11 | status words — six renameable, five installed, one renders | wording, and no bar sees it |
| R12 | `resume.md`'s dead pointers | resume is not measured by any bar. Only the missing G3 cell is admitted above, because a run resuming without it authors a broken subject; the rest of the page waits |
| G-H | case 48 cannot be satisfied by a tool-need split | an exam-design problem, not an authoring one |
| B1b | the SEMANTIC half of the byte analysis | it needs a reader per sentence and a judged run to prove "no loss". It is its own spec, and it opens from the numbers this one produces |
| B5 | the remaining gaps of the two authorings | folded into B1b and the next spec |
| — | the ten LEAVE ALONE rows | the audit judged them load-bearing; no action is the finding |

### 8.3 · How this is tracked

Three registers, and an id lives in exactly one of them at a time.

```
  docs/analysis/2026-08-20-skill-adversarial.md    the AUDIT — never edited again.
                                                   It is the record of what was found.

  docs/superpowers/plans/<this spec>.md            the IN column. One task per id, or one
                                                   task naming several ids. A task's
                                                   checkbox IS the item's status.

  docs/analysis/2026-08-20-finding-trace.md        the MAP — all eighty surviving findings,
                                                   read one by one, each against the item
                                                   that carries it. Three text heuristics
                                                   failed to recover it; it was built by hand.

  docs/analysis/2026-08-20-skill-backlog.md        the OUT column, in a section named
                                                   "deferred by the declaration spec",
                                                   each id with its one-line reason.
                                                   The next spec opens from that section.
```

The closing check is mechanical: every id in §8.1 appears in the plan, every id in §8.2 appears in
the backlog's deferred section, every one of the eighty findings in the map carries an id from one
of the two, and the two sets do not intersect.

The check reads ids from the FIRST COLUMN of a table row, never from free text. An earlier reading
scanned the whole row and reported `S2` as a duplicate, because the row describing the SHIP
sub-stage `S2` contains that literal. A checker that reads prose invents its own defects.

---

## 9 · What this design cannot claim

The Atlas is the only subject that exists, and it was authored by hand by the same agent that
writes these pages. A score on it measures the skill against that agent's own knowledge, not
against the world. "Better than a hand author on any domain" has no measurement until a second
domain exists, and none is planned here.

The wall-clock bar is measured, not modelled: the 36 minutes above is one authoring, and the 1.5
minutes per desk is a target set against it, not a prediction derived from token rates. The
adversarial pass that produced the byte arithmetic behind it raised thirty-seven speed proposals
and every one was refuted; its FASTER section was written by the synthesiser from surviving
correctness findings, and it states its own basis as estimates rather than timings.
