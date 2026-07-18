---
title: looprun — the illustrated guide
status: living — the visual front-door: what looprun is, why it works, how to use it end to end
updated: 2026-07-17
audience: anyone building an agent who wants the whole picture in one sitting
---

# looprun — the illustrated guide

> **The question this guide answers:** *"I have tools and docs — how do I get a governed agent I can
> actually trust? And what does 'trust' even mean here, if language models can never be 100% right?"*

---

## §0 What looprun is, and what it generates

Your agent framework is **the car** — the engine that runs the *think → call tool → reply* loop.
looprun adds everything that makes it safe to hand the keys to an agent:

```
   ┌───────────────────────────── the car (your framework) ─────────────────────────────┐
   │                                                                                    │
   │        think ──► call tool ──► observe ──► think ──► … ──► reply                   │
   │                                                                                    │
   └────────────────────────────────────────────────────────────────────────────────────┘
              ▲                ▲                                  ▲
              │                │                                  │
        ┌─────┴─────┐    ┌─────┴──────┐                    ┌──────┴──────┐
        │  THE MAP  │    │ THE SAFETY │                    │   THE GPS   │
        │ AgentSpec │    │    KIT     │                    │  redrive +  │
        │ which     │    │  guards:   │                    │   honest    │
        │ tools, in │    │  check() + │                    │   abstain   │
        │ what      │    │  prose()   │                    │ course-     │
        │ order,    │    │  pairs     │                    │ corrects a  │
        │ under     │    │  (seatbelt,│                    │ bad reply;  │
        │ which     │    │  airbag,   │                    │ never lets  │
        │ state     │    │  speed     │                    │ it fabricate│
        │ conditions│    │  limiter)  │                    └─────────────┘
        └───────────┘    └────────────┘
                                          ┌──────────────────────────────┐
                     and one more thing:  │      THE MAP GENERATOR       │
                                          │  the `agentspec` skill — it  │
                                          │  interviews you (1 question) │
                                          │  and generates all the above │
                                          │  PLUS the eval that          │
                                          │  certifies it                │
                                          └──────────────────────────────┘
```

The governed agent stays a **genuine Mastra `Agent`** — it registers in your Mastra instance, shows
up in Mastra Studio, and the guards enforce live while you chat with it.

What lands in your project when the generator runs:

```
   your-project/
   ├─ src/agents/<domain>/          ◄── the maps                      [generated]
   │    ├─ <agent>-spec.ts              one AgentSpec per agent (≤15 tools each)
   │    ├─ theme.ts                     the domain theme: voice, invariants, state block
   │    └─ lexicon.ts, index.ts         the domain's regexes + wiring
   ├─ src/world/                    ◄── the test track                [generated]
   │    ├─ tools.ts                     TOOL_DEFS — the tool contract (JSON schema)
   │    ├─ world.ts                     deterministic in-memory world (no I/O, no clock)
   │    └─ presets.ts                   seeded starting states
   ├─ evals/                        ◄── the driving exam              [generated]
   │    ├─ cases.ts                     the eval set + case→agent map
   │    └─ judge-prompt.md              the domain grading rules
   └─ looprun.eval.config.ts        ◄── the contract wiring it all    [generated]
```

Three real example businesses generated exactly this way ship in the repo
([`examples/`](examples.md)) — home services, accounting, a law firm — each certified
**66/66 = 100%** (LLM judge, N=3, bar ≥90%, regenerated 2026-07-17).

---

## §1 Why 100% is impossible — and why that's good news

Here is the uncomfortable fact looprun is built on, stated honestly:

```
   what people hear:                      what is actually true:
   ┌──────────────────────────┐          ┌─────────────────────────────────────┐
   │  "agents can't be        │          │  "UNDER these conditions — any      │
   │   trusted. period."      │          │   model, any domain, and safety     │
   └──────────────────────────┘          │   rules that never read the user's  │
                                         │   text — an always-correct agent    │
                                         │   is impossible."                   │
                                         └──────────────────┬──────────────────┘
                                                            │
                                             an impossibility statement is a
                                             MAP with doors drawn in the
                                             margin — not a wall. negate any
                                             condition and you step OUTSIDE
                                             its territory, where a sibling
                                             statement can be true — and
                                             even measurable.
```

