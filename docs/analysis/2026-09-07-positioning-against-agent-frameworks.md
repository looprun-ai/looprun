# looprun against the agent frameworks — which problem it solves, and which it does not

An impartial reading of where looprun pays and where LangGraph, the OpenAI Agents SDK, Mastra or a
plain pipeline pay instead. Not a technical review: the unit of comparison is the TYPE of problem,
and for each type the two mirrored questions are answered — why looprun over the alternative, and
why the alternative over looprun.

Every claim below is grounded in one of three places: this repository's own measurements (the
2026-08-31 governed-vs-traditional verdict, the atlas-c22 release-readiness run of 2026-09-03), the current
documentation of the alternatives (read on 2026-09-04), or a runnable check made for this reading
and listed in §5.3.

---

## 1 · What each one answers

```
                    the question the tool answers                    the shape of the answer
  ────────────────  ─────────────────────────────────────────────    ────────────────────────────────
  LangGraph         in what order do the steps run, with what          you draw the graph; every node
                    state, where does it pause, where does it resume   is your code
  OpenAI Agents SDK how do I assemble agents, handoffs and input/      agent + tools + guardrails you
                    output checks with little code                     write
  Mastra            the same as LangGraph, in TypeScript, with         chained steps, agents, memory,
                    agents, memory, RAG and a cron scheduler in one    schedules, Studio
  looprun           how does a conversation with irreversible acts     three declared cards; the
                    stay safe, honest and auditable by itself          engine does the rest
  hand-written loop the same as looprun, written for ONE agent         ~700 generic + ~1,250 lines
  (the traditional  (measured in the 2026-08-31 verdict)               per agent
  build)
```

looprun and LangGraph do not compete on the same problem. LangGraph organises steps. looprun governs
a desk that talks to a person and acts on that person's word. They meet on one shape only: the
conversational agent that cancels, refunds, transfers, grants.

What looprun delivers from one declared line, and what the same line costs elsewhere:

```typescript
destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } }
```

```
OPERATOR  The customer backed out, cancel bk_1001.
AGENT     Cancelling bk_1001 ends the 2026-07-10 to 2026-07-15 rental of the CAT 320 and
          returns ast_excv01 to the yard; it does not come back. To go ahead, reply 042169.
OPERATOR  042169
AGENT     Booking bk_1001 is cancelled.          (sealed: cancelBooking(bk_1001) — done)
```

Four things happened that no alternative does on its own: the wait for the word, the statement of
what the act would do with figures read from records, the one-time code that licenses that one
call, and the check that the delivered reply does not contradict the record.

The nearest equivalents pause execution and stop there:

```python
# LangGraph: pauses the graph; who approves, how, and what is said is YOUR code
response = interrupt({"action": "send_email", "to": to, "message": "Approve?"})

# OpenAI Agents SDK: marks the tool; the approval UI and the explanation are YOURS
@tool(needs_approval=True)
async def cancel_order(order_id: int): ...
```

Neither tells the person what the act would do, ties the approval to a code, checks the final
reply against what ran, or seals a record the model cannot edit.

---

## 2 · By type of problem — the two mirrored questions

### 2.1 A flow with a known topology (document pipeline, staged triage, RAG, batch work)

| why LangGraph, not looprun | why looprun, not LangGraph |
|---|---|
| The problem IS a graph. Each node carries its own check, the path is predictable, tokens are few because a node sees only what it needs. Durable pause and resume come for free. | It does not apply. looprun has no notion of stage, branch or flow resumption. It fits only if one node holds a conversation with a destructive act. |

### 2.2 A conversational desk with real-effect tools (cancel, refund, change plan, release a deposit)

| why looprun, not the alternative | why the alternative, not looprun |
|---|---|
| Consent, effect statement, record and reply honesty come from the declaration, not from your code. The ungoverned twin drops from 95 to 54 on the same exam, same model. A small, cheap model (Flash-Lite, a local Qwen) becomes serviceable. | The approver is not the person in the conversation (a manager on another channel): the pause-and-resume model fits better. You already run LangGraph or the SDK and a plain `needs_approval` covers the approval. You need to change the loop itself, not only the rules. |

