# A report that hides nothing passes, and the result decides whether a disclosure is printed

**Date** 2026-08-10 · **Scope** `looprun`, `agentspec-bench/subjects/atlas`, `agentspec` ·
**Status** RECORD · CLOSED — engine, docs, subject and skill shipped; nothing here is owed.

Three engine changes and the contract changes they enable, all in the source. What follows is the measurement that
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
2026-08-10-r27-full                          85/100   four `before` sentences rewritten so they name
                                                      no figure the turn cannot fill · 15 → 4 markers
2026-08-10-r32-full                          85/100   the reads a consent question owes are FORCED
                                                      · 4 → 0 markers
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

`agentspec` teaches the contract a domain author writes. The `disclose` reference carries the read
tense: a sentence may be authored for a READ tool, and it is printed on the turn that read it. The
authoring rule that a sentence must read correctly with `NA` standing in a slot applies to `before`
and `later` — the two tenses the engine marks rather than drops — while an `after` sentence is
silent rather than marked, so it is written for the result that grounds it and needs no marker-safe
phrasing. The `before`-slot lint keeps its `requiresBefore` binding, with its message restated on
the forced read: the forcing backstops an open question on an agent that holds the tool, and is not
a licence to drop the demand the author can see offline.

## 7 · The reads a consent question owes are FORCED, never asked for

A `before` sentence names the reads its figures come from. When one never ran, the operator was asked
to agree to an act described by a marker where the record belongs:

```
Voiding NA cancels a document of NA; a voided invoice is closed for good.
To confirm voiding an invoice, reply: CONFIRM VOIDINVOICE-DCB7
```

**Telling the agent to read is not a mechanism.** Built first as a preTool veto — refuse the act,
issue no approval, tell the agent to read and call again — it was measured on the four cases that
print the marker: the agent read and then replied, and two of the four ended with the act never put
to the user at all. That is worse than the marker.

```
                              09      10      14      95
as a veto, agent must comply  FAIL    ok      ok      FAIL
as a forced call              ok      ok      ok      ok
```

The engine already drew the distinction, in `run-conversation.ts`'s own words: *veto guards only
BLOCK a wrong call; a chain deterministically COMPLETES a required missing follow-up.* The
requirement is the second kind, and `flowChain`'s `'llm'` mode is the machinery — a single-tool
generation the provider cannot decline.

`packages/core/src/runtime/turn.ts`:

```ts
export async function runDisclosureCompletionPass(
  actionHistory: TurnActionHistory,
  contract: Pick<DomainContract, 'disclose'> | undefined,
  surface: readonly string[],
  forceLlmCall: (call: string) => Promise<void>,
): Promise<{ corrections: string[]; llmCalls: number }>
```

`packages/mastra/src/run-conversation.ts`, after the chain pass and before the reply is composed —
the only window in which a read still reaches `renderDisclosure`:

```ts
{ activeTools: [call], toolChoice: 'required', stopWhen: [stepCountIs(1)], hooks: guardHooks, ...genParams }
```

Three limits are deliberate. Only a read that NEVER RAN is forced, so a field the record leaves empty
cannot demand a call that would change nothing. Only a tool the acting agent HOLDS is forced — the
desk that owns the read is a different agent, and the marker is the honest outcome there. And the
pass BLOCKS NOTHING: the question was already raised and its code already issued, so a read that
fails leaves the marker standing and the operator sees exactly what the engine could not learn.

The forced call runs through the same `guardHooks` as any other, so governance is not bypassable by
this route.

```
turns printing `NA`   r24: 15   r27: 4   r32: 0
```

## 8 · What this build does NOT do

**A marker still stands where a read came back empty.** Forcing a call closes the gap the agent could
close; it cannot fill a field the record leaves null. `looprun-eval validate` reports 26 such slots
offline, and each one is an authoring question for the domain — the sentence names a figure the world
does not always hold.

**A read the acting agent does not hold is never forced.** A `before` that names another desk's tool
renders its marker, because forcing a tool onto an agent that was not given it is a surface breach.

**The simulate route is untouched.** A destructive tool whose schema carries `simulate` has its
approval issued from the world's own `requiresConfirmation` result, not from the consent veto, so its
disclosure is composed on a path this pass does not sit on. No tool in this subject takes that route.

**A required read is still a veto.** `requiresBefore` states the same kind of requirement and
forces nothing; whether it should is an open item, with its context and its trap in `BACKLOG.md`.

**Three exam failures need a read that never entered the turn at all.** `62` needs the customer
record, `80` needs `listBookings`, `100` needs `listMembers`. Those reads ground no disclosure, so
nothing names them for the pass to force; two of the three are the run's dirty invariants.

## 9 · The state of the build

```
looprun          09d3cce  fix(core)!: a report that hides nothing passes, and the deny names the act
                 08fce66  fix(core)!: the result decides whether a disclosure is printed, not the call
agentspec-bench  5521217  feat(atlas)!: a refusal carries the figures and the role the record holds
                 2dd0889  feat(atlas)!: the plan figures ride the read, so a refusal states them
                 e4ef18f  fix(atlas)!: the consent question stops stating figures nobody read
agentspec        b394f24  docs(skill): a read carries a sentence, and the marker belongs to before
                          and later
```

2012 tests pass across the monorepo; four failures predate this work and are unchanged by it. The
bench is pinned to the published `0.19.0`; every run from `r24` on ran against the local build, which
each run's `JUDGE.md` states.
