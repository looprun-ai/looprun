# Consent by Challenge — Design

Consent to a destructive act is a token the ENGINE issues and the USER types back. The agent
neither writes the question, nor names what it authorizes, nor reports the answer.

---

## 1 · The three defects this closes

A destructive act is licensed today by an `ask` intention the agent declares about itself. Three
independent failures live in that one signal.

```
turn 1   respond({ message: "Your booking BK-1 is confirmed. Have a great trip!",
                   did: [{ op:'ask' }] })

         the user sees:      Your booking BK-1 is confirmed. Have a great trip!
         the user replies:   "no, I do not want to cancel anything"

turn 2   deleteAccount({ id:'ACC-9' })      → LICENSED
```

| # | Defect | Shown above |
|---|---|---|
| 1 | the delivered message need not pose a question | `"Have a great trip!"` is declared as an ask |
| 2 | the question is bound to nothing | a question about `BK-1` licenses an act on `ACC-9` |
| 3 | nobody reads the user's answer | `"no"` licenses exactly as `"yes"` would |

The only deterministic floors under that signal are: the turn was sealed, its message is not blank,
and it falls inside the recency window. Any non-blank sentence carries a license.

---

## 2 · The mechanism

```
┌─ ISSUE ──────────────────────────────────────────────────────────────┐
│ (c) the world returns requiresConfirmation → challenge over the      │
│     record the probe touched                                         │
│ (b) a guard denies a tool with no probe    → the denial IS the       │
│     challenge                                                        │
└──────────────────────────────────────────────────────────────────────┘
        ↓ the engine renders, in the locale the host declares
┌─ SCREEN ─────────────────────────────────────────────────────────────┐
│ agent:   Your booking BK-1 carries an 80.00 fee.                     │
│ engine:  To confirm, reply: CONFIRM BK-1                             │
│ engine:  No operation was carried out on this turn.                  │
└──────────────────────────────────────────────────────────────────────┘
        ↓ the user's next message
┌─ CONSUME ────────────────────────────────────────────────────────────┐
│ contiguous token window, whole-value equality per token              │
│   "yes, CONFIRM BK-1"  ✅          "go ahead"      ❌                 │
│   "cancel BK-12"       ❌          "CONFIRMED BK-1" ❌                │
└──────────────────────────────────────────────────────────────────────┘
        ↓
┌─ LIFE ───────────────────────────────────────────────────────────────┐
│ open until: consumed (single use) · superseded on the same record ·  │
│             the record changed                                       │
│ no turn window                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

The agent's only role is to attempt the act. Everything the user reads about consent, and everything
the engine accepts as consent, passes through channels the agent cannot write.

---

## 3 · Issue

Two triggers, covering the two shapes a destructive tool takes.

| Path | Trigger | Record |
|---|---|---|
| `(c)` | a call whose result carries `requiresConfirmation` | the probe's own args |
| `(b)` | a guard denial on a tool that has no preview form | none — see §4 |

There is no path in which the agent asks for a challenge. Attempting the act is what produces the
question; an agent that never attempts never asks, and never acts.

---

## 4 · Meaning and token

A challenge carries two things: what the user is agreeing to, and the literal that expresses the
agreement.

```
challenge = (meaning, token)

with a record      meaning comes from the WORLD    token: CONFIRM BK-1
without a record   meaning comes from the SPEC     token: CONFIRM DELETE-ALL
```

A destructive tool that acts on no identifiable record declares a `label` — one field, human-facing,
authored by the domain in the spec:

```
label: "delete all of your data"

renders   To confirm that you want to delete all of your data,
          reply: CONFIRM DELETE-ALL
```

The token is DERIVED from the label: upper-cased, first two words, hyphen-joined. Two labels whose
derived tokens collide is a construction error — the agent fails to build, not to run.

**The label is mandatory.** A destructive tool with no record and no label cannot be gated, so it
does not run. Absence of a label is absence of any possible consent.

**The token never names a tool.** The user-facing text carries the domain's label and the world's
record identity; the runtime name of the tool appears nowhere in it.

### Why the engine may not invent the meaning

An engine-generated ordinal (`CONFIRM 1`) expresses nothing, so the meaning must come from the
agent's prose — and the agent is then free to misframe it:

```
engine:  To confirm, reply: CONFIRM 1
agent:   "Reply CONFIRM 1 to leave everything as it is."
user:    "CONFIRM 1"        → everything is deleted
```

The same failure appears whenever the agent authors the sentence around an engine token. The
meaning is fixed before the conversation starts, by the world or by the spec, or the act is denied.

---

## 5 · Rendering and language

The challenge is engine-authored text the user must type back, so it renders in the locale the host
declares. The operation record renders in the same locale, from the same declaration.

```
locale en    To confirm, reply: CONFIRM BK-1
             No operation was carried out on this turn.