### 2.3 Proving the agent behaves (audit, certification before release)

| why looprun | why another |
|---|---|
| The proof is part of the product: an exam of authored cases, the ungoverned twin, a seal of what ran, no transcript sent to a third-party model. | The frameworks treat evaluation as an external service. And the verdict of 2026-08-31 shows looprun's self-judged scores sat 2–14 points above the strict reading: the instrument exists, the discipline of using it is still young. |

### 2.4 Several departments behind one door (one WhatsApp number for HR, IT and finance)

| why looprun | why another |
|---|---|
| A house of desks with a front desk that picks the desk on intent and writes the choice into the record; a house with no matching desk greets and states what it covers. | LangGraph does the same routing as graph nodes with full control; the SDK has handoffs. Routing on complex rules (hours, authority, SLA) is easier to see and test as a graph. |

---

## 3 · The eight criteria

Measured numbers where this repository has them; documentation reading elsewhere.

| criterion | looprun | LangGraph | OpenAI Agents SDK | hand-written loop (measured) |
|---|---|---|---|---|
| DX | three cards or one YAML; steep vocabulary (desk, floor, owe, seal) | explicit graph, much glue code | the lightest of the four | you write everything |
| implementation time | atlas-c22 blind: 2.5 h from brief to final, with the skill | days for a desk with decent consent | hours for the basics, days for consent with an effect statement | 10 rounds, $4 on atlas |
| confidence | governed 92–94 vs traditional 86–90 on the strict read; the world layer never let a gated act run without a code in 400 executions | what you test | what you test | 0 leaks too; 116 rewrites per run |
| reading the generated code | cards are readable; the invisible behaviour ("what the engine does that you did not write") is hard to reason about; c22's world.ts came out at 2,069 lines with two contradictions | everything explicit, each node reads alone | explicit and short | explicit, 1,250 lines per agent |
| changing the agent | the declaration only. Measured cost: of 11 traditional rounds, 3 edits worth 33 of 38 points have no channel in looprun (the loop is closed) | you change anything, and nothing stops you breaking consent | same | same |
| performance | 2 to 4 model calls per turn (forced read micro-step, close step, rewrites) | 1 call per model node | 1 to 2 per turn | 1 + rewrites |
| cost | c22: ~14.5k input tokens per turn, no cache; atlas-c20 4.1k per step vs 10.9k traditional; 2.3× cheaper uncached, but the provider cache does not engage at 4k | minimal; a node sees only its context | low | 10.9k per step, 73% cached |
| security | never interprets the user's text (only exact literals such as the code); refuses invented ids, duplicate calls, figures no record carries. An instruction planted inside a record is still engaged in prose (cases 62 and 78, on both sides) | nothing built in | guardrails with a tripwire, written by you | looprun's own design, without lints |

```
  GAINS                                          COSTS
  ───────────────────────────────────────────    ───────────────────────────────────────────
  consent + effect statement + record +          closed loop: the edit class that paid most
  honesty without writing the loop                in the traditional build has no channel
  a small model becomes usable (54 → 95)          2 to 4 calls per turn; ~14.5k tokens/turn
  built-in measurement, no third-party judge      the reply layer is the unstable component
  the operator's language by construction,        a vocabulary nobody arrives knowing
  no word lists
  framework-agnostic core, Mastra binding,        orchestrates nothing; no durable flow
  OpenAI-compatible endpoint                       resumption of its own
```

---

## 4 · Inside a company

The question changes: who builds, who changes the rule afterwards, how it plugs into what exists,
what leaves the company, who answers when it goes wrong.

