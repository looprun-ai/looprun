# 02 · Hello world

**What you get from this chapter:** `npm i` to a governed agent answering a real turn, in about
twenty lines. Three symbols, all from `looprun/mastra`.

> **Code source.** Every block below is
> [`docs/tutorial/snippets/02-hello-world.ts`](snippets/02-hello-world.ts), which compiles in CI
> against the published `looprun` package. Excerpts are marked as such.

---

## 1. Install

```bash
npm i looprun @mastra/core ai zod
```

That is everything needed to *run* a governed agent. The certification toolchain
(`@looprun-ai/eval`) is a dev-only dependency you will not need until chapter 05, and nothing in the
runtime imports it.

looprun itself needs **no API key** — it is model-agnostic. The *model* needs one. This chapter uses
Google's cheap tier, so:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=...    # or put it in .env
```

Read that carefully: **the Google provider reads that variable, not looprun.** Nothing in this
library looks for a key, and swapping the model swaps which variable matters.

---

## 2. Twenty lines

```ts
/** Chapter 02 · hello world — a governed agent answering a real turn, in about twenty lines. */
import { LoopRunAgent } from 'looprun/mastra';
import { helloSchedulerSpec } from './scheduler/hello-spec.js';
import { listEventsTool } from './scheduler/tools.js';
import { SchedulerWorld } from './scheduler/world.js';

const agent = new LoopRunAgent({
  spec: helloSchedulerSpec, // the one-tool cut of the scheduler: listEvents, nothing else
  world: () => new SchedulerWorld(), // a factory: one world per session
  toolDefs: [listEventsTool],
  model: 'google/gemini-3.1-flash-lite', // Mastra router string; needs GOOGLE_GENERATIVE_AI_API_KEY
});

// LoopRunOptions: `loopRun.sessionId` keys the conversation — one world per session.
const result = await agent.generate('What is on my calendar this week?', {
  loopRun: { sessionId: 'demo' },
});
console.log(result.text);
```

```
$ npx tsx 02-hello-world.ts
You have two things this week: Standup on Monday at 10:00, and Dentist on Wednesday at 15:00.
```

<sub>Illustrative: the seed calendar holds exactly those two events, but a model reply is not
byte-stable — yours will differ in wording. Chapter 05 is where "it seemed fine" becomes a number.</sub>

That reply is governed. The agent read the calendar with the one tool it owns, and the wording is
constrained by rules that also exist as machine checks — nothing in it was free-form.

---

## 3. What each line is

### `LoopRunAgent` — the class you construct

`LoopRunAgent` extends Mastra's `Agent`. Not "wraps", not "mimics" — **extends**. It registers in a
`Mastra` instance, appears in Mastra Studio, and every Mastra option you already know
(`memory`, `description`, `processors`, …) passes straight through. What it adds is the governed
turn: the spec's prose becomes the system prompt, the guards fire at their hooks, and the reply is
checked before it leaves.

### `LoopRunAgentConfig` — the constructor argument

The four fields this chapter uses, and what each one is:

| field | what you pass | why it is separate |
|---|---|---|
| `spec` | the map: which tools, which rules, which voice | the governance; chapter 03 |
| `world` | state + the code that executes a tool call | your implementation; chapter 03 |
| `toolDefs` | the JSON-schema declarations the model sees | the *contract* of the surface, kept apart from its execution, so the same spec can run against a fake world in an eval and a real one in production |
| `model` | any Mastra router string, or an AI-SDK model object | looprun never picks a model for you |

```ts
  spec: helloSchedulerSpec, // the one-tool cut of the scheduler: listEvents, nothing else
```
<sub>excerpt · `snippets/02-hello-world.ts`</sub>

`helloSchedulerSpec` is a two-line subclass of `AgentSpecBase` — one tool (`listEvents`), one persona,
one behavior line. **Chapter 03 teaches it**; here it is furniture. One detail matters even now: it
declares `tools: ['listEvents']` and nothing else, so the agent has no way to write to the calendar.
The tool surface is the boundary, and it is declared, not inferred.

### `world` is a **factory**, not an instance

```ts
  world: () => new SchedulerWorld(), // a factory: one world per session
