# 5 · The rest of the domain card

Five fields remain, and each one closes a hole a real deployment finds.

## Step 9 — `secrets`: one home for what is secret

```typescript
secrets: ['card']
```

A field name, or a dotted path. It is masked at **every** seam: the results the model sees,
the arguments it sends, the acts stored in the record, and the delivered text. Declaring it on
the business card is deliberate — what counts as secret is a fact about the business, not a
property of one desk.

```typescript
secrets: [{ path: 'guest.passport', mode: 'omit' }]   // omit removes it instead of masking
```

## Step 10 — `limits`: bounded everything

```typescript
limits: { calls: 8, destructive: 1 }
```

| ceiling | default | what it bounds |
|---|---|---|
| `calls` | 10 | model tool calls in one turn |
| `destructive` | 1 | destructive acts in one turn — `done` and `unknown` both count |
| `retries` | 2 | reply corrections before the engine closes the turn itself |
| `questionTurns` | 3 | turns an approval question stays open before it expires |

A spec's limits merge **per field** over the contract's, so one heavy desk gets more calls than
its neighbour without restating the rest:

```typescript
// contract: { calls: 8, destructive: 1 }
// spec:     { calls: 6 }              → this desk runs with { calls: 6, destructive: 1, … }
```

When a turn hits the ceiling, the engine forces one finish step and closes the turn honestly —
it never simply stops.

## Step 11 — `wording`: the engine's sentences, in your words

```typescript
wording: { status: { held: 'waiting for your OK' } }
```

```
  default                cancelBooking(bk_1) — not-done (awaiting approval)
  with the override      cancelBooking(bk_1) — not-done (waiting for your OK)
```

Every status word and every engine sentence has a name and a default; you override the ones
your business says differently.

| you can rename | examples |
|---|---|
| status words | `done` · `not-done` · `unknown` · `held` · `refused` · `blocked` |
| engine sentences | `approvalInstruction` · `exhaustionClosure` · `unknownStatus` · `questionExpired` · `questionSuperseded` · `questionDeclined` · `deniedByGuard` · `simulatedResult` |

## Step 12 — `llmParams`: parameters that actually arrive

```typescript
llmParams: { temperature: 0 }
```

It lives on the **spec**, because it is how this desk behaves. Like limits, it merges per field
over the target's declared defaults, so naming one field overrides only that one.

## Step 13 — a second desk on the same contract

Two desks, one business. `tools` draws the lane; `teammates` says who owns the rest.

```typescript
export const frontDesk: AgentSpec = {
  name: 'front-desk',
  persona: 'The front desk: it looks bookings up and moves them, and it never cancels.',
  tools: ['listBookings', 'getBooking', 'moveBooking'],
  teammates: { billing: 'invoices, payments and refunds' },
  guards: [
    { ...valueFromUser('moveBooking', 'day'),
      rule: 'Send moveBooking\'s day only as the guest wrote it — never pick a day yourself.' }
  ],
  limits: { calls: 6 },
  llmParams: { temperature: 0 }
};
```

Two consequences follow from `tools` alone:

```
  the lane          cancelBooking is not in this desk's list, so it is not on its surface
                    and no prompt of this desk mentions it
  the hand-off      `teammates` tells the desk what billing handles, so it says
                    "billing issues the refund" instead of inventing a refund it cannot make
```

Both desks share the contract: the same voice, the same facts, the same tool guards, the same
disclosure sentences, the same secrets. Nothing is copied between them.

## The whole card, in one view

```
  AgentSpec (one desk)                DomainContract (the business)
  ─────────────────────               ─────────────────────────────
  name          required              name          required
  persona       required              voice         one sentence, never a persona
  tools         the lane              facts         truths every desk states
  teammates     hand-offs             guards        what ANY lane owes
  guards        this desk's rules     disclosure    per tool, three tenses
  llmParams     per-field merge       secrets       masked at every seam
  limits        per-field merge       rewrites      edit the reply, decide nothing
                                      wording       the engine's words, yours
                                      limits        the domain's ceilings
```

---

**Next:** running it, measuring it, and the twin that shows what the governance is worth.