```
  concern                        looprun                        LangGraph                    OpenAI Agents SDK
  ─────────────────────────────  ─────────────────────────────  ───────────────────────────  ──────────────────────
  who writes the rule            YAML in business prose; the    Python/JS code; developers   code; developers only
                                 emitter refuses with the       only
                                 exact path to fix
  who changes it later           whoever edits the YAML; the    a developer changes anything, a developer changes
                                 loop is closed                 including breaking the rule  anything
  plugging into the house's      an MCP server (url + headers   anything, you code it        tools in code, native MCP
  systems                        from the environment); tools
                                 in code
  how the rest calls it          an OpenAI-compatible endpoint  LangGraph Platform or your   your server
                                 (/v1/chat/completions)         server
  data leaving the company       only the subject model; no     what you configure           the vendor's model by
                                 third-party judge; local                                     default
                                 models on llama.cpp supported
  proof for audit                a sealed record per act +      traces and checkpoints;      traces
                                 an exam with an ungoverned     nothing per business act
                                 twin
  maturity and support           0.20.0, pre-1.0, Apache-2.0,   mature, large community,     mature, vendor-maintained
                                 Node ≥ 22, one project         commercial support
  team language                  TypeScript/Node               Python first, JS too         Python and JS
```

The line that weighs most is "who writes the rule". This is a real fragment of atlas-c22's
declaration; a business reader can read it and propose a change without opening code:

```yaml
facts:
  - This workspace carries exactly five member roles: owner, admin, dispatcher, billing
    and viewer. When a refusal points at who can act, it names one of those five roles
    and a member a read returned, never another title, and never an outside department.
limits:
  calls: 16
```

Typical internal agents and where each lands:

| agent | best fit |
|---|---|
| back-office automation (invoices, reconciliation, monthly reports, staged ticket triage) | LangGraph or a Mastra workflow; no operator, nothing to hold |
| internal desk with real acts (HR travel cancellation, IT access grants, finance reversals) | looprun; the approval, effect statement, one-time code and record per act come from the declaration |
| knowledge assistant (policies, manuals) | any SDK; looprun only if the same desk also executes acts |
| several departments behind one door | looprun's house of desks, or LangGraph nodes when routing rules are complex |

Risks a company accepts with looprun today:

| risk | size | evidence |
|---|---|---|
| pre-1.0, one maintainer, no community | high for critical production | version 0.20.0; breaking without compatibility is the house rule |
| the loop is closed: a rule the declaration cannot express waits for the engine | medium | 3 of 11 traditional rounds had no channel in looprun and were worth 33 of 38 points |
| the reply layer is unstable | medium | five refactors in one month, each moving 5–10 points |
| Portuguese validated only by self-read | medium for Brazil | the pt-BR exam closed at 96; the strict three-judge read was made in English only |
| its own vocabulary | low but real | nobody hired from the market arrives knowing it |
| a record-borne injected instruction is still engaged in prose | low (the act is stopped) | cases 62 and 78, on both sides |

---

## 5 · The report-by-cron case, in three steps

### 5.1 An information service that generates reports, fired by cron

A weak fit on its own. What looprun sells (waiting for a person's word, the effect statement, one
voice in a conversation) stands idle, and its constraints bite a report. Each read in the engine:

| what the engine does | what it becomes in a cron report |
|---|---|
| only `destructive` is held for the person's word; `reads` and `writes` run at once | a destructive "publish report" deadlocks: the release comes in a LATER message carrying the code, and nobody is there to type it; it must sit under `writes`, ungoverned |
| every figure in the reply must exist in a read (`figureIsGrounded`: "the message states 200 and no record this turn carries it") | reads return Jan 120 and Feb 80; the model writes "total 200"; refused; the total must come from a tool |
| a per-turn call ceiling (`limits.calls`, default 10, any positive integer) | a report needing 30 queries does not fit one turn |
| the output is prose, checked word by word; no structured output, no document | the PDF or spreadsheet is built by a tool of yours (`form: 'run'`); looprun delivers only the text announcing it |

The cost is not the objection (14.5k tokens and 2–4 calls per daily run is cents); the fit is.

```
  cron ──► SQL/API query ──► aggregation in code ──► the model writes the narrative ──► check ──► PDF/e-mail
           (node 1)          (node 2, deterministic)  (node 3, 1 call)                  (node 4)
```

A pipeline has no person, no consent, figures born in code, a document as output, one model call
per report, and cron as the natural trigger.

### 5.2 With tools that query, consolidate and generate