```
<sub>excerpt · `snippets/02-hello-world.ts`</sub>

The parentheses are load-bearing:

```
   world: new SchedulerWorld()      ⇒ SINGLETON — one world, forever, shared by everyone
   world: () => new SchedulerWorld() ⇒ FACTORY  — one world per sessionId
```

Pass an instance *and* a `sessionId` other than `'default'` and the session store **throws**, before
the model is ever called:

```
looprun: session "demo" requested but the agent was built with a single world INSTANCE —
pass a world FACTORY ((sessionId) => world) to support multiple conversations.
```

It throws rather than quietly sharing one calendar between two people, which is the failure that
would otherwise be discovered in production. Any host serving more than one conversation wants the
factory; the factory receives the `sessionId`, so it can load that user's state.

`SchedulerWorld` is a hand-written world — the certified path, and chapter 03's main subject.
`listEventsTool` is a `ToolDef`, also chapter 03.

### `model` — and why *this* id

```ts
  model: 'google/gemini-3.1-flash-lite', // Mastra router string; needs GOOGLE_GENERATIVE_AI_API_KEY
```
<sub>excerpt · `snippets/02-hello-world.ts`</sub>

A Mastra router string is `provider/model-id`. This particular id is the repo's **pinned cheap
ruler**: it is what the certification harness defaults to, so a hello world costs almost nothing and
behaves the same way as the benchmark numbers you will read later. Comparable results need a pinned
model — an unpinned "latest" alias makes today's score and last month's score two different
experiments.

`model` also accepts an **AI-SDK model object**, and that is the door to the rest of the tutorial:
chapter 05 passes a pinned, thinking-off model built for reproducible evals, and chapter 06 passes a
local llama.cpp model that needs no cloud key at all. Both are the same field.

---

## 4. `LoopRunOptions` — the per-call argument

```ts
// LoopRunOptions: `loopRun.sessionId` keys the conversation — one world per session.
const result = await agent.generate('What is on my calendar this week?', {
  loopRun: { sessionId: 'demo' },
});
```
<sub>excerpt · `snippets/02-hello-world.ts`</sub>

`generate()` is Mastra's, so its second argument is Mastra's options object — plus one namespaced
key that is looprun's:

| `loopRun.*` | what it does |
|---|---|
| `sessionId` | the conversation key. Picks (or creates) the world, the turn counter and the ledger of verified calls. Defaults to the memory thread id, else `'default'` |
| `attachments` | URLs to ingest into the world this turn |

The session is what makes multi-turn governance possible at all: a rule like "confirm in an *earlier*
turn" needs to know which turns are the same conversation.

> **Use `generate()`, not `stream()`, where the reply matters.** Streaming runs in a documented
> degraded mode: tool-level governance still binds (the preTool veto works), but reply checking,
> re-generation and honest abstention all need the finished reply.

### What comes back

`result` is the Mastra result you already know, with two changes:

```
   result.text      the GOVERNED reply — post-checks, post-correction
   result.looprun   the audit trail for this turn:
                    corrections[]  every veto, re-generation and forced terminal
                    violations[]   what was still wrong when the turn ended
                    exhausted      true ⇒ the deterministic closure went out
                    observed[]     the calls that actually ran, with their outcomes
```

`result.looprun` is how you answer "why did it do that?" without guessing. Nothing else in this
tutorial is a substitute for reading it once, on a real turn.

---

## 5. Borrowed, not taught

To keep this chapter honest about its own size, here is everything it *used* without explaining, and
where each one is explained:

| name | what it was doing here | taught in |
|---|---|---|
| `AgentSpecBase` | the class `helloSchedulerSpec` extends | [03](03-agent-anatomy.md) |
| `AgentWorld` | the interface `SchedulerWorld` implements | [03](03-agent-anatomy.md) |
| `ToolDef` | the type of `listEventsTool` | [03](03-agent-anatomy.md) |
| an AI-SDK model object | the alternative to the router string | [05](05-running-and-eval.md) (pinned cloud) · [06](06-advanced.md) (local) |

Three symbols, four borrowings. If your own hello world needs a fifth concept, that is a signal the
agent is too big for a first turn — not that the first turn should be longer.

→ **[03 · Agent anatomy](03-agent-anatomy.md)**
