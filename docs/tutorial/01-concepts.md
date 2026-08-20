# 1 · The three things you write

An agent here is three files, and none of them contains a loop, a hook, a return protocol
or a piece of engine vocabulary.

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  the WORLD CARD    what exists, and what a tool DOES to it               │
  │                    records · reads · writes · destructive                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  the AGENT SPEC    how ONE desk behaves                                  │
  │                    name · persona · tools · teammates · guards · limits  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  the DOMAIN        what the BUSINESS is — shared by every desk           │
  │  CONTRACT          voice · facts · guards · disclosure · secrets ·       │
  │                    rewrites · wording · limits                           │
  └──────────────────────────────────────────────────────────────────────────┘
```

The engine reads those three and does the rest. You never write the consent flow, the
approval code, the refusal sentence, or the record of what happened.

## The one rule that explains the shape

**The block a tool sits in IS its effect declaration.** A tool under `reads` looks; a tool
under `writes` changes; a tool under `destructive` changes for good — and because it sits
there, the engine holds it for a human's word before it runs. There is no `requiresConsent:
true` anywhere, because there is nothing to switch on.

```typescript
reads:       { getBooking:    { form: 'get',    entity: 'bookings', label: 'Look up one booking' } },
writes:      { moveBooking:   { form: 'set',    entity: 'bookings', label: 'Move a booking' } },
destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } }
```

`form` says what the action does to a record — `list`, `get`, `make`, `set`, `remove`, or
`run` for a handler you write yourself. `entity` names the record family. `label` is the
words a person sees; the tool's name never reaches the screen.

## What one turn looks like

A turn is one user message in and one reply out, whatever happened in between.

```
  user message
      │
      ▼
  ┌── the engine ───────────────────────────────────────────────────────────┐
  │  guards on the way in                                                   │
  │  the model asks for a call ──► guards ──► the world runs it             │
  │                                   │                                     │
  │                                   ├─ refuse    the call never runs      │
  │                                   ├─ owe       a read is collected first│
  │                                   └─ hold      it waits for your word   │
  │  guards on the reply                                                    │
  │  every act sealed into a record nobody can edit                         │
  └─────────────────────────────────────────────────────────────────────────┘
      │
      ▼
  the reply — plus one line per act, in words a person reads
```

## The words a reply uses

Every act the turn attempted comes back as one row with one of five words. They are the
whole vocabulary, and the engine — not the model — chooses which one a row carries.

| word | what it means |
|---|---|
| `done` | it happened, and the world's own answer says so |
| `held` | it is waiting for your approval; nothing changed |
| `refused` | a rule or the world said no, and the row says which |
| `unknown` | it was sent and nothing confirmed the outcome — never treated as success |
| `not-done` | it did not happen |

A turn where nothing happened says so out loud:

```
Nothing changed.
cancelBooking(bk_1) — not-done (awaiting approval)
[CONFIRM 355ec2] cancel a booking runs only after your approval.
```

## What installs itself

You do not declare these, and you cannot remove them. They are the floor every domain
stands on:

| the floor | what it refuses |
|---|---|
| consent on every destructive tool | the act, until an approval arrives in a later message carrying the code |
| `groundedIds` · `groundedDates` | an identifier or a date the model never read and was never given |
| `noDuplicateCall` | running the same call twice in a turn — the first result is restated instead |
| `argRequired` per declared argument | a half-filled call |
| `claimIsGrounded` · `claimIsComplete` | a reply that claims what the acts do not show, or hides an act that happened |
| `questionAnswered` · `brokenReply` | a reply that answers nothing, or that is not a reply at all |

## Where to go next

```
 2 · hello world          one agent, one world, and consent arriving for free
 3 · disclosure           saying what agreeing would do, in the domain's own words
 4 · guards               the catalog, the three strengths, and where each one lives
 5 · the domain card      secrets, limits, wording, model parameters, a second desk
 6 · running & measuring  the exam, the verbs, and the twin that shows the difference
```