Closer. The figure and output constraints vanish: figures come from tools and the report is a
record a tool creates. What looprun then adds, deterministically:

| the model's failure | what the engine does |
|---|---|
| skips consolidation and calls `buildReport` directly | runs `consolidate` itself in a forced micro-step, then releases |
| calls `buildReport` twice | the second is refused as a duplicate |
| the tool fails and the reply says "report generated" | the sentence contradicts the record; not delivered |
| invents `rep_2026w36` in the reply | an id no read returned; refused |

What stays out via cron: no tool may be `destructive` (the hold waits for a later message); a turn
where the model answers in words and calls nothing closes honestly with `no_tool_called` and
nobody re-asks; 2–4 calls per run.

The deciding question is what the model decides. Fixed request, fixed order, no person: a pipeline
expresses `query → consolidate → build` as three edges with no model call. A varying request
("compare with last week", "only product line X") is where a model chooses calls and arguments, and
where the floor pays.

### 5.3 Inside a Mastra workflow — measured

`LoopRunAgent` is a genuine `@mastra/core` Agent, so it can sit inside a Mastra workflow. Three
variants were run against `@mastra/core` 1.50.1 with a scripted model (no external call):

```
  variant                                             result
  ─────────────────────────────────────────────────── ───────────────────────────────────────────
  A  createStep(agent)                                FAILS: "looprun: the engine owns the model seat"
     Mastra drives the agent itself                    the automatic step asks the base Agent for
                                                       its model, and looprun locks that seat
  B  an own step calling agent.generate(prompt)        PASSES: { text: "bk_9 is confirmed for Tuesday.",
                                                                 acts: ["getBooking:done"] }
  C  a held destructive call → Mastra suspend/resume   PASSES: turn 1 leaves the run "suspended" with the
                                                       code in the payload; resume({ code }) executes the
                                                       held call; acts: ["cancelBooking:done"]
```

Variant C is what changes the cron story: the workflow freezes at the irreversible act with the
question and the engine-minted code, and someone resumes it with the code hours later.

```
run.start({ prompt: 'cancel bk_9' })
  → status: suspended
    payload: { question: 'Cancel the booking runs only after your approval.', code: '355724' }

run.resume({ step: 'cancel', resumeData: { code: '355724' } })
  → status: success   text: 'Cancelled bk_9 as approved.'   acts: ['cancelBooking:done']   modelCalls: 1
```

Variant A is repairable with two method overrides on `LoopRunAgent` (the workflow step asks
`getModel().specificationVersion` and then `stream(prompt, { onFinish })` expecting `fullStream`
chunks and a settled `text`); a subclass carrying exactly those two overrides ran the automatic step
to `status: success`. The adjustment is on the backlog. Even repaired, the automatic step returns
`{ text }` only and cannot suspend, so the own step (B/C) stays the door for any held act.

Measured limits of the pattern: resume needs a Mastra `storage` (without it, "No snapshot found");
the resumed turn found the open question because the process was the same — a resume in another
process needs the looprun session persisted too, which was not tested.

### 5.4 The exploratory report (a goal, no known tool sequence, all tools present)

The engine runs the exploration inside one turn up to `limits.calls`. What it guarantees:

| guarantee | example |
|---|---|
| an id in an argument must come from a read or from the message (`groundedIds`) | `getSalesByRegion(region: 'reg_south')` with no read having returned it: refused, "appears in no result and no message" |
| a required order (`needs`) | `buildPdf` requires `consolidateQuarter`; skipped, the engine runs the read itself |
| a duplicate call is refused | two identical `buildPdf`: the second does not run |
| a sealed record of the path | one line per read, in order, with the state the tool answered |
| honest closure | ceiling reached without a PDF: the reply says what ran and that no PDF exists |

What it does NOT guarantee: figures inside tool ARGUMENTS. The figure check runs on the finish
message and the delivered text only, never on arguments:

```
buildPdf({ title: 'Q2', narrative: 'Sales grew 12% vs Q1' })     ← "12%" passes unchecked
buildPdf({ title: 'Q2', from: 'qry_88', compareWith: 'qry_87' })  ← ids checked; the tool computes 12%
```

