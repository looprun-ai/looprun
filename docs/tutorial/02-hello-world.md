# 02 · Hello world

**What you get from this chapter:** a governed agent answering a real turn, in an agent file of
about twenty lines. Three symbols, all from `looprun/mastra`.

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

Optionally, confirm the environment — `npx looprun init` prints whether
`GOOGLE_GENERATIVE_AI_API_KEY` is set and reports the local-model status (`llama-server` binary, GGUF
file, server health) for two aliases. It changes nothing unless you pass `--local <alias>`, which
offers to download that model's weights:

```bash
npx looprun init      # read-only environment check; nothing here needs a local model
```

---

## 2. Get the scheduler modules

The agent file below is about twenty lines, but it is not self-contained: it imports the spec, the
tool declaration and the world from `./scheduler/`. Those are the tutorial's shared modules, and you
need them on disk before anything runs. Copy them out of this repo:

```bash
git clone https://github.com/looprun-ai/looprun.git
cp -r looprun/docs/tutorial/snippets/scheduler ./scheduler
cp looprun/docs/tutorial/snippets/02-hello-world.ts ./hello.ts
```

Five files land in `./scheduler/`. This chapter uses three of them:

| file | used here | what it is |
|---|---|---|
| `hello-spec.ts` | ✅ | this chapter's one-tool spec |
| `tools.ts` | ✅ | the `ToolDef` declarations |
| `world.ts` | ✅ | the calendar state and tool execution |
| `contract.ts` | indirectly | the shared scope and voice `hello-spec.ts` imports |
| `spec.ts` | — | chapter 03's full three-tool spec; unused here, and it comes along with the copy |

Chapter 03 writes `spec.ts`, `world.ts`, `tools.ts` and `contract.ts` from scratch — this chapter
borrows them so the first turn is about the *agent*, not about a calendar.

Two things about running TypeScript directly, so the first attempt works:

```bash
npm pkg set type=module     # the file uses top-level await
npx tsx hello.ts            # npx fetches tsx on demand; `npm i -D tsx` to pin it
```

---

## 3. The agent, in twenty lines

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
$ npx tsx hello.ts
You have two things this week: Standup on Monday at 10:00, and Dentist on Wednesday at 15:00.
```

<sub>Illustrative: the seed calendar holds exactly those two events, but a model reply is not
byte-stable — yours will differ in wording. Chapter 05 is where "it seemed fine" becomes a number.</sub>

That reply is **governed at the action layer**: the agent could call exactly one tool, and it could
not have written to the calendar if it tried. The *wording* is not gated — chapter 01 §2 is explicit
that the language layer never is. It is measured instead, which is chapter 05.

---

## 4. What each line is

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

`helloSchedulerSpec` is a one-tool subclass of `AgentSpecBase` — `tools: ['listEvents']`, one persona,
one behavior line, and no guards written by hand. **Chapter 03 teaches it**; here it is furniture. One detail matters even now: it
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
ruler**: a hello world costs almost nothing, and it is the same model family the certification
harness defaults to. Not the identical configuration — the harness pins the *thinking-off* variant
(chapter 05), and thinking on or off changes behavior — so read this as "the same family as the
published numbers", not "the setup they were measured on". What matters either way is that the id is
**pinned**: an unpinned "latest" alias makes today's score and last month's score two different
experiments.

`model` also accepts an **AI-SDK model object**, and that is the door to the rest of the tutorial:
chapter 05 passes a pinned, thinking-off model built for reproducible evals, and chapter 06 passes a
local llama.cpp model that needs no cloud key at all. Both are the same field.

---

## 5. `LoopRunOptions` — the per-call argument

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
| `sessionId` | the conversation key. Picks (or creates) the world, the turn counter and the action history of verified calls. Defaults to the memory thread id, else `'default'` |
| `attachments` | URLs to ingest into the world this turn |

The session is what makes multi-turn governance possible at all: a rule like "the user must have typed
back the confirmation they were shown" needs to know which turns are the same conversation.

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

## 6. Borrowed, not taught

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
