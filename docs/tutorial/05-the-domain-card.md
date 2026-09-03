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
  the act's record row, default                cancelBooking(bk_1) — not-done (awaiting approval)
  the same row, with the override              cancelBooking(bk_1) — not-done (waiting for your OK)
```

Every status word and every engine sentence has a name and a default; you override the ones
your business says differently. The sentence is what the record seals and what the model
re-reads — the operator meets it whenever the engine's own line has to speak.

| you can rename | examples |
|---|---|
| status words | `done` · `not-done` · `unknown` · `held` · `refused` · `blocked` |
| engine sentences | `approvalInstruction` · `exhaustionClosure` · `unknownStatus` · `questionExpired` · `questionSuperseded` · `questionDeclined` · `deniedByGuard` |

## Step 12 — `llmParams`: parameters that actually arrive

```typescript
llmParams: { temperature: 0 }
```

It lives on the **spec**, because it is how this desk behaves. Like limits, it merges per field
over the target's declared defaults, so naming one field overrides only that one.

## Step 13 — a second desk on the same contract

Two desks, one business. `tools` draws the lane; `description` says, in verbs, what this desk does — and the house hands every desk its colleagues' descriptions, so nobody describes another.

```typescript
export const frontDesk: AgentSpec = {
  name: 'front-desk',
  persona: 'The front desk: it looks bookings up and moves them, and it never cancels.',
  tools: ['listBookings', 'getBooking', 'moveBooking'],
  description: 'looking bookings up and moving them to new days',
  summary: 'the front desk',
  guards: [
    { ...valueFromUser('moveBooking', 'set.day'),
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
  the hand-off      the house hands this desk billing's own description line, so it
                    says "billing issues the refund" from what billing says about
                    itself — one sentence, one home, nothing to drift
```

Both desks share the contract: the same voice, the same facts, the same tool guards, the same
disclosure sentences, the same secrets. Nothing is copied between them.

## Step 14 — the desk for whoever arrives

A guest who says hello asks for neither desk, and so does a guest asking something this
business does not hold. That message reaches a desk anyway. Mark one of your own with
`default: true` — at most one desk of a house carries it — and every message the front desk
matched to nobody is delivered there:

```typescript
export const reception: AgentSpec = {
  name: 'reception',
  persona: 'Reception: it welcomes the guest and says which desk holds what.',
  tools: [],
  description: 'welcoming a guest and pointing them at the desk that holds their question',
  summary: 'the reception that welcomes you',
  default: true
};
```

Mark none, and the house seats its own front of house: it performs nothing, reads nothing,
greets whoever arrives, states what the house covers in the desks' own summaries, and declines
what the house does not hold — in the language the guest wrote in. It stands outside the desk
list, so the front desk still chooses between exactly the desks you declared.

```
  the delivery      unreturnable, and carried as asking for no change: a message no desk
                    performs asks this house to change nothing, and there is nowhere left
                    to hand it back to
  the record        routing names the desk that spoke and says the router never chose it,
                    which the chat door reads back as `none → reception`
```

## The whole card, in one view

```
  AgentSpec (one desk)                DomainContract (the business)
  ─────────────────────               ─────────────────────────────
  name          required              name          required
  persona       required              voice         one sentence, never a persona
  tools         the lane              facts         truths every desk states
  description   what it does, in verbs guards        what ANY lane owes
  summary       the house's own words
  default       serves what matched
                nobody, one per house
  guards        this desk's rules     disclosure    per tool, three tenses
  llmParams     per-field merge       secrets       masked at every seam
  limits        per-field merge       rewrites      edit the reply, decide nothing
                                      wording       the engine's words, yours
                                      limits        the domain's ceilings
```

---

**Next:** running it, measuring it, and the twin that shows what the governance is worth.