locale pt    Para confirmar, responda: CONFIRMAR BK-1
             Nenhuma operação foi realizada neste turno.
```

A challenge whose token the user cannot produce is a permanently blocked act: an English token in a
conversation held in another language is never typed, and the destructive act can never be consented
to. The locale is what makes the mechanism reachable.

---

## 6 · Consume — the matching law

One law governs three places: claim-to-ledger grounding, challenge consumption, and elicited values.

```
split the user's message on WHITESPACE      (never on punctuation)
strip EDGE punctuation from each token
the value matches when its token sequence appears CONTIGUOUS in the message
each token compared by WHOLE VALUE, case-folded
```

```
"my email is marcos@x.com."   → tokens: my | email | is | marcos@x.com
     records marcos@x.com  ✅      records guess@y.com  ❌
"cancel the BK-12"            → BK-1  ❌      BK-12  ✅
"yes, CONFIRM BK-1"           → CONFIRM BK-1  ✅  (contiguous)
"the engine locked up"        → "the engine locked up"  ✅  (four contiguous tokens)
```

Splitting on whitespace rather than punctuation is what keeps `marcos@x.com` whole. Whole-token
equality is what separates `BK-1` from `BK-12`.

Substring matching is the failure this law exists to prevent:

```
user:      "cancel the BK-12"
pending:   CONFIRM BK-1
substring: "BK-1" occurs inside "BK-12"   → CONSENT ACCEPTED
           the user authorized BK-12; the engine released BK-1
```

**Consent fails closed.** `"go ahead"` is a human yes and is denied. A challenge that is not consumed
is re-emitted.

---

## 7 · Life of a challenge

```
open        from issue
consumed    single use — a second act on the same record needs a new challenge
superseded  a new challenge on the same record invalidates the previous one
invalidated the record changed
```

There is no turn window. What bounds a stale token is that consuming it requires the user to type
that exact literal, and that consuming it closes it.

---

## 8 · What `confirmFirst` becomes

```
one rule:  is there an open challenge on this record, consumed by the user's own words?
```

The `via` / `within` / `flag` options and the probe-equality machinery are removed. A probe still
issues the challenge — it no longer licenses anything by itself.

---

## 9 · Elicitation

`askedEarlier` gates a value the agent records on the user's behalf. The gate is the matching law of
§6 applied to that value.

```
user:   "my email is marcos@x.com"
        saveLead({ email:'marcos@x.com' })   ✅
        saveLead({ email:'guess@y.com' })    ❌

user:   "the engine locked up"
        saveCase({ diagnosis:'engine seized' })      ❌
        saveCase({ diagnosis:'the engine locked up' }) ✅
```

The world receives the user's own words, not the agent's normalization. Paraphrase is denied.

---

## 10 · The `ask` intention

`ask` remains a speech classification in `did`. It licenses nothing.

Because it is self-declared, what it may drive is bounded by the direction of the incentive:

```
the `ask` MAY feed anything that PENALIZES over-declaring
the `ask` NEVER feeds anything that RELIEVES over-declaring
```

| May read `ask` | Effect of a false `ask` |
|---|---|
| the session is not treated as resolved | none |
| follow-up reminder when the user goes quiet | a spurious reminder |
| escalation to a human after repeated questions | earlier escalation |
| a throttle on questions asked before acting | the agent is blocked sooner |
| routing the user's next message back to the asker | the agent loses the routing |
| an open microphone on a voice channel | an open microphone with nothing to capture |
| turns-spent-asking as a measurement | the agent's own number gets worse |

| May NOT read `ask` | Effect of a false `ask` |
|---|---|
| the operation record | the record softens and stops contradicting the prose |
| the lie check | the liar switches the check off by declaring a question |
| any honesty guard | same |
| any license | the defect this design closes |

---

## 11 · Surfaces this design deletes

```
pendingConfirmMustAsk    the engine renders the question; there is no relay to force
noActAfterAskSameTurn    the token arrives only in a USER turn — impossible by construction
askedInDeliveredTurn     the whole cross-turn ask signal
via / within / flag      on confirmFirst
```

---

## 12 · World and spec obligations

| Obligation | Owner |
|---|---|
| a destructive tool with a preview form returns `requiresConfirmation` and names its record | world |
| a destructive tool with no record declares a `label` | spec |
| the host declares the conversation's locale | host |
| a write result names what it touched under an identity key | world (unchanged) |

---

## 13 · Acceptance

| Property | Deterministic |
|---|---|
| the user saw a question about this exact act | **YES** — the engine wrote it |
| the question names what it authorizes | **YES** — from the world's record or the spec's label |
| the user agreed | **YES** — their own words carry the engine's token |
| the agent cannot forge, reframe, or skip any of the three | **YES** |

No model participates in a consent decision.