This is the classic move of every mature engineering field facing a no-go result (distributed
systems did it to the FLP consensus impossibility; social choice did it to Arrow): don't deny the
theorem — **walk out of its territory through a door**. looprun walks through three:

```
   door 1 — RESTRICT the domain      a deterministic tool world, a pinned
                                     subject model, a fixed eval set:
                                     inside that region behavior is
                                     reproducible enough to MEASURE and
                                     CERTIFY (N=3), not just hope about.

   door 2 — WEAKEN the goal          "always correct"  →  "correct OR
                                     honestly abstains". when a reply
                                     can't be made compliant, a closure
                                     built ONLY from verified observations
                                     goes out instead of a fabrication.

   door 3 — SPLIT the claim          not everything an agent does is
                                     equally uncheckable. split it:
```

Door 3 is the load-bearing one — the **two-layer law**:

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  ACTION LAYER — which tool, in what order, with which arguments     │
   │  finite · observable · machine-checkable                            │
   │  → gate it with deterministic guards: 100% enforceable, by          │
   │    construction, on every turn                                      │
   ├─────────────────────────────────────────────────────────────────────┤
   │  LANGUAGE LAYER — the wording of the reply                          │
   │  open-ended · judgment-dependent · no complete rulebook exists      │
   │  → NEVER gated. measured instead: a judged eval, certified N=3      │
   └─────────────────────────────────────────────────────────────────────┘
```

```
   ⚠️  The discipline that follows from this: guards never police style.
       Every attempt to "gate the wording" ends as brittle prose-chasing —
       a targeted phrasing fix that flips one case regresses its siblings
       (measured: net −2). The action layer is gated; the language layer
       is graded. That division is looprun's whole architecture.
```

So the honest claim on the tin is not *"this agent is always right"*. It is: **the actions are
deterministically bounded, the failures degrade to honest abstention, and the whole thing carries a
measured certificate** — a birth certificate, not vibes.

---

## §2 The big picture — developing an agent with looprun, end to end

```
   ═══════════════════════ THE ROAD TO A GOVERNED AGENT ═══════════════════════

    [you bring]                [the skill generates]           [the harness proves]

    tools.json or MCP          ┌──────────────────┐            ┌──────────────────┐
    surface (optional),  ────► │  agentspec skill │ ─────────► │   looprun-eval   │
    docs (optional),           │   A·G·E·N·T·S    │  specs     │ check → run →    │
    ONE purpose sentence       └──────────────────┘  theme     │ judge → certify  │
                                                     world     │ (FakeWorld — no  │
                                                     evals     │  I/O, no keys)   │
                                                               └────────┬─────────┘
                                                                        │
                                                          CERT.md — N=3, ≥90%, LLM judge
                                                                        │
                                                                        ▼
    ┌───────────────────────────────────────────────────────┐  ┌──────────────────┐
    │  [you own — deliberately NOT in the box]              │  │   LoopRunAgent   │
    │                                                       │◄─┤ (a real Mastra   │
    │  · RealWorld: implement tools.ts against your real    │  │  Agent, guards   │
    │    APIs/DB — same names, same schemas (§5.4)          │  │  live)           │
    │  · LoopRunAgent customization: model, redrives,       │  └──────────────────┘
    │    controls, local models (§5.5)                      │
    │  · Mastra Studio: chat + watch the guards veto (§5.6) │
    │  · observability, deployment, auth, UI — your stack   │
    └───────────────────────────────────────────────────────┘
```

Read the legend carefully — it is a promise about scope:

- **`[generated]`** — specs, theme, deterministic world, eval set, config. The skill writes them,
  the debate gate validates them, the measured loop certifies them.
- **`[you own]`** — everything that touches the real world. looprun certifies the *governance*
  against a deterministic replica; wiring the replica's tool contract to production systems, and
  everything around the agent (observability, deployment), is normal engineering that stays yours.

---

## §3 The doctrines

Every one of these is a measured decision, and most are CI-enforced in this repo. They are why the
architecture looks the way it does — and they are non-negotiable in generated artifacts.

### 3.1 The magnet law — never scope tools by intent

```
   the tempting design:                       what actually happens:
   router guesses the user's intent    ──►    every case is silently dragged
   and narrows the tool surface               toward the router's guess; when
                                              the guess is wrong, the RIGHT
                                              tool is no longer even callable

   the looprun design:
   decompose by TOOL-NEED into ≤15-tool agents … and the USER picks the agent
