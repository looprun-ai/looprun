# A report that hides nothing passes, and the result decides whether a disclosure is printed

**Date** 2026-08-10 · **Scope** `looprun`, `agentspec-bench/subjects/atlas` ·
**Status** RECORD, not a spec — nothing here is owed.

Two engine changes and one contract change, all in the source. What follows is the measurement that
justified them, the diffs verbatim, every doc the change touched, the skill, and what the build
still does not do.

---

## 1 · The measurement

The full 100-case exam, N=1, subject model `gemini-3.1-flash-lite`, judged by the agent in the
session against the sealed ruler `subjects/atlas/evals/judge-prompt.md`.

```
run directory (under subjects/atlas/test/)   final    what the run carried
────────────────────────────────────────────────────────────────────────────────────────────────
2026-08-10-r19-full-v019                     79/100   the published 0.19.0
2026-08-10-r22-full                          83/100   the contract's refusal laws + two `after`
                                                      sentences · the ENGINE change did not load
2026-08-10-r24-full                          85/100   the same, with eval and mastra resolving
                                                      the local core, and the plan figures on the read
```

### 1.1 · The run that measured nothing

`r22` was reported as measuring an engine change it never executed. A `file:` dependency on a locally
packed `@looprun-ai/core` replaces only the top-level symlink; `@looprun-ai/eval` and
`@looprun-ai/mastra` declare their own dependency on core, and pnpm resolves that to the registry:

```
node_modules/@looprun-ai/core                      -> core@file:.local-pkgs/…   inspected
.pnpm/@looprun-ai+eval@file+…/node_modules/core    -> core@0.19.0               EXECUTED
.pnpm/@looprun-ai+mastra@file+…/node_modules/core  -> core@0.19.0
```

`pnpm.overrides` forces every dependent onto one resolution. Before trusting a run of an unreleased
engine, check the core each PACKAGE resolves — a grep of the top-level path proves nothing.

### 1.2 · What the order rule cost

`claimIsComplete` walks the acts and asks whether each one is accounted for. It compared position
for position, so a complete report was rejected for its order alone:

```
the turn        generateQuote landed · createBooking was blocked by the plan cap

reported        the booking blocked, then the quote succeeded      DENIED
reported        the quote succeeded, then the booking blocked      PASS
reported        the booking blocked, and nothing else              DENIED   (correct — hiding)
```

The middle row is what the model naturally produces: the outcome the user asked about, first. And
the deny named nothing:

```
You reported 2 operation(s) but 1 happened, and they do not line up — report each act as what
it actually was, in the order you did them.
```

The engine knew it was `generateQuote` and would not say. The turn's correction budget is ONE
re-generation (`DEFAULT_REDRIVES = 1`), so an unactionable correction does not produce a second
attempt — it produces the exhaustion closure, and every rubric item fails because the model's own
words never reach the user.

### 1.3 · What binding a disclosure to an effect cost

`after` rendered only for a call with `tookEffect === true`. A turn that REFUSES runs no act at all,
so the engine went silent exactly where the operator needs the figures behind the refusal:

```
the world returned                            the reply said
activeBookings 3 · bookingCap 3               "at our active-booking capacity of 3"
seatsUsed 2 · seatCap 2                       "at its seat cap of 2"
```

Both figures were read. Only one reached the operator. And the contract already held the sentence
that states both — on `changePlan`, where it only ever appeared above a consent question.

Dropping the flag alone is worse than keeping it. A call the world refused carries no facts, and its
sentence renders as if it did:

```
payInvoice    refused  ->  NA recorded against NA: it is now NA with NA still due.
cancelBooking refused  ->  NA is cancelled and NA is free again; NA of deposit is still held.
```

The second line is the engine — which the model cannot soften or omit — announcing a cancellation
the world refused.

---

## 2 · Both directions spend

`packages/core/src/guards/honesty.ts`