The PDF's content is exactly as trustworthy as in LangGraph: it depends on the PDF tool receiving
references to data and computing the figures itself.

### 5.5 Correct reads and analysis without looprun

The simplest guarantee lives in the tools, and works under every framework and under MCP:

```
querySales({ period: 'Q2-2026', region: 'south' })   → { handle: 'qry_88', rows: 1240 }
consolidateQuarter({ from: ['qry_88', 'qry_87'] })   → { handle: 'agg_12', growthPct: 12 }
buildPdf({ from: 'agg_12' })                          → { handle: 'rep_q2', path: '/reports/q2.pdf' }

buildPdf({ from: 'qry_88' })        → error: "buildPdf takes an aggregation handle (agg_*)"
buildPdf({ narrative: '12%...' })   → error: the schema has no such field
```

| guarantee | looprun (declared) | without looprun (in the tool) |
|---|---|---|
| malformed argument | per-field schema on the tool card | schema on the tool; every framework |
| an id no read returned | `groundedIds` refuses the call | the tool answers "no such id" for a handle it never issued |
| order | `needs` runs the missing read, then releases | `buildPdf` accepts only the handle `consolidateQuarter` returned |
| duplicate call | refused | an idempotency key on the tool |
| "does the PDF exist, built from N reads?" | the sealed record | a code check after the loop; repeat on failure |
| the analysis itself is right | nobody | nobody; only test cases |

looprun still differs in three ways — the rules sit in one declared file instead of N tools; a
missing read is executed rather than reported as an error the model must react to; the record and
the honest closure — and each starts to pay with many tools and crossed rules (c22 has 54 tools) or
with a model too small to correct itself from tool errors.

---

## 6 · Autonomous agents

looprun is not the best fit for fully autonomous agents. It is built for agents that talk to a
person and act on that person's word.

```
  what looprun pays                              needs a person on the other side?
  ─────────────────────────────────────────────  ────────────────────────────────
  hold the act and wait for the word + code       yes
  say what the act would do, with figures         yes
  one voice, in the writer's language             yes
  a reply that cannot contradict the record       yes (it is for the reader)
  grounded ids, order, duplicates, ceiling        no, but well-designed tools do the same
  a sealed record per act                         no, but the pipeline log does the same
```

| kind of agent | best |
|---|---|
| fully autonomous (cron, pipeline, exploration with no approval) | LangGraph or a Mastra workflow, tools with handles, a code check |
| autonomous that stops to ask approval for a consequential act | looprun in the act's step, inside the workflow |
| conversational desk with irreversible acts | looprun |

---

## 7 · Mastra against LangGraph for the autonomous case

A technical tie where it matters: both carry branches, parallelism, loops, per-step retries, pause
with resume and durable state. The choice comes from the team's language and the surroundings.

```
  capability                     LangGraph                          Mastra
  ─────────────────────────────  ─────────────────────────────────  ─────────────────────────────────
  mental model                   graph: nodes + edges + shared      chain: .then .branch .parallel
                                 state with reducers                .foreach .dountil, schemas per step
  language                       Python first, JS too               TypeScript only
  loops and retries              conditional edges back to a node;  dountil / dowhile / foreach with
                                 RetryPolicy per node               concurrency; retries per step
  pause and resume               interrupt + checkpointer           suspend/resume + storage
  going back in time             replay and fork from any           not the proposal; resume from the
                                 checkpoint, even inside a subgraph suspended point only
  cron                           outside the library (platform or   built in: mastra.schedules.create
                                 external cron)                     for a workflow and for an agent
  external durable execution     its own platform                   an optional Inngest engine
  ecosystem                      LangChain (tools, RAG, LangSmith)  agents, memory, RAG, evals and
                                 large and old                      Studio in one package; newer
```

TypeScript team: Mastra, and the built-in cron fires the report without an extra piece. Python
team, or a need to travel back through long runs to debug, or already inside LangChain: LangGraph.

---

## 8 · Cost for the conversational desk