```

No intent classifier sits between the user and the tools. Which tools an agent owns is decided at
*design* time, by what jobs need which tools — never at *run* time, by a guess about the message.

### 3.2 One rule, two renderings — the `prose()` + `check()` pair

```
        one rule object, e.g.  requiresBefore(['listPlants'])
        ┌────────────────────────────────────────────────────┐
        │  ├─ prose() ──► rendered into the prompt:          │
        │  │              teaches the model the rule         │
        │  └─ check() ──► runs at the hook:                  │
        │                 vetoes the violation, every time   │
        └────────────────────────────────────────────────────┘

        one source  ⇒  the text the model reads and the gate that
                       binds it can never drift apart
```

The prose makes compliance *likely*; the check makes violation *impossible*. Neither reads the other.

### 3.3 The firewall — no guard ever reads user text

```
   GuardCtx = { args, tool, world, observed[], turnIndex,
                reply, producedThisTurn, result, notes }
                                             ▲
   the user's message ────── ✂ ─────────────┘   structurally absent
```

A guard sees tool arguments, world state, and the ledger of *verified* actions — never the user's
words. A clever prompt therefore cannot flip a guard: prompt injection has nothing to grab. (CI:
firewall lint.) Companion law, **guard purity**: no clock, no entropy, no network, no LLM call
inside a `check()` — deterministic by construction (CI: purity lint, plus a self-test proving the
lint fires).

### 3.4 One trunk, one theme, persona on the spec

One `TrunkTheme` per domain opens every agent's prompt **byte-identically** (voice + invariants +
a state block computed from the world); each agent's persona lives on its own spec and renders as
late as possible. Result: a maximal shared, cacheable prompt prefix — and volatile state rides the
user-message tail, never the system prompt. (CI: byte-stability test.)

### 3.5 Zero business strings in the library

The runtime carries no domain language of its own — every claim-regex, every label scheme, every
line of business prose lives in a **generated artifact owned by your project** (specs, theme,
lexicon). The library is a neutral machine. (CI: scan.)

### 3.6 Nothing generative ships self-reviewed — the debate gate

Every generated artifact (a tool surface, an eval case, a spec) is validated by **adversarial
debate, never self-review** — because measured, generators grade their own homework badly:
raw generations carry heavy noise, and *self*-refinement is **worse than no verification at all**
([BARRED](https://arxiv.org/abs/2604.25203)). The primitive is drawn in §4.3.

### 3.7 The eval is the arbiter — and the bar is a floor

A change ships when the measured pass-rate says so: **≥90%, LLM-judged, N=3 to certify.** Once at
the bar you may keep improving — but past the floor only *margin-validated* prose or deterministic
gates are accepted (§4.4), never blind wording tweaks. Blind prose is non-local: it trades sibling
cases invisibly.

---

## §4 The skill — install, and the AGENTS pipeline

### 4.1 Install

```bash
npm i looprun @mastra/core ai zod                     # the library
npm i -D @looprun-ai/eval mastra typescript tsx       # the eval harness + dev tooling
npx skills add looprun-ai/looprun --skill agentspec   # the generator skill (any skills-compatible coding agent)
npx looprun init                                      # environment check (+ optional local model)
```

Then, in your project, invoke the **agentspec** skill and answer one question — the agent's
purpose, one sentence (*"assistant for a small accounting firm"*). Everything else is the pipeline:

### 4.2 The pipeline — A · G · E · N · T · S

```
   A ── ASK         one mandatory question: the purpose (one sentence).
   │                + at most two send-or-skip asks: a tools file? docs/persona?
   ▼
   G ── GENERATE    whatever input is MISSING:
   │                G1 tools (tool genesis)  →  G2 world + presets  →  G3 the eval set
   │                └─ evals are authored from docs/answers/schemas — NEVER from
   │                   the drafted specs. independence is the point of an exam.
   ▼
   E ── ENGINEER    E1 decompose the surface into ≤15-tool agents by TOOL-NEED
   │                   └─ 🧑 human gate #1: ONE approval table
   │                E2 draft each AgentSpec   ∥   E3 generate the domain theme
   ▼
   N ── NITPICK     five independent adversarial reviewers + a verifier (≤2 rounds):
   │                N1 magnet red-team · N2 prose-condition auditor · N3 composition
   │                adversary · N4 coverage critic · N5 purity lint
   ▼
   T ── TEST        the measured loop: run the eval → LLM-judge → classify every
   │                fail → fix ONE class → re-screen (≤3 iterations)
   ▼
   S ── SHIP        certify N=3 at the ≥90% bar → CERT.md + provenance
                    └─ 🧑 human gate #2: accept (or not) the residual fails