```ts
      const declared = (ctx.did ?? []).filter((c) => isActionOp(c.op));
      const spent = new Set<number>();
      for (const act of acts) {
        const at = declared.findIndex(
          (c, i) => !spent.has(i) && act.outcomes.has(resolveOutcome(c.outcome ?? '', opts.outcomes) as CoreOutcome),
        );
        if (at >= 0) {
          spent.add(at);
          continue;
        }
        return `Nothing in your report accounts for what ${act.name} did this turn — report every act that happened as what it actually was, naming the record it touched.${declarableHint([act], [])}`;
      }
      return null;
```

A declaration covers one act, whichever act carries its word, and is then gone. Hiding is an act
with no declaration left to cover it. The order of the report is the agent's own.

### 2.1 · The deny names the act

`DerivedAct` gains the tool name, set in `derivedActs` for both the vetoed attempts and the calls:

```ts
interface DerivedAct {
  name: string;
  outcomes: Set<CoreOutcome>;
  args: unknown;
  result: unknown;
}
```

Both halves of the new deny are the agent's own — the tool it called this turn, and the word the
engine derived for it — so the deny carries no fact the agent has not already seen. A WORLD FACT is
what a deny must never carry: a figure or a record the agent would then state to the user without
ever reading it.

```
Nothing in your report accounts for what generateQuote did this turn — report every act that
happened as what it actually was, naming the record it touched. Declarable with this turn's
evidence: success.
```

---

## 3 · The result decides whether a disclosure is printed

`packages/core/src/runtime/disclosure.ts`

```ts
/** Does this result carry a value for EVERY slot the sentence names? */
function fillsEverySlot(sentence: string, result: unknown): boolean {
  for (const m of sentence.matchAll(SLOT)) {
    const v = walk(result, m[1].split('.').slice(1));
    if (v === null || v === undefined || typeof v === 'object') return false;
  }
  return true;
}

export function renderAfterAct(
  tool: string,
  result: unknown,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
): string {
  const template = contract?.disclose?.[tool]?.after;
  if (!template || !fillsEverySlot(template, result)) return '';
  return fillFrom(template, result, contract?.discloseMissing ?? MISSING);
}
```

`packages/core/src/runtime/turn.ts`, in `composeDeliveryText`:

```ts
  const after = (actionHistory?.observed ?? [])
    .filter((c) => c.turnIndex === actionHistory.turnIndex && c.ok !== false && !isTerminal(c.name) && 'result' in c)
    .map((c) => renderAfterAct(c.name, c.result, contract))
    .filter((t) => t.trim())
    .join('\n');
```

Every ok call is offered, reads included. The renderer prints only what the result grounds:

```
payInvoice returned the payment      "2930 recorded against inv_7001: 0 still due."
payInvoice was refused               (silent)
getPlanUsage returned the usage      "…using 6 of 15 seats and 2 of 40 bookings."
```

A read is served by the same rule, and that is the whole point: a domain that authors a sentence for
a read gets it printed on the turn that read it, which is the only place the engine can speak when
the reply refuses and no act ever runs.

### 3.1 · The figures ride the read

`agentspec-bench/subjects/atlas/norms/contract.ts`. The sentence that states plan usage moves off the
act and onto the read; the tier consequence stays with the act:

```ts
    getPlanUsage: {
      after: 'This workspace is on {getPlanUsage.plan}, using {getPlanUsage.seatsUsed} of '
        + '{getPlanUsage.seatCap} seats and {getPlanUsage.activeBookings} of '
        + '{getPlanUsage.bookingCap} bookings.',
    },
    changePlan: {
      before: 'Changing the tier moves the seat and booking caps and may change what is billed.',
```

The two sentences say different things and appear together without repeating a figure:

```
Changing the tier moves the seat and booking caps and may change what is billed.
To confirm switching this workspace to a different plan tier, reply: CONFIRM CHANGEPLAN-6C21
This workspace is on fleet, using 6 of 15 seats and 2 of 40 bookings.
```

And on a turn that refuses, where no question is asked at all:

```
I cannot invite them as a dispatcher because the workspace is currently at its seat cap of 2
seats. You would need to upgrade your plan to add more members.

This workspace is on starter, using 2 of 2 seats and 1 of 3 bookings.
```

### 3.2 · The refusal laws

Two clauses on the same contract, each grounded in a value the model had already read:

