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

## 4 · The implementation

### 4.1 · `packages/emit` — new package in `looprun`

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

### 4.2 · `packages/eval` — three verbs

```
  boilerplate(lines, minRun)        packages/eval/boilerplate.mjs exists and is called by
                                    no gate line; it moves into lints.ts with tests
  overWide(subjectDir)              a rule naming more than one act declares its licence
  seamCovered(subjectDir, world)    every gate and every fail(CODE) in the world, paired to
                                    the guard that refuses earlier — the third column, the
                                    sentence an operator needs, stays the author's
```

### 4.3 · `packages/core` — one fix

`cards/agent-factory.ts:65` — already applied this session: a desk compiles only the disclosures
for acts in its own lane, so a contract disclosing an act one desk cannot perform no longer
crashes every other desk.

---

## 5 · The documentation

| doc | what changes |
|---|---|
| `README.md` | the emit step in the quickstart |
| `docs/tutorial/04-guards.md` | the channel law, and that a contract rule is stamped on every card it names |
| `docs/tutorial/**` | every lesson whose snippet hand-writes a card gains the declaration beside it |
| `docs/analysis/2026-08-20-skill-backlog.md` | the items this spec closes, struck through |
| `docs/analysis/2026-08-20-skill-adversarial.md` | unchanged — it is the record of the audit |
| `packages/emit/README.md` | the declaration shape, and every refusal with its message |

---

## 6 · The skill

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

## 7 · What this design cannot claim

The Atlas is the only subject that exists, and it was authored by hand by the same agent that
writes these pages. A score on it measures the skill against that agent's own knowledge, not
against the world. "Better than a hand author on any domain" has no measurement until a second
domain exists, and none is planned here.

The wall-clock bar is measured, not modelled: the 36 minutes above is one authoring, and the 1.5
minutes per desk is a target set against it, not a prediction derived from token rates. The
adversarial pass that produced the byte arithmetic behind it raised thirty-seven speed proposals
and every one was refuted; its FASTER section was written by the synthesiser from surviving
correctness findings, and it states its own basis as estimates rather than timings.