Repository measurements on Gemini Flash-Lite, priced at the repository's own table ($0.10 per
million input tokens; another table cites $0.25, so dollar figures may be 2.5× higher; the ratios
hold).

```
  per conversation turn                 looprun (c22)          plain agent           hand-written loop
  ────────────────────────────────────  ─────────────────────  ────────────────────  ────────────────────
  model calls                           2 to 4                 1                     1 + rewrites
  input tokens                          ~14.5k (no cache)      ~4–6k with 50 tools   10.9k per step
  provider cache                        does not engage at 4k  engages on a stable   73%
                                                               prefix
  cost per turn                         $0.0015 to $0.004      $0.0005 to $0.001     $0.001 (cached)
  model latency                         3 to 4 s               ~1 s                  1 to 3 s

  100,000 turns/month on Flash-Lite     looprun $150 to $400   plain agent $50 to $100
  a local model (Qwen, llama.cpp)       cost = the machine, in both cases
```

Turn for turn, looprun costs 2–4× a plain agent in tokens and wait. Where the account turns:

```
  to reach ~95 on the 100-case exam     raw Flash-Lite          54     ← does not serve
                                        Flash-Lite + looprun    95     ← serves, at $0.004/turn
                                        a frontier model       ~95?    ← serves, at 10–30× the token price
```

Four times the tokens of a cheap model is far cheaper than once the tokens of an expensive one.
The honest caveat: 54 against 95 is this repository's own exam; the τ²-bench pairing, where frontier
models carry a published price per task (Fable 5 $2.97, Qwen 4B $0.01), is planned and has not run.

---

## 9 · Verdicts, one line each

| question | answer |
|---|---|
| looprun vs LangGraph in general | not competitors: LangGraph organises steps; looprun governs a desk with irreversible acts |
| inside a company | back office and reading: LangGraph/SDK; an internal desk with real acts, sensitive data, a local model and per-act audit: looprun |
| an information service with reports, by cron | a weak fit alone; with tools doing the work, a modest gain; inside a Mastra workflow, a good fit when a send needs approval |
| Mastra workflows | yes: an own step of six lines; a hold maps to suspend/resume; `createStep(agent)` needs the two-method adjustment on the backlog |
| the exploratory report | ids, order, duplicates and the record are guaranteed; figures inside the PDF are not; the PDF tool pays those |
| correct reads and analysis without looprun | yes: chained handles, strong schemas, a code check |
| autonomous agents | not looprun's ground; four of its six guarantees need a person on the other side |
| Mastra vs LangGraph for the autonomous case | a tie; TypeScript → Mastra (built-in cron); Python or time travel → LangGraph |
| a conversational agent that changes systems | looprun's ground, when the change has consequence and someone gives the word |
| cost on that ground | 2–4× a plain agent per turn; pays when it lets a small model replace a large one (54 → 95 on the internal exam; τ² not yet run) |

---

## 10 · Sources

- This repository: `README.md`, `docs/tutorial/01-concepts.md`, `docs/benchmarks.md`,
  `docs/analysis/2026-08-31-governed-vs-traditional-verdict.md`, `BACKLOG.md` row 24,
  `packages/core/src/run/turn.ts` (figure grounding on the finish message and the delivered text),
  `packages/core/src/cards/catalog.ts` (`groundedIds`, `needs`, `maxCalls`),
  `packages/core/src/cards/cards.ts` (`DEFAULT_LIMITS`), `packages/mastra/src/loop-run-agent.ts`,
  `packages/mastra/src/mcp-connect.ts`.
- atlas-c22 (agentspec-bench, commit 8f2833f): 48/53, 256 model calls, 917k input / 16k output
  tokens, ~14.5k input tokens per turn, 2.5 h brief to final.
- LangGraph documentation (interrupts, functional API review, fault tolerance, time travel),
  OpenAI Agents SDK documentation (human in the loop, guardrails), Mastra documentation (workflow
  methods, suspend and resume, schedules), all read on 2026-09-04.
- The Mastra workflow checks of §5.3 were run under `packages/mastra` with vitest against
  `@mastra/core` 1.50.1, scripted model, no external call; the files were not kept.