```

Two humans-in-the-loop, exactly two: you approve the agent decomposition before anything is drafted
(E1), and you sign off on whatever residual imperfection remains at the end (S). Everything between
is generated, attacked, measured. The **LLM judge** is the frontier coding agent running the skill —
any vendor — and never the subject model's own family: the model being examined doesn't grade itself.

### 4.3 The mechanisms, one by one

**The FakeWorld** *(built in G2, driven in T)* — the deterministic test track:

```
   ┌──────────────── the FakeWorld ────────────────┐
   │  in-memory · preset-seeded · pure functions   │
   │  no clock  no randomness  no network  no I/O  │
   └──────────────────┬────────────────────────────┘
                      │
        same case + same world  ⇒  same tool results, byte for byte,
                                   on every replay, forever
```

Every eval case runs against it — so a fail is *reproducible*, a fix is *verifiable*, and the whole
certification needs **no API keys and no live systems**. It is also the state source the guards and
the theme's state block read during the eval.

**The debate primitive** *(gates G1, G3, and N)* — how generated artifacts earn validity:

```
             the artifact (a tool, an eval case, a spec edit)
                                │
                      ┌─────────┴─────────┐
                      │     ADVOCATE      │   rigid: defends the artifact,
                      └─────────┬─────────┘   never changes position
                ┌───────────────┴───────────────┐
                ▼                               ▼
          ┌───────────┐                   ┌───────────┐
          │  JUDGE 1  │    independent    │  JUDGE 2  │
          └─────┬─────┘    attackers,     └─────┬─────┘
                │          T = 2 rounds         │
                └────────── both agree? ────────┘
                                │
                   yes ⇒ VALID          no ⇒ refine (≤2×), then DROP
```

**The fork-pair margin loop + margin probe** *(inside T, for local/self-hosted targets)* — the
instrument that turns prose iteration from art into process. Some fails are **coins**: the graded
action decision rides one greedy token whose probability margin is smaller than ordinary noise
(any inert byte edit shifts it). Editing prose blindly on a coin just re-flips it. Instead:

```
   the failing step, frozen:                its mirrored-intent twin:
   context where tool A is correct          context where tool B is correct
   ┌──────────────────────────┐             ┌──────────────────────────┐
   │  … exact prompt bytes …  │             │  … exact prompt bytes …  │
   │  next token = the fork   │             │  next token = the fork   │
   └────────────┬─────────────┘             └────────────┬─────────────┘
                ▼                                        ▼
         margin(A over B)                         margin(B over A)
         read as top-k logprobs, directly on the engine, offline

   accept a prose edit  ⟺  the WORST-CASE margin improves on BOTH forks
                            across a noise battery (inert byte edits,
                            cache states) — target ≥3× the noise band
```

Measuring both forks is the anti-magnet applied to iteration itself: an edit that widens A's margin
by *stealing* from the twin case would show up immediately. The scripts (shipped with the skill):
`extract-fork.mjs` (freeze the fork from a passing + a failing run), `synth-fork.mjs` (build the
same fork context from a *synthesized* case — works before any run exists), `margin-probe.py`
(read the margins). And because the FakeWorld replays without an LLM, fork contexts render offline
in seconds.

### 4.4 The fail taxonomy (T classifies every fail; fix cheapest-first)

| # | class | the fix |
|---|---|---|
| 1 | state-visibility gap | render the missing state (theme `stateBlock` / a directive) |
| 2 | missing hard gate | add a guard from the catalog at the right hook |
| 3 | scope gap | add the tool to the agent, or remap the case (highest-yield single fix) |
| 4 | unconditioned prose | add the state condition to the behavior line |
| 5 | fabrication pattern | an existence-keyed anti-fabrication reply gate |
| 6 | language coin | ACCEPT as residual (language-layer territory — human gate #2) |
| 7 | eval defect | fix the EVAL (and re-debate it); never bend the spec to a broken case |
| 8 | near-tie action coin | the fork-pair margin loop (§4.3); pin with a gate if it resists — never blind prose |

One class per iteration, ≤3 iterations, then certify. The full protocol:
[the measured loop](guides/measured-loop.md).

---

## §5 After the skill — from generated bundle to production

### 5.1 You already have the packages

If the skill scaffolded your project, `looprun` + `@looprun-ai/eval` are installed. Otherwise: §4.1.

### 5.2 Make the spec an agent

```ts
// src/mastra/index.ts
import { Mastra } from '@mastra/core'
import { LoopRunAgent } from 'looprun/mastra'
import careSpec from '../agents/nursery/care-spec.js'
import { makeWorld } from '../world/world.js'
import { TOOL_DEFS } from '../world/tools.js'

