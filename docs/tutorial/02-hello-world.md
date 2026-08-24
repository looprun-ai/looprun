# 2 · Hello world

Twelve lines of code, and a destructive act already cannot happen without you.

```typescript
import { LoopRunAgent, world } from 'looprun';

const hotel = world({
  records: { bookings: { bk_1: { room: 'Blue Room', day: 'Friday', status: 'CONFIRMED' } } },
  reads:       { getBooking:    { form: 'get',    entity: 'bookings', label: 'Look up one booking' } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } }
});

const agent = new LoopRunAgent({
  spec: { name: 'concierge', persona: 'A friendly hotel concierge who manages room bookings.' },
  world: hotel,
  model: 'google/gemini-2.5-flash'
});

console.log((await agent.generate('Please cancel booking bk_1.')).text);
```

What comes back is the desk's own message, with the approval statement and the engine's
one-time code woven in word for word:

```
Cancelling booking bk_1 needs your word first: cancel a booking runs only after
your approval. To go ahead, reply CONFIRM 355ec2.
```

The full file lives at [`snippets/hotel/world.ts`](snippets/hotel/world.ts) and
[`snippets/hotel/cards.ts`](snippets/hotel/cards.ts); every line of code in this tutorial is
compiled and run by [`snippets/test/hotel.test.ts`](snippets/test/hotel.test.ts).

---

## Step 1 — the agent

`LoopRunAgent` **is** a Mastra `Agent`. The same `generate` and `stream`, and
`new Mastra({ agents })` takes it unchanged. Two fields are required on the spec:

```typescript
export const concierge: AgentSpec = {
  name: 'concierge',
  persona: 'A friendly hotel concierge who manages room bookings.'
};
```

`persona` is who this desk is, and it is the first line of the prompt. `tools` is omitted, so
this desk gets the whole surface — the single-agent default.

Those two fields are all a desk needs to run. The file this quotes carries one more field on
`concierge` — a `guards` array, which [lesson 4](04-guards.md) is about.

## Step 2 — a `destructive` tool is the whole consent setup

`cancelBooking` sits under `destructive`. That one fact installs the entire protocol:

```
  the model calls cancelBooking(bk_1)
      │
      ├─ the engine HOLDS the call — nothing runs
      ├─ it words the question from the declared `label`
      ├─ it mints a one-time code and hands the desk the statement and the
      │  code to weave into its reply — word for word, or the engine prints
      │  the line itself
      └─ the act is sealed as not-done, reason `held`
```

Nothing about that is in your code. The tool's *name* never appears on screen either — the
person reads the label, "cancel a booking".

The approval has to arrive in a **later message**, and it releases **exactly that call**:

```typescript
const held = await agent.generate('Please cancel booking bk_1.', { session: 's1' });
const code = held.loopRun.questions.issued[0].code;

const done = await agent.generate(`approve ${code}`, { session: 's1' });
// done.loopRun.acts[0] → { origin: 'licence', status: 'done' }
```

`origin: 'licence'` says who ran it: the engine, against the approval you gave. A second act,
even the same tool with different arguments, needs its own question. A broadly worded "yes,
do whatever" licenses nothing.

## Step 3 — read what you installed

`agent.guards()` returns the census: the guards, the rewrites and the resolved limits. It is
the same array the engine walks — not a copy, not a description.

```typescript
await agent.generate('hello', { session: 's1' });   // construction settles on the first turn
const census = agent.guards();
census.guards.map(g => g.name);
```

On the hotel above, with the business card of lesson 3 attached:

```
onlyAfter:cancelBooking | precondition:cancelBooking | precondition:moveBooking |
groundedIds | groundedDates | confirmFirst:cancelBooking | maxDestructive | noDuplicateCall |
argRequired:getBooking:id | argRequired:getInvoice:id | argRequired:moveBooking:id |
argRequired:moveBooking:set | argRequired:cancelBooking:id | no-promises | claimIsGrounded |
claimIsComplete | brokenReply | questionAnswered
```

Three of those rows are yours. The other fifteen arrived because a tool is destructive, an
argument is declared, or the floor is the floor. Every row carries the one sentence that is
both what the model is told and what the person is told when it refuses.

## Step 4 — `label` is the user's words for the act

The label is not documentation. It is the sentence a person is asked to approve:

```typescript
destructive: {
  cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' }
}
```

```
cancel a booking runs only after your approval.
```

That sentence rides inside the desk's reply, word for word, next to the live code. A reply
that fails to carry both gets the engine's own line printed beneath it:
`[CONFIRM 355ec2] cancel a booking runs only after your approval.`

Write it as the act, in the words the business uses — "cancel a booking", "issue the refund",
"freeze the account". Never the tool name, never a class name, never a verb only a programmer
would use.

---

**Next:** the question above says *what the tool does*. Lesson 3 makes it say *what this exact
call would do* — with the room, the day and the amount read from the records.
