# 3 · Disclosure — what agreeing would do

The question in lesson 2 said what the tool does. This lesson makes it say what **this exact
call** would do, with the figures read from the records:

```
[CONFIRM 29bf44] Cancelling Blue Room on Friday is permanent, and 240 stays owed.
```

Nobody wrote code to produce that sentence. It is one line on the business card, with two
slots the engine filled by reading the records itself.

---

## The second card

Everything conversation-global lives on one `DomainContract`, and every desk in the domain
answers to it.

```typescript
export const hotelContract: DomainContract = {
  name: 'seaside-hotel',
  voice: 'Warm, brief, and exact about dates and money.',
  facts: [
    'Check-in is from 15:00 and check-out is by 11:00.',
    'A cancellation inside 24 hours of arrival keeps the first night.'
  ],
  // … guards, disclosure, secrets, rewrites, wording, limits
};
```

`voice` is the shared tone — one sentence, never a persona; the persona belongs to the desk.
`facts` are domain truths every desk states the same way. Attach the card at construction:

```typescript
const agent = new LoopRunAgent({ spec: concierge, contract: hotelContract, world: hotel,
                                 model: 'google/gemini-2.5-flash' });
```

## Step 5 — `before`: the sentence on the question

```typescript
disclosure: {
  cancelBooking: {
    needs: { booking: 'getBooking', invoice: 'getInvoice' },
    before: 'Cancelling {booking.room} on {booking.day} is permanent, and {invoice.amount} stays owed.'
  }
}
```

A slot is `{alias.path}` over a read the **engine performs itself**, using the held call's own
arguments. `needs` names those reads: the alias on the left, the read tool on the right.

```
  the model calls cancelBooking({ id: 'bk_1' })
      │
      ├─ the engine runs getBooking({ id: 'bk_1' })  → { room: 'Blue Room', day: 'Friday' }
      ├─ the engine runs getInvoice({ id: 'bk_1' })  → { amount: 240, paid: false }
      └─ the slots fill, and the question is asked with the real figures
```

**The read must be answerable by the held call's own argument.** In this hotel, invoices are
keyed by the booking id precisely so that `getInvoice({ id: 'bk_1' })` answers. When the read
takes a different argument name, say so:

```typescript
needs: { invoice: { tool: 'findInvoice', args: { bookingId: 'id' } } }
//                                              ^ the read's arg ← the held call's arg
```

Get this wrong and the engine does not guess. The read fails, and the call it was disclosing
is refused rather than asked about — the person is never asked to approve a sentence with a
hole in it.

## Step 6 — `after` and `later`

```typescript
after: 'Cancelled {booking.room} on {booking.day}.',
later: 'The {booking.room} booking is cancelled.'
```

| tense | when it is spoken | slots it may use |
|---|---|---|
| `before` | on the consent question, before anything runs | the `needs` reads, the call's args |
| `after` | the record line, once the act actually ran | the `needs` reads, the args, **and the result** |
| `later` | a standing sentence in following turns, while it still matters | the `needs` reads, the args |

`after` speaks the **result**, never the hope: write it from what came back, so a call that
half-succeeded cannot be reported as a clean success.

## Step 7 — refusing instead of asking: `cap` and `empty`

Two declarations turn a bad ask into an honest refusal.

```typescript
cap: { arg: 'amount', at: '{invoice.refundable}',
       refusal: 'Only {invoice.refundable} can still go back on this invoice.' }
```

`cap` refuses outright when the call's own argument exceeds what a read answered. Without it,
the engine would dutifully ask a person to approve a refund larger than the invoice — a
question nobody should ever be asked.

```typescript
empty: 'There is no booking under that number for this to cancel.'
```

`empty` is the sentence when a declared tense cannot fill because the records hold nothing for
this call. Again: a refusal, not a question with a blank in it.

## Why the sentence is trustworthy

Before it asks anything, the engine **rehearses**: it runs the held call against a throwaway
copy of the world. If the rehearsal refuses — a gate, a state the world will not allow — the
question is never born and the act is recorded as blocked, carrying the world's own refusal.

That is why a world refusal must be written as a sentence a person can act on, with the
figures in it. Lesson 6 comes back to this when the world card grows gates.

---

**Next:** disclosure says what an act would do. Guards say what may happen at all.