export const careAgent = new LoopRunAgent({
  spec: careSpec,                               // generated — carries guards, persona, theme
  world: (sessionId) => makeWorld('default'),   // factory ⇒ multi-conversation
  toolDefs: TOOL_DEFS,
  model: 'openai/gpt-5.5',                      // any Mastra router string or AI-SDK model
})

export const mastra = new Mastra({ agents: { careAgent } })
```

```ts
const res = await careAgent.generate('Repot the fern in the entryway')
res.text       // the governed reply
res.looprun    // the audit trail: vetoes, redrives, violations, observed calls
```

### 5.3 Test in the fake, certify in the fake

```bash
npx looprun-eval check      # config + world seams — no LLM, catches wiring bugs
npx looprun-eval run        # N=1 screen: invariant gate → LLM judge → merge
npx looprun-eval certify    # N=3 at the ≥90% bar → eval-results/…-cert/CERT.md
```

The generated cases don't retire after certification — they are your **regression suite**. Any spec
or theme edit: re-screen, and `npx looprun-eval lint src evals --spec-laws` must stay clean.

### 5.4 RealWorld — implement `tools.ts` against your real systems

The certified bundle executes tools through the deterministic world. Production swaps the
*execution*, never the *contract*:

```
        contract (fixed)                 execution (swapped)
   ┌──────────────────────┐         ┌───────────────────────────┐
   │  TOOL_DEFS           │  eval:  │  world.ts  (in-memory)    │
   │  same names,         │ ──────► │                           │
   │  same JSON schemas   │  prod:  │  your implementation —    │
   │                      │ ──────► │  real APIs, DB, queues    │
   └──────────────────────┘         └───────────────────────────┘

   the guards bind to the CONTRACT ⇒ they enforce identically in both
```

Implement each tool's real execution behind the same names and schemas (an `AgentWorld` that calls
your APIs, or Path B below). What was certified is the governance around the contract — and that
travels unchanged.

### 5.5 Customize the `LoopRunAgent`

The knobs, all optional:

| knob | what it does |
|---|---|
| `model` / `modelParams` | swap models freely; pin sampling for reproducibility |
| `maxSteps`, `redrives` | loop budget · how many no-tools reply corrections before honest-abstain |
| `terminalProtocol` | the reply-only terminal discipline (default on) |
| `stopOnRepeatedToolCall` | belt-and-braces stop for small local models |
| `strict` | throw on spec warnings instead of logging |
| `world` vs `tools` + `stateView` | deterministic world (Path A) vs native/MCP tools (Path B) |

Local models are first-class — validated tiers on llama.cpp, keyed by RAM class:

```ts
import { localModel } from 'looprun/models'

model: await localModel('ram24')   // the default tier — 11.8 GB, ~56 tok/s, certified eval
// also: 'ram8' · 'ram16' · 'ram32'   (weights download consent-first: npx looprun models pull …)
```

### 5.6 Mastra Studio — watch the guards work

```bash
npx mastra dev     # → Studio at localhost:4111
```

Chat with the agent and probe it: ask for the destructive action without confirming, ask it to
skip a required step. You'll see the veto land as a tool-result correction, the model recover
*inside the same generation*, and `.looprun` record every intervention — governance as something
you can watch, not just read about.

```
   ⚠️  `stream()` runs in degraded mode: tool-level governance only
       (preTool vetoes still bind), but reply checks / redrive / honest-
       abstain need the full reply — use `generate()` where the reply
       governance matters.
