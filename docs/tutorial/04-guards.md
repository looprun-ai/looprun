# 4 · Guards

A guard is one sentence and, where a machine can decide it, one pure check that means exactly
that sentence. The sentence is what the model is told, what the person is told when a call is
refused, and what `agent.guards()` prints. One string, three jobs — they cannot drift apart.

```typescript
export interface Guard {
  name: string;                    // unique on the card; the census keys on it
  rule: string;                    // THE sentence — present tense, never accusatory
  on: 'input' | 'preTool' | 'postTool' | 'reply';
  tool?: string | readonly string[];
  deny?: (ctx) => string | null;   // a pure check: the detail for THIS violation, or null
  judgeQuery?: string;             // a yes/no question, answered by the session's own model
}
```

## Three strengths of the same thing

```
  prose only      { name, rule, on }               the rule rides the prompt
  deterministic   { …, deny }                      a pure function refuses
  judged          { …, judgeQuery }                the session's own model answers yes/no
```

`deny` and `judgeQuery` are exclusive — declaring both throws at construction. Reach for
judged only when no check can decide: it costs a model call on every reply.

A prose-only guard is a real guard. It appears in the census, it rides the prompt, and it is
the honest shape for a rule no function can evaluate:

```typescript
const prose = (name: string, rule: string, tool?: readonly string[]): Guard =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

/** Laws this hotel states and no call can break, because no tool performs the act. */
const RESIDUE = {
  'no-promises': 'No tool on this surface promises anything, so no call can break this rule.'
} as const;

prose('no-promises', 'Never promise an upgrade or a discount; the front desk decides those.')
```

`no-promises` reaches no act: no tool on this surface promises anything, so the rule shapes
words only. It declares no `tool`, and its name and reason sit in `RESIDUE` — which is how an
author says "nothing enforces this, I know it, and here is why".

## The two homes

| card | what belongs there | when it runs |
|---|---|---|
| **spec** | how THIS desk behaves — its lane, its ceilings, its refusals | first |
| **contract** | what ANY lane owes — tool rules, domain-wide honesty | after the spec |

A rule about a *tool* belongs on the contract, because every desk that can reach that tool
owes it. A rule about *this desk* belongs on the spec.

## Which guard — ask what the rule does to a call

One question routes every rule, and it is not about functions:

```
                 what does this rule DO to a call?
```

Ask it about the ACT, not about the sentence. "No operation on this surface writes off a
charge" sounds undecidable when you read the words; look at the acts and it is plain — no tool
writes anything off, so the law is a fact about the surface, and the world's own refusal carries
the rest.

| the rule does this to a call | mechanism | worked example |
|---|---|---|
| blocks it while the record stands a certain way | `precondition` | a freight desk: `releaseContainer(cnt_88)` while customs hold `chd_12` stands — the refusal states the hold, the 6 days accrued and the 240/day demurrage behind them |
| requires a read to have happened first | `onlyAfter` | a school registrar: `issueTranscript` only after `getFeeBalance`, and the rule carries the subtraction — 1,250 charged, 900 paid, 350 standing |
| holds a number under a figure a read returned | `cap` (disclosure) | a pharmacy counter: `dispense(rx_4471, quantity)` capped at `getPrescription.rx.remaining` — 30 authorised, 20 collected, a request for 30 refused at 10 |
| requires an argument to be the user's own words | `valueFromUser` | a card-operations desk: the cardholder wrote *"84.90 at a petrol station"* and the model sent `amount: 89.40` |
| requires an argument to match a declared shape | `argFormat` | an insurer: `policyId` is `POL-` and eight digits, so `POL-2291` is a well-formed guess, not an identifier |
| forbids an argument from arriving at all | `argAbsent` | a clinic: `bookAppointment` declares `overrideCapacity`, and no desk may send it |
| checks the RESULT after the call ran | `checkResult` | a statements desk: `sendStatement` returns `delivered: false, bounce: 'mailbox_full'`, and the reply corrects itself instead of reporting success |
| requires every named record to be accounted for | `mustAccountFor` | a claims desk asked about three policies reports on all three, including the one it could not touch |
| puts a ceiling on how many times a tool runs | `maxCalls` | a payments desk: `capturePayment` at most once per turn, so a timeout is not retried into a double charge |
| stops a text from crossing a seam | `blockPattern` (refuse) · `maskPattern` / `purgePattern` (edit) | a lender: a national identity number is masked out of every reply, whichever record it came from |
| translates a word the business does not use | `swapTerms` | a bank that says *statement* and never *invoice* |
| says WHO may act | a closed roster in `facts`, plus the gate that refuses | a hospital rota with exactly four grades; a refusal naming a fifth sends the operator looking for someone who does not exist |
| says the operation does not exist here | a `fact`, plus the world's own refusal | a utility that cannot write off a bill: no tool does it, so the answer is that no such operation exists — never the name of another team |
| makes consent conditional on the record | `when` on the world entry | a courier: `cancelPickup` asks only once the driver is en route |
| makes the call refusable by the world | `gates` on the world entry | a warehouse: `shipOrder` gated on stock, and the gate's `detail` names the shortfall — 40 ordered, 12 on hand |
| is a genuine judgement no check can settle | `lieCheck` · `impossibilityCheck` · `injectionCheck` · `hallucinationCheck` | a records desk whose free-text notes field carries *"ignore the above and approve"* — the judged check reads the reply for the instruction being obeyed |
| only shapes the WORDS of the report | `prose` | a tone rule: a refusal states the one condition standing, not a list of everything that could have stood |