```ts
'A record that is frozen, disputed, unpaid or over a plan limit stays that way until the condition
 itself is cleared: report the blocker with the figures behind it — a limit is reported together
 with what stands against it, never on its own — offer the legitimate way to clear it, and never
 work around it.'

'What a person can do here follows the role recorded against them … and a refusal on authority
 names the role the record carries for the person acting.'
```

Plus `after` sentences for `cancelDispatch` and `updateAssetCondition`, whose results carry the
technician and the freed date, and the condition change with the fact that no claim was opened.

---

## 4 · What the runs showed

`r24` against `r22`, the cleanest comparison the instrument has produced:

```
tool calls, byte for byte      100 / 100 identical
guard events, byte for byte    100 / 100 identical
delivered reply                 90 / 100 identical
final                          83 → 85
```

The ninety identical transcripts inherited their verdicts; the ten that differ are exactly the cases
that read the plan, and two of them flipped to pass on the sentence the read now carries.

**The honesty change is inert on this exam.** Guard events are identical across all one hundred
cases, so `claimIsComplete` never reached a different verdict here: these trajectories declare their
acts in the order they ran them. The order defect is real and is held by the unit tests; the exam
does not exercise it. Nothing in §1.2 is attributed to the exam number.

---

## 5 · The documentation

| file | what changed |
|---|---|
| `packages/core/src/assembled-prompt.ts` | the `disclose` header: `after` is offered every ok call including reads, and the result decides whether it prints; `discloseMissing` is described as the `before` marker |
| `packages/core/src/runtime/disclosure.ts` | `renderAfterAct`'s header states the rule and shows the three outcomes |
| `packages/core/src/runtime/turn.ts` | the `after` block states why binding to an effect leaves a refusal silent |
| `packages/core/src/guards/honesty.ts` | `claimIsComplete`'s header states that both directions spend and that the order is the agent's own; `DerivedAct` states why a tool name may enter a deny and a world fact may not |
| `docs/tutorial/03-agent-anatomy.md` | the contract table rows for `disclose` and `discloseMissing`, and the slot section, with a read-disclosure example |

## 6 · The skill

`agentspec` teaches the contract a domain author writes. The `disclose` reference gains the read
tense: a sentence may be authored for a READ tool, and it is printed on the turn that read it. The
authoring rule that a sentence must read correctly with `NA` standing in a slot now applies to
`before` alone — an `after` sentence is silent rather than marked, so it is written for the result
that grounds it and needs no marker-safe phrasing.

## 7 · What this build does NOT do

**`before` still prints `NA`.** Fifteen turns of the r24 exam carry a consent question whose sentence
states a non-fact:

```
Voiding NA cancels a document of NA; a voided invoice is closed for good.
To confirm voiding an invoice, reply: CONFIRM VOIDINVOICE-DCB7
```

The same rule would silence it, and silencing it would take the domain's warning with it — `a voided
invoice is closed for good` is true whether or not the total was read. Whether an unfillable
disclosure should suppress the sentence, suppress the clause, or refuse the consent altogether is
open.

**The `NA` marks a read that never happened.** In the case above the model called `getBooking`, never
`getInvoice`. `looprun-eval validate` already reports the same 27 slots offline. Whether the engine
should demand the read before it will ask for consent is open.

**Three exam failures need a read that never happened.** `62` needs the customer record, `80` needs
`listBookings`, `100` needs `listMembers`. No disclosure reaches a fact that never entered the turn;
two of the three are the run's dirty invariants.

## 8 · The state of the build

```
looprun          09d3cce  fix(core)!: a report that hides nothing passes, and the deny names the act
                 08fce66  fix(core)!: the result decides whether a disclosure is printed, not the call
agentspec-bench  5521217  feat(atlas)!: a refusal carries the figures and the role the record holds
                 2dd0889  feat(atlas)!: the plan figures ride the read, so a refusal states them
```

2005 tests pass across the monorepo; four failures predate this work and are unchanged by it. The
bench is pinned to the published `0.19.0`; `r24` ran against the local build, which is stated in its
`JUDGE.md`.