```

### 5.7 MCP and other frameworks

Native Mastra tools — including MCP servers — plug straight in (**Path B**): pass
`tools: await mcp.getTools()` plus an optional `stateView` for state-reading guards. The guards
enforce identically; the veto needs zero extra wiring. See [MCP & native tools](guides/mcp-tools.md).

Beyond Mastra: `@looprun-ai/core` is framework-free (the spec, the guards, the whole governed-turn
machine have zero runtime dependencies), and `looprun/vercel` is the **reserved seam** for a Vercel
AI SDK backend — reserved meaning *not implemented yet*. Today, Mastra is the one live backend.

---

## §6 Contributing to the repo

The library that enforces rules is itself ruled. Every guard's behavior is pinned by a **proof** —
and a change to a governed surface ships with a passing proof record, or it does not ship.

```
   1. author the proof FIRST       a GuardProof with all three polarities:
   │                               positive (must allow) · negative (must
   │                               catch) · neutral (look-alike: leave alone)
   ▼
   2. implement until green        packages/core/src/guards.ts
   ▼
   3. update the two mirrors       packages/core/GUARDS.md ↔
   │                               skills/agentspec/references/guard-catalog.md
   │                               (a parity test fails if they diverge)
   ▼
   4. pnpm proofs:run              the deterministic suite: L1 pure-check +
   │                               L3 full-loop (scripted fake LLM + fixture
   │                               world) + collective non-interference;
   │                               the coverage ratchet must not drop
   ▼
   5. pnpm proofs:record --        writes governance/proofs/<date>-<slug>.md
   │     --slug … --change …       and regenerates governance/MATRIX.md
   ▼
   6. open the PR                  CI re-runs everything and DEMANDS a PASS
                                   record for governed surfaces; CODEOWNERS
                                   review; `no-proof-needed` label = the
                                   maintainer-only escape hatch
```

The parts worth knowing before your first PR:

- **Proofs, not just tests.** A test says "this passed on my machine". A proof is a standing,
  deterministic statement: *here is the compliant flow guard X must allow, the violation it must
  catch, and the look-alike it must ignore* — green in isolation **and** running beside every other
  guard (collective non-interference: a new guard may not neutralize or trigger its neighbors).
- **The ratchet has no counter to forge.** Coverage is computed *from the proofs themselves* —
  exporting a new guard kind without a complete proof turns the suite red. The floor never drops.
- **The SLM canary** (`pnpm proofs:canary`) replays the same scenarios against a *real* small local
  model — advisory only, never a gate; it skips cleanly on machines without the weights.
- Full mechanics: [`CONTRIBUTING.md`](../CONTRIBUTING.md) ·
  [`governance/GOVERNANCE.md`](../governance/GOVERNANCE.md) · the `looprun-governance` skill
  automates scaffold → run → record.

---

## §7 Where to go next

| you want | read |
|---|---|
| the concepts + the nine design laws, compact | [`docs/overview.md`](overview.md) |
| install → generate → certify, step by step | [`docs/getting-started.md`](getting-started.md) |
| the generator skill in detail | [`docs/guides/skill.md`](guides/skill.md) |
| the certification protocol + fail taxonomy | [`docs/guides/measured-loop.md`](guides/measured-loop.md) |
| every guard kind, exact signatures | [`packages/core/GUARDS.md`](../packages/core/GUARDS.md) |
| eval config reference | [`docs/guides/eval-config.md`](guides/eval-config.md) |
| local model tiers + flags | [`docs/guides/local-models.md`](guides/local-models.md) |
| MCP / native tools / stateView | [`docs/guides/mcp-tools.md`](guides/mcp-tools.md) |
| three certified example businesses | [`docs/examples.md`](examples.md) |
| the contribution + proof process | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

---

## Closing — the punchline

> The impossibility of an always-correct agent is not a wall; it is the floor plan of a territory,
> with the doors drawn in the margin. looprun is what you get by walking through three of them:
> restrict the domain until behavior is measurable, weaken "always right" into "right or honestly
> silent", and split the claim so the action layer is *gated* while the language layer is *graded*.
> The theorem stays true inside its territory. Your agent ships with a certificate from outside it.
