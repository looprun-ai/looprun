# looprun

**A governance layer for AI agents, on top of the framework you already use.**

You write three cards. The engine holds every destructive act for a human's word, says what
agreeing would do in the domain's own words, and seals what happened into a record nobody can
edit — including the model.

```bash
npm install looprun
```

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

```
Nothing changed.
cancelBooking(bk_1) — not-done (awaiting approval)
[CONFIRM 355ec2] cancel a booking runs only after your approval.
```

Twelve lines of code, and nothing about consent is in them. `cancelBooking` sits under
`destructive`; that single fact installs the hold, the wording, the one-time code, and the
rule that only a later message carrying that code releases **that one call**.

---

## The whole authoring surface

```
  the WORLD CARD     what exists, and what a tool DOES to it
                     records · reads · writes · destructive

  the AGENT SPEC     how ONE desk behaves
                     name · persona · tools · teammates · guards · llmParams · limits

  the DOMAIN         what the BUSINESS is — every desk answers to it
  CONTRACT           voice · facts · guards · disclosure · secrets · rewrites ·
                     wording · limits
```

There is no fourth thing. No hooks, no loop, no return protocol, no tool plumbing.

## What the engine does that you did not write

| | |
|---|---|
| **Consent** | every destructive call is held; the approval arrives in a later message, carries a code the engine minted, and licenses exactly that call |
| **Disclosure** | the consent question states what THIS call would do, with figures the engine read itself: *"Cancelling Blue Room on Friday is permanent, and 240 stays owed."* |
| **The floor** | fabricated identifiers and dates, duplicate calls, half-filled arguments, a reply that claims what the acts do not show — all refused without you declaring anything |
| **The record** | one row per act, in a closed vocabulary — `done` · `held` · `refused` · `unknown` · `not-done` — chosen by the engine from what the world answered, never from the model's prose |
| **Honest closure** | a turn that ran out of room closes with what verifiably happened, never with a fabrication |

## A guard is one sentence

The sentence is what the model is told, what the person is told when a call is refused, and
what `agent.guards()` prints. One string, three jobs — they cannot drift apart.

```typescript
{ ...onlyAfter('cancelBooking', 'getInvoice'),
  rule: 'Read the booking\'s invoice before cancelling, so the guest hears what stays owed.' }
```

When the model skips the read, the engine collects it itself in one forced micro-step, and
what comes back is that same sentence:

```
cancelBooking(bk_1) — not-done (Read the booking's invoice before cancelling, so the guest
  hears what stays owed. getInvoice did not succeed this conversation)
```

## Or declare it, and emit

The three cards can be written as data instead of TypeScript: one `declaration.yaml` — the
contract and its desks — beside the world card it is declared against. The emitter writes the
TypeScript and invents zero prose; every sentence in the cards is the declaration's own.

```bash
npx looprun-emit <subject-dir>    # writes cards.ts, subject.ts, the gate file, gen/SEAM.md
```

A declaration that does not fit its world writes nothing: every refusal the emitter can know is
printed at once, each naming the exact YAML path to fix. The declaration is always what changes,
never the emitter. The shape, and every refusal with its message: `packages/emit/README.md`.

## Framework-agnostic by construction

`@looprun-ai/core` is the engine and knows about no framework. `@looprun-ai/mastra` binds it to
Mastra, where `LoopRunAgent` **is** a genuine `@mastra/core` Agent: it registers in your Mastra
instance and shows up in Studio with the guards enforcing live. Anything else can call a
governed agent over HTTP — `@looprun-ai/server` puts it behind an OpenAI-compatible
`/v1/chat/completions` endpoint.

| package | what it is |
|---|---|
| `looprun` | the umbrella: the cards, the world, and the Mastra-hosted agent under one name |
| `@looprun-ai/core` | the engine — framework-free |
| `@looprun-ai/mastra` | `LoopRunAgent` and its ungoverned twin |
| `@looprun-ai/server` | governed agents behind an OpenAI-compatible endpoint |
| `@looprun-ai/emit` | the declaration reader and the emitter — the cards, written from data |
| `@looprun-ai/eval` | verbs over a run directory: run, watch, judge, fold, certify, seal |
| `@looprun-ai/models` | the validated local tiers on llama.cpp |

## Measuring it

`@looprun-ai/eval` runs an exam of authored cases against your model and certifies the result
against a bar. `UngovernedAgent` is the same cards, the same world, the same prompt with every
guard hook empty — the only honest way to say what the governance is worth. On a hundred-case
exam of a rental-operations domain:

```
                       governed        ungoverned
  judged score          95/100           54/100
  invariant failures      1                29
  consent questions      47                 0
  writes executed        46                79
  writes stopped        104                26
```

**The judge is the person and the agent doing the work.** No file in this repository calls a
third-party model API — not to judge a run, not to score a transcript. `buildJudgeInputs`
writes blind rows to disk and a human-and-agent pair writes the verdicts back. The only model
a run reaches is the subject under test.

## Learn it

```
 docs/tutorial/01-concepts.md            the three things you write
 docs/tutorial/02-hello-world.md         consent, for free
 docs/tutorial/03-disclosure.md          what agreeing would do
 docs/tutorial/04-guards.md              the catalog and the three strengths
 docs/tutorial/05-the-domain-card.md     secrets, limits, wording, a second desk
 docs/tutorial/06-running-and-measuring.md   the exam, the verbs, the twin
```

Every code block in that tutorial is a compiled file under `docs/tutorial/snippets/`, run by
the test suite — a lesson that drifts from the engine fails the build.

## What proves it

`governance/GOVERNANCE.md` — 12 engine proofs, 4 structural lints, 7 facade gates, the eval
verb proofs and 3 repository gates, all of them running under `pnpm test`.

---

Apache-2.0 · [looprun.ai](https://looprun.ai) · Node ≥ 22
