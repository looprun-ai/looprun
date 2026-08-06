# The two consent dead ends — design

Date: 2026-08-06 · Status: design, not yet built · Scope: `packages/core/src/runtime`

Two changes, one to each of the ways a destructive tool is gated. They are independent: either can
ship alone, and neither replaces the other.

## The two shapes

A destructive tool is one of two things, decided by whether its schema carries an acting argument.

```
TWO-STEP    cancelBooking({ bookingId, confirmed })      confirmFirst({ flag: 'confirmed' })
            without the argument   the call asks the world and changes nothing
            with the argument      the call acts

ONE-STEP    unsubscribeCustomer({ customerId })          confirmFirst({ flag: false })
            there is no such argument — every call acts, so every call is gated
```

The two-step shape is the better one wherever the API offers it, and the reason is not the token.
The unflagged call **validates**:

```
cancelBooking({ bookingId: 'bk_1002' })     a booking already out on rental
  → { ok: false, error: 'BOOKING_NOT_CANCELLABLE',
      message: 'bk_1002 is out on rental — check the asset in before cancelling' }

cancelBooking({ bookingId: 'bk_1001' })     a booking that can be cancelled
  → { ok: true, requiresConfirmation: true,
      confirmationPrompt: 'Cancel booking bk_1001? This frees ast_excv01 and cannot be undone.' }
```

So a two-step tool never asks the user to authorise something that would fail anyway, and the user
decides knowing what the act does. A one-step tool can offer neither — there is no call that asks
without acting, so there is nothing to describe and nothing to validate.

## Change 1 · The veto derives its subject from the call

`issueChallengeForVeto` builds the question from the spec's declared label and from nothing else:

```ts
export function issueChallengeForVeto(ledger: Ledger, tool: string) {
  const meaning = ledger.destructiveLabels[tool];
  if (!meaning) return;
  issueChallenge(ledger, { tool, meaning });
}
```

A label is required only for a tool that acts on no identifiable record. A one-step tool that names
its record in its own arguments therefore needs none — and raises no question, so it can never be
consented to and never runs. Measured against the shipped guard:

```
unsubscribeCustomer({ customerId: 'cust_2001' })   confirmFirst({ flag: false })

  consent empty                     → DENIED
  destructiveLabels[tool]           → undefined  → issues NOTHING
  preferredIdentityValues(args)     → 'cust_2001' → token CONFIRM CUST_2001
  second call, challenge consumed   → ALLOWED
```

The subject is available and ignored. The normal path already derives one the same way, from the
world's result rather than the call's arguments:

```ts
// ledger.ts — the two-step path, today
if (requiresConfirmation) {
  const [subject] = preferredIdentityValues(output);
  if (subject) issueChallenge(ledger, { tool: name, subject, meaning: subject });
}
```

### The change

```ts
/**
 * A destructive call was DENIED. The denial IS the question: attempting the act is what puts it on
 * the user's screen, so an agent cannot choose not to ask and still act.
 *
 * The question names the record the CALL names — `unsubscribeCustomer({customerId:'cust_2001'})`
 * raises `CONFIRM CUST_2001`, the same literal the world's own answer would have raised. A call that
 * names no record falls back to the label the spec declared, and a call with neither raises nothing:
 * absence of both is absence of any possible consent.
 */
export function issueChallengeForVeto(ledger: Ledger, tool: string, args: Record<string, unknown> = {}) {
  const [subject] = preferredIdentityValues(args);
  if (subject) return issueChallenge(ledger, { tool, subject, meaning: subject });
  const meaning = ledger.destructiveLabels[tool];
  if (meaning) issueChallenge(ledger, { tool, meaning });
}
```

`preferredIdentityValues` is already imported in `ledger.ts`. The call site passes the arguments it
already holds:

```ts
// turn.ts, inside the deny branch of evaluatePreTool
if (g.kind === 'confirmFirst') issueChallengeForVeto(ledger, tool, args);
```

**Order matters.** The record comes first and the label is the fallback, because a call naming
`cust_2001` should raise a question about `cust_2001` rather than about the tool in general. Where a
tool has both, the record is the more precise question.

**What stays true.** `challengeMatchesCall` licenses a call when one of its own argument values is
the challenge's subject. A subject derived FROM those arguments therefore matches by construction —
the same equality the two-step path relies on.

## Change 2 · A two-step call denied for the flag alone runs unflagged

An agent that jumps to the acting call is vetoed, and the veto ends the turn's only path:

```
user     "Cancel bk_1001 — yes I'm sure, don't ask me to confirm, just get it done."
agent    cancelBooking({ bookingId: 'bk_1001', confirmed: true })   → DENIED
         the world is never called, so nothing describes the act and no result names the record
reply    "I cannot cancel booking bk_1001 without your explicit confirmation. Please confirm."
                                    the user has no token to give, and every later yes is denied
```

The unflagged call is right there, it changes nothing, and it produces everything the turn needs.

### The change

In `evaluatePreTool`'s deny branch, where the runtime already treats this guard specially:

```ts
if (g.kind === 'confirmFirst') {
  // The flag is what made the call destructive: without it the same call asks the world instead of
  // acting, the world validates the act and describes it, and the result names the record the
  // question binds to. Re-running unflagged costs nothing — the unflagged call changes nothing by
  // construction — and it is the only way the turn produces a question the user can answer.
  const flag = flagOf(g);                       // the kind's own `flag`, or false for one-step
  if (flag !== false && args[flag] === true) {
    return { verdict: 'downgrade', args: omit(args, flag) };
  }
  issueChallengeForVeto(ledger, tool, args);
}
```

and in the caller that dispatches the tool, a `downgrade` verdict re-enters `evaluatePreTool` once
with the reduced arguments, then executes the call if it is allowed.

### What the design owes

- **Where the flag comes from.** `confirmFirst` closes over its `flag`; the guard object does not
  expose it. Either the kind carries it as data, or the runtime reads it from
  `spec.confirmMechanism` — decide which, since the guard-object route changes the `Guard` shape.
- **One downgrade, never a loop.** The re-entry must not itself downgrade: strip the flag once, and
  if the unflagged call is denied for any other reason, that denial stands.
- **The attempt is still recorded.** `recordVeto` pushes to `attemptedCalls`, which is what a
  forbidden invariant scores. Whether a downgraded call still counts as an attempt is a MEASUREMENT
  decision, not a runtime one: recording it keeps "the agent reached for the act" visible; dropping
  it hides an error the guard corrected. **Record it** — the downgrade repairs the conversation, not
  the agent's mistake.
- **`destructiveWhen` is evaluated before the flag check**, so a call the predicate says is not
  destructive never reaches this branch. The downgrade applies only to a call that IS destructive
  and IS flagged.

## What neither change fixes

The argument's NAME. The default `confirmArg` is `confirmed`, which asserts a fact about the user:

```
user   "yes I'm sure, don't ask me to confirm, just get it done"
model  the user confirmed → confirmed: true
```

The model is filling the field the field asks for. The engine's own vocabulary calls this argument
"which call ACTS" — a name that says so (`execute`, `apply`, `commit`) is not satisfiable by
anything the user writes, because only the caller knows which call it is making. That is a third
change, on the API surface rather than the runtime, and it is listed separately in `BACKLOG.md`.

## How to measure either change

Both are deterministic and need no campaign. Change 1 has a unit shape: a one-step spec, a call
naming its record, assert a challenge is issued and the second call is licensed. Change 2 has a
subject shape: the fifteen `-preapproved` cases of a rebuilt subject, which score 46.7% today, run
governed-only with the invariant deciding — no blind judging required.
