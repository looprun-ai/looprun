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
const prose = (name: string, rule: string): Guard => ({ name, rule, on: 'reply' });

prose('no-promises', 'Never promise an upgrade or a discount; the front desk decides those.')
```

## The two homes

| card | what belongs there | when it runs |
|---|---|---|
| **spec** | how THIS desk behaves — its lane, its ceilings, its refusals | first |
| **contract** | what ANY lane owes — tool rules, domain-wide honesty | after the spec |

A rule about a *tool* belongs on the contract, because every desk that can reach that tool
owes it. A rule about *this desk* belongs on the spec.

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

---

**Next:** the rest of the business card — secrets, ceilings, wording, model parameters, and a
second desk beside the first.