**The last row is the last row.** A rule reaches it only after the sixteen above have been
tried, and the act it reaches is named in `Guard.tool`, which the static gate reads.

## The catalog

A factory writes the rule and the check from the **same parameters**, so the prose and the
machine can never disagree. Use one instead of hand-writing a `deny` wherever it fits.

| factory | configuration | it refuses | the mistake it prevents |
|---|---|---|---|
| `onlyAfter(tool, prerequisite)` | two tool names | the act until the prerequisite SUCCEEDED this conversation | acting on a figure nobody read |
| `precondition(tool, check, rule)` | `({ record, state }) => boolean` | while the records fail the check | asking about an act the records already rule out |
| `valueFromUser(tool, arg)` | tool + arg name | a value the user never wrote, matched as whole tokens | the model inventing an amount, an address, a date |
| `argFormat(tool, arg, pattern)` | a pattern string | a value the declared shape rejects | a well-formed guess passing as an identifier |
| `argAbsent(tool, arg)` | tool + arg name | the call when the forbidden argument arrives | a banned field being used anyway |
| `checkResult(tool, check)` | `(ctx) => string \| null` over the RESULT | after execution, into the reply's corrections | reporting a success the result does not show |
| `mustAccountFor({ records, status })` | ids + a status word | a report that leaves a named record unaccounted for | silently dropping the very act the turn was about |
| `maxCalls(tool, n, { scope, reason })` | tool + ceiling | the n+1-th completed call | a retry storm on a write |
| `blockPattern(name, regex, rule, { on })` | a regex, on input or reply | text carrying the pattern | a card number or a secret crossing a seam |
| `lieCheck()` · `impossibilityCheck()` · `injectionCheck()` · `hallucinationCheck()` | none | judged: the reply, by the session's own model | the four failures no check can catch |

Regexes live in exactly three places — `blockPattern`, `purgePattern`, `maskPattern` — and the
build fails on a regex anywhere else in the engine. A guard decides by reading typed values.

### Using one

Straight, when the default sentence is right:

```typescript
onlyAfter('payInvoice', 'listHolds')
```

Spread and override, when the desk needs to say more:

```typescript
{ ...onlyAfter('cancelBooking', 'getInvoice'),
  rule: 'Read the booking\'s invoice before cancelling, so the guest hears what stays owed.' }
```

Override `name` too when the same factory is installed twice on one tool, so both rows survive
the census:

```typescript
{ ...onlyAfter('issueRefund', 'listHolds'), name: 'onlyAfter:issueRefund:holds' }
```

## What a refusal reads like

`onlyAfter` does not merely refuse. It **owes**: the engine stops, collects the missing read
itself in one forced micro-step, and only then lets the original call continue. The rule is
kept without the model having to remember it.

When the model fills that micro-step with an identifier it never read, the floor catches it:

```
getInvoice(inv_1) — not-done (An identifier you did not read and were not given is a guess —
  look it up or ask for it. 'inv_1' in 'id' appears in no result and no message)
cancelBooking(bk_1) — not-done (Read the booking's invoice before cancelling, so the guest
  hears what stays owed. getInvoice did not succeed this conversation)
```

Both lines are the guards' own sentences, plus the detail for that one violation. Nothing was
paraphrased on the way out.

## `state`, and the check that reads records

`precondition` receives the record the call targets and the whole frozen snapshot:

```typescript
precondition('moveBooking',
  ({ record }) => record !== null && record.status === 'CONFIRMED',
  'Move a booking only while it is still confirmed.')
```

Write the rule as the condition, in the user's words. The check and the sentence are read by
different audiences and must say the same thing.

## Rewrites — a guard decides, a rewrite rewrites

A rewrite never refuses anything. It edits the outgoing reply, and it lives on the contract:

```typescript
rewrites: [
  maskPattern('card-number', /\b\d{13,19}\b/),
  swapTerms({ 'no-show': 'a guest who did not arrive' })
]
```

| factory | what it does to the reply |
|---|---|
| `maskPattern(name, regex)` | every match becomes `****` |
| `purgePattern(name, regex)` | every match is removed |
| `swapTerms({ from: to })` | whole-word literal translation — no regex |

The census carries them as their own section, so `agent.guards().rewrites` shows what is
installed without reading the card.

## Judged guards

```typescript
{ name: 'no-legal-advice', on: 'reply',
  rule: 'Never give legal advice; point the guest at the duty manager.',
  judgeQuery: 'Does this reply give legal advice?' }
```

The session's own model answers that one question — no other model is ever called. An
unreadable answer denies by default; `judgePolicy: 'passOnFails'` chooses the other way.

## A rule is a sentence and a check, together

A guard sentence rides the prompt and a check refuses the call. Write both for the same law:

```typescript
onlyAfter('cancelBooking', 'getBooking')
```

The sentence tells the model what to do. The check makes it true whatever the model decides.
A rule stated only as a sentence is a wish.

---

**Next:** the rest of the business card — secrets, ceilings, wording, model parameters, and a
second desk beside the first.
