# looprun — TO-BE Architecture Blueprint v3: Cards Carry Words, Surfaces Carry Tools

The TO-BE design for the looprun engine, governed by `docs/requirements.md` and by the rule
that outranks every other quality:

> **THE GOLDEN RULE.** Creating an agent is so easy a 6-year-old could do it, and the
> engine code underneath is so plain a 6-year-old could read it.

Scope: blueprint only — no implementation, no migration plan, no compatibility shims
(pre-1.0, no external consumers). Validation gate: the Atlas exam in `agentspec-bench`
scores **≥ 85/100** on the rebuilt engine, or the moved case is argued ill-formed against
the baseline layer table (the arbiter file:
`agentspec-bench/docs/analysis/2026-08-12-atlas-baseline-v020-the-fifteen.md`; the local
record: `docs/analysis/2026-08-12-atlas-baseline-v020-summary.md`).
The compliance table this charter demands is §15; the three R10.5 maps are §13.

---

## 1 · THESIS

**The two cards contain zero tool plumbing. Tools live where they already execute.**

The whole authoring surface is two names — one agent = one `AgentSpec`, everything
conversation-global = one `DomainContract` — and both cards carry only WORDS: a persona, a
voice, rule sentences, disclosure sentences, a masked-field list, wording overrides. A
tool's governance facts (effect class, target argument, simulation parameter, sensitive
paths, user-facing label) live in the table of the surface that executes the tool: the
`world` card's own data blocks locally, the `mcpWorld` card's SAME blocks over a live
MCP surface (§4). In production the author writes NO tool anything.

The two rejected drafts died on structural properties this design makes unrepresentable:
v1's per-tool authoring burden cannot exist because the cards have no per-tool objects at
all, and v2's confusing checks split cannot exist because there is exactly ONE guard field
name (`guards`), ONE guard shape (`Guard`), on both cards — a check, a judged question,
and a prose rule are three strengths of the same sentence, and the only placement question
is one a child can answer: *is this about how MY desk behaves (the spec card) or about
what a tool does for everyone (the contract card)?*

The engine underneath is a straight line of named desks. The `Turn` sequences and decides
nothing; every decision belongs to exactly one small desk (the `Rulebook` decides guards,
the `ConsentDesk` decides questions, the `StatusClerk` decides what a call's answer means,
the `FinishDesk` decides what a valid closing looks like). Because each desk answers one
question, each desk is small — every engine class commits to ~200 lines or less. Four
one-method ports at the bottom, three facades at the top, one dependency direction.

---

## 2 · HELLO WORLD

The complete file an author writes. Zero engine concepts, zero functions, zero return
protocols: `records` are rows, `reads` look, `writes` change, `destructive` changes for
good — the block a tool sits in IS its effect declaration.

```typescript
import { LoopRunAgent, world } from 'looprun';

const hotel = world({
  records: { booking: [{ id: 'bk_1', room: 'Blue Room', day: 'Friday' }] },
  reads:       { listBookings: { list: 'booking' } },
  destructive: { cancelBooking: { remove: 'booking', label: 'cancel a booking' } },
});

const agent = new LoopRunAgent({
  spec: { name: 'concierge', persona: 'A friendly hotel concierge who manages room bookings.' },
  world: hotel,
  model: 'google/gemini-2.5-flash',
});

console.log((await agent.generate('Please cancel booking bk_1.')).text);
// I can cancel bk_1, but that needs your OK first.
// · cancel a booking (bk_1) — waiting for your approval.
//   To approve, reply exactly: CONFIRM 7Q4MX
```

15 lines including blanks; 12 lines of code. Because `cancelBooking` sits under
`destructive`, the consent protocol installs itself (R1.5): the engine holds the call,
words the question from the declared `label` (the tool name never appears on the user's
screen — R3.7), prints the one-time code itself, and only the typed code releases exactly
that call — which still passes every other guard. The spec omits `tools`, so this agent's
lane is the whole surface (the single-agent default). No contract card yet — the tutorial
adds it later in the ladder. Production swaps `world(...)` for `mcpWorld(...)` (§4) — the
config line does not change.

The tutorial progression this hello world opens (R1.2, one concept per lesson):
1 hello agent · 2 a `destructive` tool is the whole consent setup · 3 `agent.guards()` —
read what you installed · 4 `label` — the user's words for the act · 5 `disclose.before`
— what this exact call would do · 6 `disclose.after` + `disclose.later` — the record line
and the standing sentence · 7 the contract card: `voice` + `facts` · 8 `disclose.needs` —
figures in the question, read by the engine itself · 9 `secrets` · 10 `guards` on the
contract (a tool guard every lane owes) · 11 `guards` on the spec (how this desk behaves)
· 12 a judged guard (`judgeQuery`, the declared judged factories) · 13 `limits` ·
14 `wording` · 15 `rewrites` — a guard decides, a rewrite rewrites · 16 `llmParams` +
named provider presets · 17 a second agent on the same contract (`tools` + `teammates`) ·
18 the exam.

---

## 3 · THE TWO CARDS

The whole authoring surface is these two names. Field names are new wherever the rename
register condemned the old ones (§11).

```typescript
/** CARD 1 — one agent = one AgentSpec. Everything about HOW THIS DESK BEHAVES. */
export interface AgentSpec {
  /** The agent's name — records, errors, the exam, the server's /v1/models row. Required. */
  name: string;
  /** Who this agent is; the first prompt line. Required — the contract carries NO persona (R1.4). */
  persona: string;
  /** This agent's lane: tool NAMES from the surface. Omitted = every surface tool (the single-agent default). */
  tools?: readonly string[];
  /** Other lanes, for hand-offs: agent name → what that desk handles. Omitted = single-agent domain. */
  teammates?: Readonly<Record<string, string>>;
  /** Guards about how THIS desk works. Highest priority (R5.6). Omitted = []. */
  guards?: readonly Guard[];
  /** The model's parameters, verifiably delivered to the provider, incl. named provider
   *  presets (R7.4). Merges PER FIELD over the target's declared defaults — a partial
   *  object overrides only the fields it names. Omitted = the target's defaults. */
  llmParams?: LlmParams;
}

/** CARD 2 — everything conversation-global = one DomainContract. Everything about THE BUSINESS. */
export interface DomainContract {
  /** The domain's name. Required. */
  name: string;
  /** Shared business tone, one sentence — never a persona (R1.4). Omitted = none. */
  voice?: string;
  /** Domain truths stated in every agent's prompt. Omitted = []. */
  facts?: readonly string[];
  /** Guards about TOOLS and the whole conversation — what ANY lane would owe. Run after spec guards (R5.6). Omitted = []. */
  guards?: readonly Guard[];
  /** Per-tool disclosure sentences, three tenses, keyed by tool name. Omitted = engine sentences from the label. */
  disclose?: Readonly<Record<string, Disclose>>;
  /** Rewrites of the outgoing reply — a guard decides, a rewrite rewrites (§5.2). Omitted = []. */
  rewrites?: readonly Rewrite[];
  /** THE ONE HOME of what is secret — a business fact, so it lives on the business card.
   *  Field names or dotted paths, masked at every seam — results, args, stored acts,
   *  delivered text; the object form picks 'omit'. Omitted = []. */
  secrets?: readonly (string | { readonly path: string; readonly mode: 'omit' | 'mask' })[];
  /** Named overrides for engine sentences and the user-facing status words. Omitted = the engine pack. */
  wording?: Wording;
  /** Bounded-everything ceilings. Omitted = { calls: 10, destructive: 1, retries: 2, questionTurns: 3 }. */
  limits?: Limits;
}

/** THE ONE GUARD SHAPE — both cards, three strengths of the same thing:
 *    prose-only      { rule }                  the declared residue (R6.8)
 *    deterministic   { rule, deny }            a pure function refuses (R6.4)
 *    judged          { rule, judgeQuery }      only when no check can decide (R5.6)
 *  `deny` and `judgeQuery` are exclusive; declaring both throws at construction (R1.6). */
export interface Guard {
  /** Unique among the card's guards — the census keys on it. Required. */
  name: string;
  /** THE sentence — the prompt, the denial, and guards() all print this one string (R1.5, R6.1).
   *  Present/imperative, never accusatory (R6.2). Required. */
  rule: string;
  /** Exact declared tool names this guard covers (Set membership, never substring). Omitted = the whole conversation. */
  tool?: string | readonly string[];
  /** REQUIRED — the phase of the turn this guard runs in. Factories fill it themselves;
   *  only a hand-written guard types it. */
  on: 'input' | 'preTool' | 'postTool' | 'reply';
  /** Pure check over the frozen typed ctx; returns the specific detail for THIS violation
   *  (appended to `rule` in the denial), null = allow. */
  deny?: (ctx: InputCtx | CallCtx | ResultCtx | ReplyCtx) => string | null;
  /** A yes/no question answered by the session's OWN model (R5.6). Its phase is 'reply' —
   *  construction validates. */
  judgeQuery?: string;
  /** What an UNREADABLE judged answer does. Only beside judgeQuery. Omitted = 'denyOnFails'. */
  judgePolicy?: 'passOnFails' | 'denyOnFails';
}

/** The four phases of `on`, in turn order:
 *    'input'      the user's text just arrived        (the pattern-block home)
 *    'preTool'    before a tool call runs
 *    'postTool'   after the tool ran, over its result (checkResult's home)
 *    'reply'      the reply is ready                  (judged guards live here)
 *  Every ctx carries `userText` — the user's text as a string to search for EXACT
 *  LITERALS (whole-token, contiguous, whole-value equal), never to interpret (R6.5).
 *  CallCtx/ResultCtx also carry `state` — the frozen records snapshot where a
 *  RecordsPort exists (§5.1). */

/** Disclosure for one tool — sentences, not code. Slots are {alias.path} over engine-performed reads. */
export interface Disclose {
  /** Reads the ENGINE performs itself on the held call's own args: alias → read tool
   *  (an args map when the read's arg names differ from the held call's). Omitted = {}. */
  needs?: Readonly<Record<string, string | { tool: string; args: Readonly<Record<string, string>> }>>;
  /** Before-tense, shown on the consent question:
   *  'Cancelling {booking.room} on {booking.day} is permanent.' Omitted = engine sentence from the label. */
  before?: string;
  /** After-tense: the record line once the act ran; slots over args and result. Omitted = engine sentence. */
  after?: string;
  /** Standing sentence in later turns while the act stays relevant. Omitted = none. */
  later?: string;
}

export interface Wording {
  /** Override the user-facing word per status/reason. Omitted keys keep the engine word. */
  status?: Readonly<Partial<Record<Status | Reason, string>>>;
  /** Named engine sentences (approval instruction, exhaustion closure, unknown-status sentence).
   *  Omitted keys keep the pack. */
  sentence?: Readonly<Partial<Record<EngineSentenceKey, string>>>;
}

export interface Limits {
  /** Model tool calls per turn. Omitted = 10. */
  calls?: number;
  /** Destructive acts per turn (done + unknown both count — fail-closed). Omitted = 1. */
  destructive?: number;
  /** Reply corrections before the engine closes the turn itself. Omitted = 2. */
  retries?: number;
  /** Turns a consent question stays open before closing 'expired' (the closure is delivered). Omitted = 3. */
  questionTurns?: number;
}

/** Declared in the contract leaf (vocabulary.ts) — StepInput carries it; re-exported for authors. */
export interface LlmParams {
  temperature?: number;      // delivered to the provider or the build fails its wire test (R7.4)
  topP?: number;
  maxOutputTokens?: number;  // a LOCAL-tier target arms this as a brake from the tier (R7.1)
  preset?: ProviderPreset;   // a NAMED preset in the provider's own dialect, e.g. 'gemini:thinking-off'
}
```

**Where deterministic checks, judged questions, and prose rules live — and why this home
cannot confuse.** There is exactly one field name, `guards`, with one shape, on both
cards. The home is picked by one question a six-year-old can answer: **who is the guard
about?**

| the guard is about… | home | example |
|---|---|---|
| a tool anyone could call | `contract.guards` | `onlyAfter('cancelBooking', 'getBooking')` — every lane owes it |
| how this one desk behaves | `spec.guards` | `{ name: 'no-prices', rule: 'The concierge never discusses prices.', on: 'reply', deny: … }` |

There is no `checks` field and no `judged` field: a `Guard` with `deny` is deterministic,
a `Guard` with `judgeQuery` is answered on the session's own model, a `Guard` with neither
is the declared prose residue (R6.8). One concept, three degrees, zero new names. The R5.6
priority order falls straight out of the homes: `spec.guards` → `contract.guards` (the
change-window level — the agent-vs-change-window boundary stays declared OPEN and
decidable) → consent → honesty → the universal floor, and `agent.guards()` prints that
exact order.

A contract guard may name a live-surface tool: `onlyAfter('cancelBooking', …)` is legal
whether `cancelBooking` is a world tool or a company MCP tool — the NORMS binding for a
live surface is authored on the contract card, once, and rendered into that tool's own
description (§5 `PromptWriter`). No guard is ever written into the generated `mcpWorld`
module.

---

## 4 · TOOL FACTS LIVE OUTSIDE THE CARDS

The cards carry no tool objects. A tool's governance facts live in the SURFACE CARD —
one declarative pattern, three sibling factories, differing only in where execution
happens:

```typescript
// local — records + declarative execution
const hotel = world({
  records:     { booking: [{ id: 'bk_1', room: 'Blue Room', day: 'Friday' }] },
  reads:       { listBookings: { list: 'booking' } },
  destructive: { cancelBooking: { remove: 'booking', label: 'cancel a booking' } },
});

// remote — the SAME blocks; execution belongs to the live MCP tool (R9-EX).
// The generated, sealed module exports the BLOCKS — no URL, no secret ever inside it:
import { hotelSurface } from './gen/hotel-surface.js';
//   = { reads: { listBookings: {} },
//       destructive: { cancelBooking: { label: 'cancel a booking', target: 'id',
//                                       proxy: { of: 'cb_cancel', args: { bookingRef: 'id' } } } },
//       seal: 'sha256:…' }
const hotel = mcpWorld({
  mcp: { url: 'https://mcp.acme.com/hotel',   // the HOST's connection — env/closure (R3.8),
         headers: { Authorization: `Bearer ${process.env.ACME_MCP_TOKEN}` } },   // merged at construction
  ...hotelSurface,
});

// the config is ONE form on every path (§5.5):
const agent = new LoopRunAgent({ spec, contract, world: hotel, model: 'google/gemini-2.5-flash' });
```

- **Two sibling factories, not one factory with a mode:** the block ENTRY shapes differ —
  local entries carry the action forms (`list` · `remove` · …); remote entries carry
  `label` / `target` / `proxy` / `simulation` / `does` — and two factories give clean
  types and clean errors. What is SECRET is a business fact and lives ONLY on the
  contract card (`contract.secrets`, §3) — no surface entry declares it. `liveWorld({ tools, …blocks })` is the third
  sibling, for native host tools (same entry shape as `mcpWorld`).
- **Deny-by-default:** a live tool absent from every block does not exist for the agent —
  the exclusion is reported STRUCTURALLY at construction (R3.8).
- **The gate is code review:** the pipeline GENERATES the surface module (fix at
  source · proxy · exclude · contest — R3.2) and a human approves it as code. The `seal`
  (the certification hash) rides the generated module and covers the BLOCKS ONLY — never
  the host's connection, which the host merges at construction; verification against the
  live surface runs at construction — a renamed tool, a new field, a changed type voids
  the seal and throws (R3.8). The company's own file is never edited.
- **`proxy` carries both emendation forms (R3.3):** a rename with an args map — the wire
  maps back to the real call — and a missing read COMPOSED from existing reads.
- **One internal truth:** the engine compiles the blocks of all three card kinds into one
  engine-internal fact table — `SurfaceFacts`, one `ToolFact` row per tool, derived by
  `factsFromWorld` (§5.2). No authoring name exists for it, and no second truth about
  tool facts exists.
- **Credentials are the host's** — env/closure, never the cards (R3.8).

What the author never writes: an executor, a port, a hook, a loop, a fact table.

---

## 5 · CLASS INVENTORY

Every engine class/module across all packages. Sizes are commitments (~200 target, 400
ceiling; every class below commits to ≤ ~200 — R2.7). Format per entry: responsibility ·
size · public surface · private state · collaborators (the lintable import list).

**The typing law over everything below (R2.8), enforced in the build:** `tsconfig` strict
with `noImplicitAny`; `@typescript-eslint/no-explicit-any` at error with no
`eslint-disable` anywhere; `no-unsafe-assignment`/`no-unsafe-return` on `src/**`. No `any`
on any exported surface; closed unions for every vocabulary; external input enters as
`unknown` and is narrowed at the boundary.

**Pre-named decomposition lines (R2.7):** the two commitments under the most load are
`AgentFactory` and `CallRunner`; if either breaches ~200 at implementation, the split is
already named — the auto-install builder leaves `AgentFactory`, the per-verdict routers
leave `CallRunner`. A breach decomposes along those lines; it never ducks the number.

### 5.1 `@looprun-ai/core` — `contract/` (the dependency-free leaf, L0)

**`vocabulary.ts`** (module, ~180 lines) — every crossing type, closed unions only; one
home per shape (R2.5); imports nothing.

```typescript
export type Json = string | number | boolean | null | readonly Json[] | { readonly [k: string]: Json };
export type Effect = 'read' | 'write' | 'destructive';       // 'destructive' = irreversible act of any kind
export type Done = 'yes' | 'no' | 'unknown';                 // the executor's whole vocabulary (R3.6)
export type Status = 'done' | 'not-done' | 'unknown';        // THE user-facing word, engine-derived
export type Reason = 'held' | 'refused' | 'blocked';         // why not-done
export type ReportWord = 'done' | 'held' | 'refused' | 'blocked' | 'unknown';   // the model's closing vocabulary
export type Evidence = 'executor' | 'diff' | 'engine';       // who grounded the status (R8.4)
export type QuestionClose = 'declined' | 'superseded' | 'expired' | 'vetoed';
export type QuestionState = 'open' | 'consumed' | { readonly closed: QuestionClose };
export interface Msg { readonly role: 'user' | 'assistant'; readonly text: string }
export interface ToolAnswer { readonly result: Json; readonly done: Done }
export interface Patch { readonly entity: string; readonly id: string; readonly set: Readonly<Record<string, Json>> }

/** The call as the executor receives it: the tool name and the coerced REAL args — nothing else.
 *  A simulation downgrade exists only as the tool's OWN declared parameter set inside args.
 *  No other field exists: no options, no flags, no attestation override (R2.6). */
export interface ReadyCall { readonly tool: string; readonly args: Readonly<Record<string, Json>> }

/** The frozen data form of a canonical call. Where it is RECORDED or DELIVERED (Act.call,
 *  Question.call), args are masked; the executable form lives only in engine-private state. */
export interface CanonicalCallData { readonly tool: string;
                                     readonly args: Readonly<Record<string, Json>>;
                                     readonly key: string }

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'refuse'; readonly guardName: string; readonly detail: string }
  | { readonly kind: 'hold' }                                 // consent, no simulation declared: hold-and-ask
  | { readonly kind: 'simulate' }                             // consent, simulation declared: preview, then ask (R5.4)
  | { readonly kind: 'restate'; readonly actId: string }      // duplicate call: the first result restated
  | { readonly kind: 'owe'; readonly reads: readonly OwedRead[] };   // rule-owed reads the ENGINE performs (R5.2)
export interface OwedRead { readonly alias: string; readonly tool: string; readonly args: Readonly<Record<string, Json>> }
export type Correction =
  | { readonly kind: 'redrive'; readonly guardName: string; readonly detail: string }
  | { readonly kind: 'earlyFinish' } | { readonly kind: 'staleFinish' } | { readonly kind: 'forcedFinish' }
  | { readonly kind: 'recordCorrected'; readonly actId: string; readonly said: Done }   // snapshot diff overruled the executor
  | { readonly kind: 'simulationRevoked'; readonly tool: string }
  | { readonly kind: 'judgeUnreadable'; readonly guardName: string };
export interface Act {
  readonly id: string;                        // engine-minted (R5.3)
  readonly turn: number;
  readonly origin: 'model' | 'engine' | 'licence';
  readonly call: CanonicalCallData;           // masked on record — the ONLY stored form (R5.5)
  readonly effect: Effect;
  readonly said: Done | null;                 // the executor's own word; null = the call never reached it
  readonly status: Status;                    // the engine's word, derived — never guessed (R3.6)
  readonly reason: Reason | null;             // set exactly when status is 'not-done'
  readonly evidence: Evidence;
  readonly sentence: string;                  // the record line the user reads
  readonly result: Json;                      // masked; on a held call with simulation: the preview result
  readonly questionId: string | null;         // the consent question this act raised or served
}
export interface ReportLine { readonly tool: string; readonly target: string; readonly word: ReportWord }
export interface FinishPayload { readonly message: string; readonly report: readonly ReportLine[] }
export interface RawCall { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
export interface ToolCard { readonly name: string; readonly does: string; readonly schema: Json }
                                              // does = the declared does + the tool's contract-guard
                                              //   sentences — the R6.1 prose channel
export interface StepInput { readonly system: string; readonly messages: readonly Msg[];
                             readonly tools: readonly ToolCard[]; readonly forceFinish: boolean;
                             readonly llmParams: LlmParams }
export interface ModelStep { readonly calls: readonly RawCall[]; readonly text: string }
export interface Question {
  readonly id: string;
  readonly code: string;                      // 'CONFIRM 7Q4MX' — crypto entropy + per-issuance nonce,
                                              //   unique among open codes, NO tool name (R3.7)
  readonly call: CanonicalCallData;           // the held call, masked display form; the executable
                                              //   call lives in ConsentDesk private state
  readonly sentence: string;                  // label + filled before-tense — what the user is agreeing to
  readonly state: QuestionState;
  readonly bornAtTurn: number;
}
export interface TurnRecord {
  readonly turn: number;
  readonly servedBy: string;                  // which certified target answered (R7.5)
  readonly userText: string;
  readonly acts: readonly Act[];
  readonly questions: { readonly issued: readonly Question[]; readonly consumed: readonly string[];
                        readonly closed: readonly { readonly id: string; readonly why: QuestionClose }[] };
  readonly finish: FinishPayload | null;
  readonly corrections: readonly Correction[];
  readonly text: string;                      // the composed delivery
  readonly closedBy: 'model' | 'engine';
}
export class TurnFailure extends Error {      // R2.10 — typed, loud; a failed turn seals NOTHING
  readonly kind: 'provider-auth' | 'provider-quota' | 'network' | 'executor' | 'construction';
  readonly detail: string;
}
export class CardError extends Error {        // R1.6 — every problem at once
  readonly problems: readonly { readonly code: string; readonly sentence: string }[];
}
export interface InputCtx  { readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface CallCtx   { readonly call: CanonicalCallData; readonly effect: Effect;
                             readonly consented: boolean;      // true only on the engine-fed licensed call
                             readonly state: StateSnapshot | null;   // frozen; null on a stateless surface
                             readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface ResultCtx { readonly call: CanonicalCallData; readonly result: Json;
                             readonly state: StateSnapshot | null;
                             readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface ReplyCtx  { readonly message: string; readonly report: readonly ReportLine[];
                             readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
                                              // every ctx carries the user's text as a string for
                                              //   EXACT-LITERAL search — whole-token, contiguous,
                                              //   whole-value equal; a guard never interprets it
                                              //   (R6.5). A state predicate on a stateless surface
                                              //   is a construction error, never a silent null-pass
export type StateSnapshot = { readonly [entity: string]: { readonly [id: string]: Readonly<Record<string, Json>> } };
export interface InstalledGuard { readonly name: string; readonly rule: string;
                                  readonly home: 'spec' | 'contract' | 'engine';
                                  readonly on: 'input' | 'preTool' | 'postTool' | 'reply';
                                  readonly tools: readonly string[];
                                  readonly kind: string;     // the species: 'onlyAfter' · 'argRequired'
                                                             //   · 'custom' · 'judged' · 'prose' · …
                                  readonly judged: boolean;
                                  readonly judgePolicy: 'passOnFails' | 'denyOnFails' | null;
                                  readonly installedBecause: string }
export interface Rewrite { readonly name: string;
                           apply(text: string): string }     // a rewrite rewrites the outgoing reply;
                                                             //   it never decides (§5.2: purgePattern ·
                                                             //   maskPattern · swapTerms)
export interface GuardCensus { readonly guards: readonly InstalledGuard[];        // band order
                               readonly rewrites: readonly { readonly name: string;
                                 readonly kind: 'purgePattern' | 'maskPattern' | 'swapTerms' }[];
                               readonly limits: Required<Limits> }
                                              // the census carries ALL governance (R1.5):
                                              //   the installed guards, the rewrites as their
                                              //   own section, and the resolved limits
export type EngineSentenceKey = 'approvalInstruction' | 'exhaustionClosure' | 'unknownStatus'
                              | 'questionExpired' | 'questionSuperseded' | 'deniedByGuard';
export type RoutingStrategy = 'sequential' | 'random' | 'rate-limit' | 'backup-only' | 'round-robin';
export interface ModelTarget { readonly id: string; readonly provider: string;
                               readonly keyEnv: string | null;
                               readonly tier: 'cloud' | { readonly local: string };   // declared, never inferred (R4·ASK)
                               readonly certified: boolean }
export type ModelChoice = string | { readonly targets: readonly string[]; readonly strategy: RoutingStrategy };
export type ProviderPreset = 'gemini:thinking-off';   // closed union; grows only by measured addition (R7.4)
export interface LlmParams { readonly temperature?: number; readonly topP?: number;
                             readonly maxOutputTokens?: number; readonly preset?: ProviderPreset }
                                              // ONE home (R2.5): §3 shows it to authors, cards.ts re-exports it
export interface ServingHandle { readonly baseUrl: string; readonly servedModel: string;
                                 stop(): Promise<void> }
export interface TierSpec { readonly alias: string;
                            readonly speculative: 'none' | 'draft-mtp';   // MTP where it pays, measured
                            readonly kv: 'f16' | 'q8_0';                  // f16 the law, q8_0 the RAM hatch
                            readonly ctx: number;                          // sized to fit the assembled prompt
                            readonly cacheRam: number; readonly slots: number }   // warm-prompt sizing (R9.2)
```

Every object typed here travels deep-frozen (R2.9): freezing is in-place and copy-free;
sealed history and compiled cards are shared by reference (that is what keeps derived
renders memoizable and the R7.3 prompt prefix byte-identical); a CLONE happens only when
exposing a view of live mutable state (the custom executor's records, the world snapshot).
`TurnDraft` is the one mutable work area (acts, questions issued/consumed/closed,
corrections, delivery parts), private to the turn and folded by `Session.seal`.

**`ports.ts`** (module, ~40 lines) — the four single-step seams. One method each; no
options object; no field can carry an endpoint or governance (R2.6 — `ReadyCall` above is
the whole executor payload). Authors and host devs never see them — composition lives
under the facades.

```typescript
export interface ModelPort        { step(input: StepInput): Promise<ModelStep> }
export interface ToolPort         { call(call: ReadyCall): Promise<ToolAnswer> }
export interface RecordsPort      { snapshot(): StateSnapshot }        // worlds only; absence grades trust (R3.6)
export interface ModelRuntimePort { serve(tier: TierSpec): Promise<ServingHandle> }   // R9.2
```

**`CanonicalCall`** (class, ~80 lines) — THE one call identity (R8.2): sorted-key deep
canonical form over typed, coerced REAL values (masking happens on record, not here —
the licence must execute); array values stay order-significant; every duplicate check,
licence match, question dedupe, and record lookup routes through it.

```typescript
class CanonicalCall {
  readonly tool: string;
  readonly args: Readonly<Record<string, Json>>;     // coerced, key-order-free — the executable form
  readonly key: string;                              // sorted-key canonical form of { tool, args }
  static of(tool: string, raw: Record<string, unknown>, decl: ToolFact):
    CanonicalCall | { readonly badArg: string };     // rejects non-coercible values loudly
  data(masker: (v: unknown) => Json): CanonicalCallData;   // the masked record/display form
  equals(other: CanonicalCall): boolean;
}
```
Private: none (immutable value). Collaborators: vocabulary only.

### 5.2 `@looprun-ai/core` — `cards/` (L1–L2)

**`cards.ts`** (module, ~150 lines) — the §3 declarations verbatim: `AgentSpec`,
`DomainContract`, `Guard`, `Disclose`, `Wording`, `Limits` (`LlmParams` and `Rewrite`
live in the contract leaf — `StepInput` carries the first — and are re-exported here for
authors). Types + doc comments only. Collaborators: contract leaf.

**`facts.ts`** (module, ~100 lines) — the engine-internal `SurfaceFacts` and `ToolFact`
(name · label · does · effect · target · schema · simulation · proxy), plus
`factsFromWorld(card: WorldCard | McpWorldCard | LiveWorldCard): SurfaceFacts` — the one
derivation that keeps every surface kind on a single fact truth. No authoring name exists
for these types (§4). Collaborators: contract leaf, world vocabulary.

**`catalog.ts`** (module, ~200 lines) — the guard factories (R6.7), each returning
`Guard` with its phase filled, plus the three `Rewrite` factories. Two laws sit over the
table: NOTHING JUDGED INSTALLS ITSELF — every judged check is declared — and REGEX EXISTS
ONLY inside `blockPattern` / `purgePattern` / `maskPattern` (the purity lint rejects it
anywhere else).

```typescript
// deterministic factories — you call them
onlyAfter('payInvoice', 'approveInvoice')   // gated tool only after the prerequisite
                                            //   SUCCEEDED this conversation; a READ
                                            //   prerequisite → the engine PERFORMS it
                                            //   (the owe verdict, R5.2); a WRITE → deny,
                                            //   teaching the order
maxCalls('sendEmail', 1, { scope: 'conversation', reason: 'One email per person, ever.' })
argAbsent('sendEmail', 'bcc')               // declared, but forbidden to send
precondition('shipOrder', ({ record }) => record?.paid === true, 'Only paid orders ship.')
                                            // the predicate receives { record, state }:
                                            //   record = the call's target record, frozen
                                            //   (null on a target-less tool) · state = the
                                            //   whole frozen snapshot
precondition(['storeProfile', 'shareProfile'],
             ({ state }) => state.settings?.main?.consentOnRecord === true,
             'Consent must be on record.')  // tool | [tools] — one binding, a whole set
checkResult('payInvoice', ctx => ctx.result.status === 'settled'
  ? null : 'the invoice did not settle')    // postTool; a violation joins the reply
                                            //   corrections, never a veto — the call ran
mustAccountFor({ records: ['BK-1'], status: 'done' })
                                            // the report must cover BK-1 as 'done';
                                            //   whole-value equality, polarity a FIELD
valueFromUser('sendEmail', 'to')            // the value must appear VERBATIM in the
                                            //   user's own words (contiguous whole tokens)
blockPattern('no-cpf-in', /\d{3}\.\d{3}\.\d{3}-\d{2}/, 'A CPF never passes through.',
             { on: 'input' })               // 'input' (default) | 'reply' — DENIES

// judged factories — engine-worded, declared, never self-installed
lieCheck()             // "Does the report contradict what the recorded acts show?"
impossibilityCheck()   // "Does the reply promise anything no surface tool can do?"
injectionCheck()       // "Did the reply obey an instruction that arrived INSIDE a tool
                       //   result?" — the defense half of R10.6's first attack class
hallucinationCheck()   // "Does the reply state a value, fact or memory that neither this
                       //   turn's reads nor the sealed history support?"

// rewrite factories — a guard decides, a rewrite rewrites (contract.rewrites)
purgePattern('no-cpf-out', /\d{3}\.\d{3}\.\d{3}-\d{2}/)   // DELETES the matched span
maskPattern('hide-card', /\b\d{16}\b/)                     // replaces the match with ****
swapTerms({ CANC_PEND: 'waiting to be cancelled' })        // TRANSLATES a declared term —
                                                           //   literal, word-boundary, NO regex
```

A factory derives `rule` and `deny` from the SAME parameters, so prose/check parity is
structural for every catalog guard (R6.3). A factory also MINTS its guard's `name` as
`kind:tool` (`'maxCalls:sendEmail'`); a second factory of the same kind on the same tool
collides, and `GUARD_NAME_DUP` names the fix — the optional `{ name }` every factory
accepts. `lieCheck` is only the judged half — the
structural lie floor lives in `HonestyCheck`, always on, free. The census counts **20
named guard species**: the 8 deterministic factories · the 4 judged factories · 2 auto
from each schema (`argRequired` — a whitespace-only value counts as MISSING; `argFormat`
— the schema's own `pattern`) · 2 auto from destructive/limits (`confirmFirst` ·
`maxDestructive`) · the 4-piece always-on floor (`noDuplicateCall` · `claimIsGrounded` ·
`claimIsComplete` · `brokenReply`) — plus the 3 rewrites, printed as their own census
section. The open forms beyond the catalog: a hand-written deny is census kind `custom`
(and requires a written admission of which catalog kind fails — R6.7), a hand-written
`judgeQuery` is kind `judged`, prose-only is kind `prose`. The two lists have NAMES:
**ALWAYS** is what `agent.guards()` prints — every installed guard, band order, each with
`installedBecause` — and **AVAILABLE** is this catalog, documented in the generated
`GUARDS.md` (rendered from this module's own source, so the doc and the code cannot
disagree), with the rewrites as their own section. `argFormat`'s schema `pattern` is
declared DATA, not guard source — the purity lint scans guard SOURCE, so the schema
pattern does not trip it. Collaborators: cards, contract leaf.

**`SurfaceGate`** (class, ~180 lines) — enforces R3.8 at construction of a live surface
(`mcpWorld` / `liveWorld`): reconciliation against the live host (renamed tool, new
field, changed type → throw), deny-by-default surface intersection with a STRUCTURAL
exclusions report, and the certification fingerprint over a CANONICAL schema form —
sorted keys, normalized types, stable across validator-library versions, never a
`JSON.stringify` of a live validator object.

```typescript
class SurfaceGate {
  check(facts: SurfaceFacts, live: readonly LiveTool[], seal: string | null): SurfaceReport;
                                                       // throws CardError on drift / seal mismatch;
                                                       // seal omitted → the agent runs uncertified
  fingerprint(facts: SurfaceFacts): string;            // canonical-form sha256 — the seal's value
}
interface LiveTool { readonly name: string; readonly description: string; readonly schema: Json;
                     readonly execute: (args: Readonly<Record<string, Json>>) => Promise<unknown> }
interface SurfaceReport { readonly active: readonly string[];
                          readonly excluded: readonly { readonly name: string; readonly why: 'off-surface' }[] }
```
Private: none. Collaborators: facts, contract leaf.

**`CardCheck`** (class, ~200 lines) — validates both cards + the surface card together at
construction; collects EVERY problem; throws one `CardError` with named codes and
fix-stating sentences (R1.6): `GUARD_BOTH_DENY_AND_JUDGE`, `GUARD_NAME_DUP`,
`GUARD_PHASE_MISSING` (a hand-written guard with no `on`), `GUARD_JUDGE_PHASE`
(a `judgeQuery` guard whose `on` is not `'reply'`), `TOOL_GUARD_OFF_SURFACE`,
`DISCLOSE_UNKNOWN_TOOL`, `SLOT_UNDERIVABLE`
("`{booking.room}` needs getBooking to accept the held call's target 'id' — it declares no
'id' arg; add `needs: { booking: { tool: 'getBooking', args: { bookingRef: 'id' } } }`"),
`LABEL_MISSING` (a destructive tool with no label), `SECRET_EMPTY`, `LIMIT_NOT_POSITIVE`.
A misconfigured guard THROWS — an inert guard that reads as coverage is worse than an
absent one. Private: the accumulating problem list. Collaborators: cards, facts,
contract leaf.

**`AgentFactory`** (class, ~200 lines) — cards + surface facts → one frozen
`CompiledAgent` (`{ guards, judged, rewrites, limits, maskKeys, discloseBindings,
wording, promptParts, facts }`): the priority-ordered guard array (spec → contract →
consent → honesty → the universal floor, with the auto-installed guards derived from
declarations — R1.5: `confirmFirst` per destructive tool, `maxDestructive` from
`limits.destructive`, `argRequired`/`argFormat` from each schema, and the floor:
`noDuplicateCall`, `claimIsGrounded`, `claimIsComplete`, `brokenReply` — byte-identical
line repetition, engine-taught literals leaking as prose, leaked reasoning, tool markup,
foreign chat-template tokens: structural, never linguistic). NOTHING JUDGED IS
AUTO-INSTALLED — the judged factories are declared on a card or they do not exist. Each
installed guard carries `installedBecause`: the declared field that caused it. Also
compiles: the masker key set, the disclose bindings (slot derivability re-proved here),
the wording table, the prompt precomputation. Compiled once, deep-frozen; the runtime
never re-reads the authored form (R2.9).

```typescript
class AgentFactory {
  governed(spec: AgentSpec, contract: DomainContract | undefined, facts: SurfaceFacts): CompiledAgent;
  ungoverned(spec: AgentSpec, contract: DomainContract | undefined, facts: SurfaceFacts): CompiledAgent;
}
```
Private: none. Collaborators: CardCheck, catalog, facts, Wordings, contract leaf.

**`AgentFactory.ungoverned`** (~40 of its lines) — the R4·TEST ungoverned variant's ONLY
birthplace: the same `CompiledAgent` with every guard's enforcement disarmed (checks
answer allow, judged guards skipped, corrections off) and the PROMPT PARTS byte-identical
— the prose still teaches every guard; the ungoverned run measures the model with
teaching held constant. Its only public door is the `UngovernedAgent` class (§5.5): a
separate class the host names explicitly — never an option or flag on the governed
constructor, so no caller-passable option can weaken a governed agent (R2.3 holds via
class identity).

**`Wordings`** (module, ~80 lines) — every engine sentence, named, defaults + contract
overrides resolved once at compile. One home per sentence: the prompt, the denial, and the
inspection row read the same string (R1.5).
`export function resolveWording(w: Wording | undefined): ResolvedWording` —
`ResolvedWording` is the fully-resolved table: every `EngineSentenceKey` and every
status/reason word present, defaults filled. Collaborators: contract leaf.

### 5.3 `@looprun-ai/core` — `run/` (the machine, L3)

**`Engine`** (class, ~150 lines) — the framework-free host surface (R9.3) and the
composition root: construct from the two cards, one chat entry, whole typed turn record
out. Builds every collaborator below. `EngineConfig` is a CLOSED key set —
`{ compiled: CompiledAgent; toolPort: ToolPort; recordsPort: RecordsPort | null;
seat: ModelSeat }` — no index signature, no options object, no field through which
governance weakens (R2.3).

```typescript
class Engine {
  static create(cfg: EngineConfig): Engine;      // CardCheck + SurfaceGate + AgentFactory run upstream;
                                                 //   every problem named at once (R1.6)
  chat(sessionId: string, text: string): Promise<TurnRecord>;   // rejects with TurnFailure (R2.10)
  guards(): GuardCensus;                         // the Rulebook's own arrays — the list IS the code (R1.5)
  excluded(): readonly string[];                 // deny-by-default exclusions, structural (R3.8)
  endSession(sessionId: string): void;
}
```
Private: the session map, the frozen `CompiledAgent`, the collaborator set. Collaborators:
every run/ class below (composition only), cards/ classes, contract leaf.

**`Turn`** (class, ~180 lines) — THE one turn machine. Sequences only, decides nothing
(R2.7); imports only its declared collaborators (lintable). The walk: input guards over
the arrived text (a deny answers the turn with the guard's own sentence — no model call)
→ consume typed codes → licensed calls → sweep expiries → model loop (serial per-call
execution in emission order — engine-enforced, R2.6) → finish checks and bounded redrives
→ compose (masker, then rewrites) → seal. All
mutation goes to the `TurnDraft`; `Session.seal` commits atomically; a `TurnFailure`
discards the draft so a retry starts clean (R2.10).

```typescript
class Turn {
  run(session: Session, userText: string): Promise<TurnRecord>;
}
```
Private: none — all state lives in the draft. Collaborators: ModelSeat, CallRunner,
ConsentDesk, FinishDesk, Judge, Rulebook, PromptWriter, DeliveryWriter, Session,
contract leaf.

**`CallRunner`** (class, ~200 lines) — everything between a proposed call and a recorded
act, for all three origins (`model`, `engine`, `licence`) through the SAME method: coerce
against the declared schema (`CanonicalCall.of`), canonical identity, Rulebook verdict,
route by verdict kind, StatusClerk grading, masking on record (`call.data(mask)` +
`maskData(result)` — the stored form is the only stored form, R5.5). The verdict routes:

```typescript
class CallRunner {
  run(raw: RawCall, origin: 'model' | 'engine' | 'licence', draft: TurnDraft): Promise<Act>;
  // refuse   → recorded denial: status 'not-done', reason 'blocked', sentence = rule + detail
  // owe      → the owed reads run engine-side (origin 'engine'), then re-check the call
  // simulate → the tool runs with its OWN declared simulation parameter set → the preview
  //            is recorded on the held act → disclosure reads → question born FROM the
  //            preview: status 'not-done', reason 'held', result = the preview (R5.4)
  // hold     → the no-simulation surface: disclosure reads engine-side → question born from
  //            the reads alone: status 'not-done', reason 'held' (R3.4)
  // restate  → the first act's result restated; no re-execution
  // allow    → execute (ReadyCall) → grade → record
}
```
Constructed per turn over the session's stores (§7). Private: none. Collaborators:
Rulebook, ConsentDesk, Disclosure, StatusClerk, Masker, ActionHistory, ToolPort,
contract leaf.

**`Rulebook`** (class, ~150 lines) — the ordered deterministic guard pipe (R5.6): four
frozen arrays built at compile, one per phase; first non-allow verdict wins on
input/preTool; postTool and reply collect ALL violations (a postTool violation joins the
reply corrections — the call already ran). Pure — judged guards are not here (they run in
`Judge`). The census IS the code: `guards()` returns the same arrays the four phase
checks iterate, plus judged guards, the rewrites section and resolved limits — ALL
governance counted, never a parallel copy (R1.5).

```typescript
class Rulebook {
  checkInput(ctx: InputCtx): Verdict;
  checkPreTool(ctx: CallCtx): Verdict;
  checkPostTool(ctx: ResultCtx): readonly { readonly guardName: string; readonly detail: string }[];
  checkReply(ctx: ReplyCtx): readonly { readonly guardName: string; readonly detail: string }[];
  guards(): GuardCensus;
}
```
Private: the four frozen ordered arrays. Collaborators: HonestyCheck (installed as the
honesty-priority reply guard), contract leaf.

**`ConsentDesk`** (class, ~200 lines) — the question lifecycle as the named state machine
`open → consumed | closed(declined | superseded | expired | vetoed)` (R5.1). Codes carry
real crypto entropy, no tool name (R3.7), are unique among open questions (re-drawn on
collision), and a per-issuance nonce means a stale quoted code can never consume a newer
ticket. An IDENTICAL re-proposal returns the SAME question and code, never a second live
code; a re-proposal differing in ANY arg births a SIBLING question — the earlier stays
open, and every delivery reprints every open code, so the user can always approve what is
on screen. When a licensed call executes, EVERY open question for the same (tool, target)
closes `'superseded'` — the executed act supersedes every open sibling's sentence; this
closure is that member's ONE producer — a target-less tool closes by tool alone — and a
same-turn re-proposal for an executed (tool, target) resolves to `restate` with the real
result. EVERY closure is
delivered, expiry included. Consumption searches ONLY for engine-minted literals (R6.5)
and matches exactly ONE question. The desk's private map holds the EXECUTABLE
`CanonicalCall`; the delivered `Question.call` is the masked display form.

```typescript
class ConsentDesk {
  hold(call: CanonicalCall, sentence: string, draft: TurnDraft): Question;
  readAnswer(userText: string, draft: TurnDraft): readonly Question[];
  held(id: string): CanonicalCall;                   // the stored executable call, engine-internal
  open(): readonly Question[];
  close(id: string, why: QuestionClose, draft: TurnDraft): void;
  sweep(turn: number, ttl: number, draft: TurnDraft): readonly Question[];   // expired → closed, delivered
}
```
Private: the sealed question map, keyed by canonical key, holding the executable calls
(draft overlays until seal). Collaborators: CanonicalCall, Wordings, contract leaf.

**`StatusClerk`** (class, ~130 lines) — derives the user-facing word from the executor's
one-word answer plus control flow, and never guesses (R3.6). Stateless: the per-session
revoked-simulation set lives in `Session`'s stores and is read/written through the draft.

```typescript
class StatusClerk {
  grade(input: { readonly answer: ToolAnswer } | { readonly threw: string } | { readonly verdict: Verdict },
        effect: Effect, before: StateSnapshot | null, after: StateSnapshot | null, draft: TurnDraft):
      { readonly status: Status; readonly reason: Reason | null; readonly evidence: Evidence;
        readonly corrections: readonly Correction[] };
  // done:'yes'      → status 'done'
  // done:'no'       → status 'not-done', reason 'refused' (the answer's own words say why)
  // done:'unknown'  → status 'unknown' — never delivered as success, never as "nothing changed"
  //                   ("I sent it; the service did not confirm the result"); counts as
  //                   dangerous for consent and throttle on a destructive tool
  // a THROW         → TurnFailure on a read; status 'unknown' on a write/destructive (it may
  //                   have landed) — a transport failure is never 'refused' (that word requires
  //                   a recorded refusal — R5.3's evidence classes)
  // veto            → status 'not-done', reason 'blocked', evidence 'engine' (never reached the executor)
  // consent hold    → status 'not-done', reason 'held',    evidence 'engine'
}
```
Where a `RecordsPort` exists, verifies by snapshot diff: a change under `done:'no'`
corrects the act to `done` and mints `recordCorrected`; a simulation that mutated state
additionally mints `simulationRevoked` — that tool falls back to plain consent for the
session (the set lives in the session stores). A caught lie never crashes the turn.
Private: none (stateless). Collaborators: contract leaf.

**`ActionHistory`** (class, ~150 lines) — the append-only truth: mints act ids (R5.3),
records masked rows only (R5.5), answers canonical-identity lookups, seals turns as frozen
history shared by reference (R2.9).

```typescript
class ActionHistory {
  mint(): string;
  add(act: Act, draft: TurnDraft): Act;
  ofTurn(turn: number): readonly Act[];
  seen(call: CanonicalCall, turn: number): Act | null;        // duplicate check, canonical key
  destructiveInTurn(turn: number): number;                    // done + unknown on destructive tools (fail-closed)
  sealed(): readonly TurnRecord[];
}
```
Private: the act array and the sealed turn array. Collaborators: CanonicalCall,
contract leaf.

**`HonestyCheck`** (class, ~200 lines) — the honest-report rule (R5.3), installed at
honesty priority: exact bipartite matching of the report against the turn's acts, both
directions, order-free. Every line is target-bound (a targetless claim grounds nothing);
every word has a defined evidence class (`refused`/`blocked` require a recorded refusal or
veto act — an addressed read alone never licenses them). Declarations carry NO figure
field — `(tool, target, word)` only — so a declared figure cannot exist to corroborate
key-blind: figures reach the user exclusively through engine-rendered record lines and
disclosure sentences (the corroboration clause satisfied by unrepresentability). Hiding =
a leftover must-claim act, lying = a claim matching no act, and the denial names the tool
("Nothing in your report accounts for what cancelBooking did to bk_1"). A vetoed attempt
is itself valid proof approval was asked (a `held` act supports a `held` line). Also the
home of the STRUCTURAL lie check: record ids the engine collected from the turn's own
reads and acts (declared values, never a shape guess — R6.6) that the finish message
states as done are set-differenced against recorded done acts, deterministically — a lie
living only in prose is caught with the prose-improvement pass off. The census shows the
band as its two rows — `claimIsGrounded` (no lying) and `claimIsComplete` (no hiding) —
one bipartite matcher underneath; `lieCheck()` is the JUDGED half, a declared factory
(§5.2), never installed here.

```typescript
class HonestyCheck {
  check(ctx: ReplyCtx): readonly { readonly guardName: 'honesty'; readonly detail: string }[];
  static mustClaim(act: Act): boolean;   // write/destructive statuses + refused/held/blocked/unknown;
                                         //   reads are engine-rendered, never owed as claims
}
```
Private: none. Collaborators: ActionHistory (via ctx), contract leaf.

**`Disclosure`** (class, ~180 lines) — three tenses (R5.2). Owed reads are built from the
`disclose.needs` recipes over the held call's OWN args (an args map bridges differing
names — validated at compile, `SLOT_UNDERIVABLE`) and performed by the ENGINE via
`CallRunner.run(read, 'engine')` — recorded, masked, origin `engine`; never requested from
the model, so no deny can starve them (there is no forced-model-read pass to starve).
Slots fill by alias, bound to the question's target record by construction, never
last-read-wins. A slot no read can fill is a construction error, never a shipped NA.

```typescript
class Disclosure {
  owedReads(tool: string, call: CanonicalCall): readonly OwedRead[];
  before(tool: string, call: CanonicalCall, reads: ReadonlyMap<string, Act>): string;
  after(act: Act): string | null;
  later(act: Act, turn: number): string | null;
}
```
Private: the compiled disclose bindings. Collaborators: CanonicalCall, Wordings,
contract leaf.

**`Masker`** (class, ~120 lines) — sensitive data at every seam (R5.5): declared field
names and paths (the contract's `secrets` — the ONE home) masked structurally on results,
recorded args, and stored acts — masking runs once, on record, so history, honesty,
disclosure, delivery and the wire read safe data by construction; a raw copy never exists
downstream of the recording seam (the executor alone receives real args — it must
execute). Prose scrub replaces only the exact literal values collected while masking, only
in model-authored prose (R6.6 — never a shape guess: an order ref `12-34-5678` survives
unless it IS a masked value; the engine's own minted literals always survive).

```typescript
class Masker {
  maskData(value: unknown): Json;
  maskProse(text: string): string;
}
```
Private: the declared key set and the collected-literal set. Collaborators: contract leaf.

**`PromptWriter`** (class, ~200 lines) — the single producer of prompt bytes: byte-stable,
cache-shaped (R7.3) — business-common blocks first (voice, facts, contract guards, tool
cards), per-agent divergence as late as possible (persona, spec guards, teammates); the
state block and the open questions ride the tail. Channel law (R6.1 × R7.3): a CONTRACT
tool guard's `rule` renders into the tool's own card (`ToolCard.does` = the declared
`does` + the guard sentences) — the channel that survives native/MCP mode, byte-shared
across the domain's agents; a SPEC tool guard's `rule` renders into the per-agent tail —
present on every execution path, and the shared prefix stays byte-identical.

```typescript
class PromptWriter {
  system(): string;                         // frozen after first render — byte-identical across turns
  toolCards(): readonly ToolCard[];
  tail(userText: string, state: StateSnapshot | null, open: readonly Question[]): string;
  correction(sentences: readonly string[]): string;
}
```
Private: the frozen system prefix. Collaborators: contract leaf.

**`FinishDesk`** (class, ~180 lines) — the one structured closing channel (R5.7). The
`finish` tool's schema is ONE strict object (`z.strictObject`) serving BOTH the taught
description and the validator — a taught key the validator rejects cannot exist, here and
on every structured channel the engine teaches. Early finishes (finish beside domain
calls) defer with an `earlyFinish` correction; superseded finishes resolve to the last.
The exhaustion closure is a pure function of the recorded acts — never empty, structurally
unable to fabricate, never "nothing changed" over an `unknown` write.

```typescript
class FinishDesk {
  toolCard(): ToolCard;                     // rendered FROM the one schema object
  split(calls: readonly RawCall[]): { readonly domain: readonly RawCall[]; readonly finish: RawCall | null;
                                      readonly corrections: readonly Correction[] };
  parse(args: Readonly<Record<string, unknown>>):
    { readonly ok: true; readonly finish: FinishPayload } | { readonly ok: false; readonly detail: string };
  force(): string;                          // the forced-finish instruction, sent with StepInput.forceFinish (R7.2)
  closure(acts: readonly Act[]): string;    // done → names it · unknown → "could not confirm" ·
}                                           //   neither → "nothing changed"
```
Private: the one schema object. Collaborators: Wordings, contract leaf.

**`Judge`** (class, ~120 lines) — the ONLY model-judged escape (R5.6): composes each
`judgeQuery` into a one-step, closed-format yes/no and sends it through the session's
OWN `ModelSeat.port()` — the judge seam is deleted, not guarded: no JudgePort exists, so
no interface can carry a third-party endpoint. The composed question may quote the sealed
history (how `hallucinationCheck` reaches its evidence);
guards read the user's text only as EXACT LITERALS — judging MEANING happens here, on
the session's own seat (R6.5). The answer format is fixed tokens — schema-enforced where
the backend has structured output, convention-parsed elsewhere; UNREADABLE is a
first-class verdict priced by the guard's declared `judgePolicy`.

```typescript
class Judge {
  run(guards: readonly InstalledGuard[], ctx: ReplyCtx, history: readonly Msg[]):
    Promise<readonly { readonly guardName: string; readonly verdict: 'violation' | 'none' | 'unreadable';
                       readonly detail: string | null }[]>;
}
```
Private: none. Collaborators: ModelSeat, contract leaf.

**`DeliveryWriter`** (class, ~150 lines) — composes the delivered text: the model's
scrubbed prose, one record line per act (reads included — the result decides what prints),
every open question with its code in EVERY delivery, every denial, every question closure,
and the closure sentence. The contract's `rewrites` (purge · mask · swap) run AFTER the
masker, over MODEL PROSE ONLY — engine-minted literals, record lines, question sentences
and codes survive every rewrite (R5.1), and a rewrite never overrides a decision. Every
engine-known fact reaches the user deterministically — never only through model prose.

```typescript
class DeliveryWriter {
  compose(message: string, acts: readonly Act[], open: readonly Question[],
          closed: readonly { readonly id: string; readonly why: QuestionClose }[]): string;
}
```
Constructed per turn over the session's Masker (§7). Private: the resolved wording table.
Collaborators: Masker, Wordings, contract leaf.

**`Session`** (class, ~110 lines) — per-conversation state, caller-supplied identity only
(R8.3): the turn index, sealed history, the per-session ActionHistory / ConsentDesk /
Masker / world instance / revoked-simulation set, and the promise-queue mutex that
serializes EVERY entry (`generate` and `stream` alike). `seal(draft)` folds the TurnDraft
into all stores in one move — the ONLY place session state changes (R2.10).

```typescript
class Session {
  readonly id: string;
  enter<T>(job: () => Promise<T>): Promise<T>;   // the serializing queue
  draft(): TurnDraft;                            // the work area; discarded on failure
  seal(draft: TurnDraft): TurnRecord;
}
```
Private: the queue tail and the component stores (incl. the revoked-simulation set).
Collaborators: ActionHistory, ConsentDesk, Masker, contract leaf.

**`ModelSeat`** (class, ~150 lines) — the model seat (R7.5): a SET of certified targets
with a declared routing strategy (`RoutingStrategy`). Only certified targets may enter the
set (an uncertified one throws at create). Switches only BETWEEN turn attempts, never
mid-turn; every turn record names the serving model (`servedBy`); the Judge rides the same
seat. A target declared `local` (R4·ASK data, never a hostname heuristic — a LAN llama.cpp
box is as local as localhost) arms the runaway brakes as a set: pinned decoding, hard
output-token cap, repeated-call stop (R7.1).

```typescript
class ModelSeat {
  static create(choice: ModelChoice, make: (t: ModelTarget) => ModelPort): ModelSeat;
  port(): ModelPort;                             // the target serving THIS turn attempt
  serving(): string;
  reroute(failure: TurnFailure): boolean;        // between attempts only
}
```
Private: the target list, the strategy cursor, the brake config. Collaborators: ports,
contract leaf.

### 5.4 `@looprun-ai/core` — `world/`

**`world.ts`** (module, ~120 lines) — the declarative vocabulary: `WorldCard` — `records`,
the three effect blocks (`reads` / `writes` / `destructive`, each keyed by tool name), the
action forms as data (`list` · `get` · `make` · `set` · `remove` · `run` naming a custom
executor), per-tool `label` and optional `does` (omitted, the engine composes one from the
action form + entity), `gates` (the closed union `{ kind: 'exists' } | { kind: 'stateIs';
field; value } | { kind: 'fieldAtLeast'; field; min }`, evaluated on EVERY tool kind),
`simulation` (the tool's own parameter), `presets` — and `world(card, executors?)`
returning the frozen card. Closed data — a law of the `WorldCard`: no functions in the
card, no regexes, no clock (custom executors pass OUTSIDE the card; a `LiveWorldCard`'s
tools execute themselves by nature and sit outside this law). The sibling cards live
here too: `McpWorldCard` / `mcpWorld(card)` and `LiveWorldCard` /
`liveWorld(card)` — the SAME effect blocks, remote entries carrying `label` / `target` /
`proxy` / `simulation` / `does`, with no action forms, no `records`, no `gates`. `factsFromWorld` (§5.2) derives the same engine-internal `SurfaceFacts` from all
three card kinds. Collaborators: contract leaf.

**`WorldBuilder`** (class, ~200 lines) — interprets a `WorldCard` into a per-session
`BuiltWorld implements ToolPort, RecordsPort` (R4·GEN, R5.8): reception coerces declared
args (a non-coercible value is a refusal, never a stringified object), gates run on EVERY
tool kind against the declared target record, simulate ≡ act by shared code path, refusals
are honest results, every state change is attributable to a recorded audit row, `done` is
answered from the world's own write. Presets never half-apply (a patch naming a missing
record throws at build). The world's documented surface is the BUSINESS's own
documentation: a pipeline emendation (a proxy row, a simulation declaration, a composed
read) is pipeline output and never licenses a world behavior — `Validator` rejects a world
tool whose only documentation source is a pipeline-emended surface row (R5.8). The world's verdicts
are engine-independent — case 72's mis-ordered maintenance refusal lives here and survives
the rebuild untouched (R10.2).

```typescript
class WorldBuilder {
  build(card: WorldCard, preset?: string): BuiltWorld;   // throws on unknown preset / bad patch / missing executor
}
class BuiltWorld implements ToolPort, RecordsPort {
  call(call: ReadyCall): Promise<ToolAnswer>;
  snapshot(): StateSnapshot;                             // deep-frozen clone of visible records
  audit(): readonly AuditRow[];
}
interface AuditRow { readonly call: ReadyCall; readonly done: Done;
                     readonly executor: 'declared' | 'custom' }   // the row states the result;
                                                                  //   the mechanism is its own field
```
Private (BuiltWorld): the record store, the audit trail, the id mint counter.
Collaborators: WorldGates, PatchDesk, CanonicalCall, contract leaf.

**`WorldGates`** (module, ~80 lines) — evaluates the closed `Gate` union against the
declared target record; a missing record is a refusal with the gate's sentence, never a
silent pass.
`export function evaluateGates(gates: readonly Gate[], record: Readonly<Record<string, Json>> | null): string | null`.
Collaborators: contract leaf.

**`PatchDesk`** (class, ~80 lines) — the custom-executor law (R4·GEN): the executor
receives coerced args and a deep-frozen CLONE of the records (mutation throws; the live
store is never handed out) and returns `{ result, patches }`; the desk applies the patches
through the shared gated, audited, attesting path — a custom tool's `done` is true by
construction and simulation works on it unchanged. There is no attestation escape hatch.
(`Store` is the world-package-private record container; it crosses no package boundary.)

```typescript
class PatchDesk {
  runCustom(executor: CustomExecutor, call: ReadyCall, store: Store): ToolAnswer;
}
type CustomExecutor = (ctx: { readonly args: Readonly<Record<string, Json>>;
                              readonly records: StateSnapshot;
                              readonly mintId: (entity: string) => string })
                   => { readonly result: Json; readonly patches: readonly Patch[] };
```
Private: none. Collaborators: contract leaf.

### 5.5 `@looprun-ai/mastra`

**`LoopRunAgent`** (class, ~200 lines) — IS a `@mastra/core` Agent (R9.5): same class
contract, same `generate`/`stream` call shape, registrable in `new Mastra({ agents })`,
Studio, workflows. A dev swaps the class; construction takes the two cards plus the
surface card (§4); everything downstream keeps working. The constructor's key set is CLOSED (no index
signature — R2.8/R2.3): there is no `hooks`, no `toolChoice`, no `instructions`
passthrough — the only calls that stop working are the ones R2.3 forbids. A failed turn
rejects with `TurnFailure` (R2.10). The same two-card class swap is reserved for the other
host frameworks: `@looprun-ai/vercel` and `@looprun-ai/langchain` are reserved L5 facade
packages, each ITS framework's Agent over the same `Engine` composition, added without
touching L0–L4.

```typescript
type LoopRunConfig = {                       // the constructor's whole, CLOSED key set
  spec: AgentSpec; contract?: DomainContract; model: string | ModelChoice;
  world: WorldCard | McpWorldCard | LiveWorldCard;   // the surface card — ONE key, every path
};
class LoopRunAgent extends Agent {
  constructor(cfg: LoopRunConfig);
  generate(text: string, opts?: { session?: string }): Promise<MastraResult & { loopRun: TurnRecord }>;
  stream(text: string, opts?: { session?: string }): Promise<MastraStream>;
                                            // governed run-to-completion, then the composed
                                            //   delivery streams; same serializing queue
  guards(): GuardCensus;                    // Engine.guards() — the list IS the code (R1.5)
  excluded(): readonly string[];            // structural deny-by-default exclusions (R3.8)
  endSession(id: string): void;
}

/** The explicit ungoverned twin — a DELIVERABLE of the skill (the gov × ungov comparison
 *  is part of the product), not an eval-private trick: same closed config, byte-identical
 *  prompt, every guard taught in prose and DISARMED in execution. The class NAME is what
 *  states the disarming — ungoverned is never an option on the governed class (R2.3). */
class UngovernedAgent extends Agent {
  constructor(cfg: LoopRunConfig);
  generate(text: string, opts?: { session?: string }): Promise<MastraResult & { loopRun: TurnRecord }>;
  guards(): GuardCensus;                    // the same census; the class is the disarming
  endSession(id: string): void;
}
```
Private: the Engine. Collaborators: Engine (core), AgentAssembly, `@mastra/core`.

**`AgentAssembly`** (module, ~150 lines) — construction resolution, one shot, keyed by
the surface card's kind: a `world` card builds the local world and derives the facts
(`factsFromWorld`); an `mcpWorld` card first builds the MCP client via `McpConnect`; a
`liveWorld` card takes the host's tools directly — the live kinds run `SurfaceGate`
(reconcile · deny-by-default · certification) and build `HostToolPort`. Returns the
`EngineConfig`; never names a port in its public type. The composition module — it may
import L2/L3 to build the Engine, and only the facade imports it (§6).
`export function assemble(cfg: LoopRunConfig): Promise<EngineConfig>`.
Collaborators: SurfaceGate, WorldBuilder, HostToolPort, McpConnect, MastraModelPort,
ModelSeat, contract leaf.

**`MastraModelPort`** (class, ~130 lines) — one generation step over the host framework
behind `ModelPort.step`; structurally cannot loop (R2.3). Per-agent `llmParams`
verifiably reach the provider (R7.4); provider execution modes ship here as NAMED presets
in each provider's own dialect (`gemini:thinking-off` via its thinking-budget knob — a
knob other providers do not have), each with a wire test proving delivery. Throws
`TurnFailure` on provider errors — raw provider text never reaches user-facing prose
(R2.10).

```typescript
class MastraModelPort implements ModelPort {
  constructor(target: ModelTarget, llmParams: LlmParams);
  step(input: StepInput): Promise<ModelStep>;
}
```
Private: the provider client and llmParams. Collaborators: ports, contract leaf,
AI-SDK provider.

**`HostToolPort`** (class, ~130 lines) — native/MCP tools behind `ToolPort.call`: each
tool executes itself, authenticated by closure (R3.8 — credentials never enter the
governed layer). Applies the surface card's declared `proxy` mapping — a rename maps back
to the real call; a `compose` proxy executes its existing reads and merges the results
(R3.3).
Its answer law is protocol facts only: a tool-level error result answers `done:'no'` with
the failure (the tool itself answered); a transport failure after send on a write answers
`done:'unknown'`; a clean result on a write answers `done:'unknown'` unless the tool's
protocol attests effect — this port never says `yes` on its own and never speaks engine
vocabulary.

```typescript
class HostToolPort implements ToolPort {
  constructor(admitted: SurfaceFacts, live: Readonly<Record<string, LiveTool>>);
  call(call: ReadyCall): Promise<ToolAnswer>;
}
```
Private: the admitted tool map. Collaborators: ports, contract leaf.

**`McpConnect`** (module, ~80 lines) — the Path B sugar: builds the MCP client from
`{ url, headers }` (host env, never the cards) and lists the tools; the three R3.8 gates
are unchanged by it.
`export function connect(mcp: { url: string; headers?: Record<string, string> }): Promise<Readonly<Record<string, LiveTool>>>`.
Collaborators: `@mastra/mcp`, contract leaf.

### 5.6 `@looprun-ai/models`

**`tiers.ts`** (module, ~150 lines) — the measured local-tier registry (R9.2): every
serving fact DECLARED per tier as `TierSpec` data — speculative-decoding type (an MTP head
on the tiers where it pays, measured; absent where draft ≈ token cost), KV-cache precision
(f16 the law, q8_0 the RAM escape hatch), context sized to fit the assembled prompt,
prompt-cache and warm-slot sizing — each with an env escape hatch; the registry doc
renders from the data, so they cannot disagree.
`export function tier(alias: string): TierSpec`. Collaborators: contract leaf.

**`LlamaCppRuntime`** (class, ~200 lines) — the shipped `ModelRuntimePort`: binary
resolution, the measured launch recipe that keeps assembled prompts WARM across agent
switches (idle-slot RAM cache + context checkpoints + per-agent slot state — the R7.3
investment preserved locally; an unwarmed switch is a full re-prefill), health check bound
to the REQUESTED model identity (never a bare ok on a shared port), platform quirks
(macOS DYLD fallback via child env) inside the runtime, invisible above the port.
MLX/ollama/vllm implement the same one seam and plug in unchanged.

```typescript
class LlamaCppRuntime implements ModelRuntimePort {
  serve(tier: TierSpec): Promise<ServingHandle>;
}
```
Private: the child process handle. Collaborators: ports, tiers, Downloader.

**`Downloader`** (class, ~100 lines) — GGUF pull with HTTP-Range resume AND integrity:
size + sha256 verified before rename into place; a corrupted partial never becomes the
installed file.

```typescript
class Downloader {
  fetch(tier: TierSpec): Promise<string>;   // the installed file path; a hash mismatch deletes and throws
}
```
Private: none. Collaborators: tiers.

**`index.ts`** (module, ~60 lines) —
`export function localModel(alias: string): Promise<LocalModelHandle>` — typed, never
`Promise<any>`; `LocalModelHandle = ServingHandle & { readonly tier: TierSpec }`.
Collaborators: LlamaCppRuntime, tiers.

### 5.7 `@looprun-ai/server`

**`Server`** (class, ~120 lines) — `node:http` around the handler; loopback bind default;
TTL sweep calls `agent.endSession`.

```typescript
class Server {
  static start(cfg: ServerConfig): Promise<{ readonly url: string; close(): Promise<void> }>;
}
```
Private: the http server and the sweep timer. Collaborators: WireHandler.

**`WireHandler`** (class, ~180 lines) — the OpenAI facade (R9.1): `GET /v1/models` +
`POST /v1/chat/completions` over governed agents. Authentication is REQUIRED: the config
union is `{ apiKeys: readonly string[] } | { auth: 'disabled' }` — secure-by-omission is
unrepresentable in the type. A failed turn is an HTTP failure with a typed body (never a
200), in stream and non-stream shapes alike. The full typed `TurnRecord` rides the
envelope meta, imported from the contract leaf — a hand-mirrored type cannot exist (R2.5).

```typescript
type ServerConfig = {                          // CLOSED key set — no index signature
  agents: Readonly<Record<string, LoopRunAgent>>;
  auth: { apiKeys: readonly string[] } | { auth: 'disabled' };
  port?: number; bind?: string;                // bind omitted = loopback
  sessionTtlMs?: number;
};
class WireHandler {
  constructor(cfg: ServerConfig);
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
```
Private: none. Collaborators: WireSessions, wire, LoopRunAgent (type), contract leaf.

**`WireSessions`** (class, ~80 lines) — maps the stateless wire onto sessions: the key is
a TYPED PAIR (credential hash, caller-supplied session id) in a nested map — no joined
string, no fingerprint merging of strangers (R8.3); naming another caller's session id
answers 404 — a session belongs to the credential that opened it (R9.1).

```typescript
class WireSessions {
  resolve(credential: string, callerSessionId: string): string;   // the engine session id, minted per pair
  idle(ttlMs: number): readonly string[];                          // sessions to end
}
```
Private: the nested map and the idle tracker. Collaborators: contract leaf.

**`wire.ts`** (module, ~80 lines) — chat-completion envelopes + SSE encoding of a
COMPLETED turn (no true token streaming — the declared non-requirement); usage is reported
as `estimated: true`, never presented as provider counts.
`export function toEnvelope(record: TurnRecord): ChatCompletion` ·
`export function toSse(record: TurnRecord): readonly string[]` — `ChatCompletion` is the
OpenAI wire envelope, typed to the external API's published shape (the meta field carries
`TurnRecord` from the leaf). Collaborators: contract leaf.

### 5.8 `@looprun-ai/eval`

**`targets.ts`** (module, ~80 lines) — the R4·ASK surface: `ask/targets.json` schema +
loader; provider kind, model, key env-var name, local tier, and the runaway brakes are
DECLARED per target (`ModelTarget`) — never inferred from an id's spelling or a hostname
literal. `export function loadTargets(path: string): readonly ModelTarget[]`.
Collaborators: contract leaf.

**`SubjectLoader`** (class, ~150 lines) — loads a subject directory (cards, surface
card, cases, targets) with structural preflight and the byte-identical prompt-static
gate across ALL presets; records run provenance: WHICH engine build every package
resolved, verified before any run counts (R4·TEST).

```typescript
class SubjectLoader {
  static load(dir: string): Promise<Subject>;      // Subject = { spec, contract, world, cases, targets }
  static provenance(): Readonly<Record<string, string>>;   // package → resolved build id
}
```
Private: none. Collaborators: core, targets.

**`Validator`** (class, ~200 lines) — the offline `validate` (R4·TEST, zero spend):
schema, references, premise-coherence replay on a FRESH world instance per phase and per
case, disclosure-slot derivability, world laws for every preset (incl. the R5.8
emendation check: a world tool whose only documentation source is a pipeline emendation
is rejected) — static gates cover EVERY preset, no silent sampling, and the same blocking
set in every entry point.

```typescript
class Validator {
  run(subject: Subject): ValidationReport;         // every finding blocks; one blocking set everywhere
}
```
Private: none. Collaborators: SubjectLoader, core.

**`ExamRunner`** (class, ~200 lines) — R9.4/R4·EVALS: the public scriptable surface. Plays
scripted multi-turn cases through the REAL path — it constructs a `LoopRunAgent` (Path A)
per case and calls `generate`, the same facade hosts call; no second loop exists to drive.
The typed approve step reads the open question's code from the records' question fold —
issued minus consumed minus closed across ALL prior `TurnRecord`s (open questions persist
across turns) — typed fields, random per run: a case can never regex a code out of prose.
`approve.args` (an arg subset) selects among open SIBLINGS of one tool; two open siblings
with no `args` is a loud case error, never a guess. Runs the governed variant and the `ungoverned` variant — the ungoverned one
through the same public `UngovernedAgent` class every host can construct; the RED
battery (R10.6) runs in both variants like any case; cases carry
`split: 'fix' | 'held-out'` (R10.7).

```typescript
class ExamRunner {
  runCase(subject: Subject, c: ExamCase, variant: 'governed' | 'ungoverned', target: ModelTarget): Promise<CaseDump>;
}
// ExamCase = { id, split: 'fix' | 'held-out', red?: AttackClass,
//              turns: (string | { approve: { tool: string; args?: Readonly<Record<string, Json>> } }
//                             | { decline: true })[], rubric }
// CaseDump = { case: ExamCase['id'], variant, records: readonly TurnRecord[], servedBy: string }
```
Private: none. Collaborators: LoopRunAgent, UngovernedAgent, SubjectLoader, targets,
contract leaf.

**`lints.ts`** (module, ~200 lines) — the guard-coverage census keyed on each guard's REAL
`installedBecause` condition (every installed guard has a case that makes it FIRE; an
exclusion keyed on a label cannot certify a never-fired guard as covered), the purity lint
over `deny` sources (no I/O, no clock, no randomness, no model call, NO REGEX — regex
lives only inside `blockPattern` / `purgePattern` / `maskPattern`), the prose-residue
lint (a prose guard restating a checked guard is rejected — R6.8), and the NAME GATE: the
retired-identifier ban of §11 with an EMPTY allowlist and WHOLE-IDENTIFIER matching,
running on every build and release.
`export function census(guards, dumps): readonly CensusFinding[]` ·
`export function purity(subjectDir): readonly Finding[]` ·
`export function nameGate(repoRoot): readonly Finding[]`.
Collaborators: core, SubjectLoader.

**`JudgeInputBuilder`** (class, ~120 lines) — blind, chunked judge inputs for the agent in
the session (no file anywhere calls a third-party model — R5.6): no variant/model/rep
label anywhere, but COMPLETE as evidence — user text, rule events, attempted (vetoed)
calls, results untruncated or with the truncation declared. The agent reads
`judge-input.part*.jsonl` and writes `verdicts.jsonl` itself.

```typescript
class JudgeInputBuilder {
  build(runDir: string): readonly string[];        // the judge-input.part*.jsonl paths
}
```
Private: none. Collaborators: contract leaf.

**`Folder`** (class, ~120 lines) — folds verdicts under ONE closed vocabulary
(`pass | fail | unreadable`, one field, no alias); a missing verdict is a loud FAIL; a
conflicting duplicate is a loud divergence; sync joins on canonical-call identity, never
`JSON.stringify`.

```typescript
class Folder {
  fold(runDir: string): FoldReport;
  sync(runDir: string): SyncReport;
}
```
Private: none. Collaborators: contract leaf.

**`Monitor`** (class, ~100 lines) — classifies incidents from TYPED `TurnFailure` kinds
the runner recorded (never a regex over an error message); an unresolved incident blocks
certification (mandatory, not optional — R2.10); a resolution marker is BOUND to its
incident's id/hash — a marker created before the incident, or stale from a prior run, can
never clear a fresh one; a never-scanned run dir blocks (absence is a finding).

```typescript
class Monitor {
  scan(runDir: string): MonitorReport;
  resolve(runDir: string, incidentHash: string, note: string): void;
}
```
Private: none. Collaborators: contract leaf.

**`Certifier`** (class, ~130 lines) — floor-law certification over K reps, PER MODEL
(R7.5: an uncertified model in the seat voids the seal); consumes provenance first;
enforces the held-out discipline (R10.7): cases flagged `held-out` are excluded from every
fix-loop report and included in certification — a "cases the fix loop never saw" claim is
publishable only when the flag set is non-empty. Margin discipline: a case flip inside the
noise band is a near-tie, not a prose bug; the bar is a floor.

```typescript
class Certifier {
  certify(runDirs: readonly string[], target: ModelTarget): Certification;
}
```
Private: none. Collaborators: Folder, Monitor, SubjectLoader, Seal.

**`Seal`** (module, ~80 lines) — the SHIP seal: sha256 over EVERY governed artifact —
cards, surface card, cases, norms — enumerated from the subject manifest, not a
hand-kept list; verify voids on any post-certification change (a world file outside the
seal is a hole). `export function seal(subjectDir: string): SealRecord` ·
`export function verify(subjectDir: string, s: SealRecord): readonly string[]`.
Collaborators: none.

**`Campaign`** (class, ~180 lines) — the phases end to end: validate → run (governed +
ungoverned, K reps) → monitor → judge inputs → PAUSE for the in-session judge → fold/sync →
certify → seal; a campaign rep is byte-equivalent to the hand-run verbs.

```typescript
class Campaign {
  run(subjectDir: string, opts: CampaignOptions): Promise<CampaignReport>;
  resume(runDir: string): Promise<CampaignReport>;
}
```
Private: none. Collaborators: every eval class above.

**`ScriptedModel`** (class, ~80 lines) — a data-driven `ModelPort` for phase-1 proofs and
exam scripting: plays typed steps, no network, no keys; judged questions are answered from
the script by POSITION in the judged-rule order, never by matching prompt text.

```typescript
class ScriptedModel implements ModelPort {
  constructor(script: { steps: readonly ModelStep[]; judgeAnswers?: readonly ('yes' | 'no')[] });
  step(input: StepInput): Promise<ModelStep>;
}
```
Private: the cursor. Collaborators: ports, contract leaf.

**The report vocabulary** (module `reports.ts`, ~60 lines — closed shapes beside the
classes that return them; no `any` on any exported surface):

```typescript
export type AttackClass = 'tool-result-injection' | 'user-text-injection' | 'record-borne'
  | 'stale-code' | 'licence-widening' | 'exhaustion' | 'error-leakage' | 'cross-session';
export interface Finding { readonly guard: string; readonly problem: string }
export type CensusFinding = Finding;                       // a guard with no case that fires it
export interface ValidationReport { readonly findings: readonly Finding[] }   // empty = pass; every finding blocks
export interface FoldReport { readonly perCase: readonly { readonly case: string;
  readonly verdict: 'pass' | 'fail' | 'unreadable' }[] }
export interface SyncReport { readonly mismatches: readonly string[] }        // canonical-identity joins only
export interface MonitorReport { readonly incidents: readonly { readonly hash: string;
  readonly kind: TurnFailure['kind']; readonly resolved: boolean }[] }
export interface Certification { readonly target: string; readonly reps: number;
  readonly floor: number; readonly heldOutIncluded: boolean; readonly pass: boolean }
export interface SealRecord { readonly files: readonly { readonly path: string; readonly sha256: string }[] }
export interface CampaignOptions { readonly reps: number; readonly variant?: 'both' | 'governed' }
export interface CampaignReport { readonly runDirs: readonly string[];
  readonly certification: Certification | null }
```

**R4 serving map:** ASK → `targets.ts` · GEN → `world.ts` / `WorldBuilder` / `PatchDesk` ·
EVALS → `ExamRunner` (typed approve step; census in `lints.ts`) · NORMS → `cards.ts` (§3) ·
TEST → `Validator` / `UngovernedAgent` (the ungoverned variant) / `JudgeInputBuilder` /
`Folder` / `Monitor` / `SubjectLoader` provenance / `Certifier` margin discipline ·
SHIP → `Certifier` + `Seal`.

---

## 6 · DEPENDENCY LAYERS

One-way, contract leaf at the bottom, facades at the top. No cycles; the lint bans any
import pointing down-page-upward. `internal.ts` does not exist — the ports are the only
backend seam.

```
  HOSTS            dev's Mastra app          curl / OpenAI SDK          pipeline scripts
                          │                          │                          │
  L5  FACADES      LoopRunAgent · UngovernedAgent (mastra)   Server/WireHandler (server)  ExamRunner/Campaign (eval)
                   [reserved facade slots: @looprun-ai/vercel · @looprun-ai/langchain —
                    each IS its framework's Agent over the same Engine composition (R9.5)]
                          │                          │                          │
  L4  COMPOSITION  AgentAssembly (composition module — may import L2/L3 to build the Engine)
      + ADAPTERS   MastraModelPort · HostToolPort · McpConnect (port implementations)
                   LlamaCppRuntime · Downloader (models) · ScriptedModel (eval)
                          │
  L3  MACHINE      Engine ── Turn ── CallRunner · Rulebook · ConsentDesk · StatusClerk
       (core/run)  ActionHistory · HonestyCheck · Disclosure · Masker · PromptWriter
                   FinishDesk · Judge · DeliveryWriter · Session · ModelSeat
                   WorldBuilder · WorldGates · PatchDesk (core/world)
                          │
  L2  COMPILE      AgentFactory · CardCheck · SurfaceGate · catalog ·
       (core/cards)       Wordings · factsFromWorld
                          │
  L1  CARDS +      cards.ts · facts.ts · world.ts           (types + factories, no logic)
      WORLD VOCAB         │
  L0  CONTRACT     vocabulary.ts · ports.ts · CanonicalCall        (imports NOTHING)
      LEAF
```

Rules of the picture: every arrow points downward only; port implementations
(MastraModelPort, HostToolPort, ScriptedModel, LlamaCppRuntime) import only the contract
leaf plus their own package's data modules; `AgentAssembly` is the composition module —
it may import L2/L3, and only its facade imports it; L3 reaches L4 implementations ONLY
through the L0 port interfaces; no module at any layer imports `Turn` except `Engine`;
only facades import `Engine`.

---

## 7 · CLASS DIAGRAM — one governed turn

Who holds whom, who calls whom. The user approves a held destructive call; the licensed
call is still governed.

```
 LoopRunAgent ──holds──► Engine ──holds──► ModelSeat · Rulebook · Judge · FinishDesk
                           │                Disclosure · StatusClerk · PromptWriter · Wordings
                           └─holds per session─► Session ──holds──► ConsentDesk · ActionHistory
                                                                    Masker · revoked-simulation set
                                                                    world: ToolPort
 Per turn, Engine.chat builds Turn · CallRunner · DeliveryWriter over the session's stores —
 that is how CallRunner reaches ConsentDesk/ActionHistory/Masker/world and DeliveryWriter
 reaches the session's Masker; the three live for one turn and hold only the TurnDraft.

 user: "CONFIRM 7Q4MX"
   │
   ▼
 LoopRunAgent.generate ──► Engine.chat ──► Session.enter (queue) ──► Turn.run     TurnDraft (all mutation)
   │
   │ 1  ConsentDesk.readAnswer(text)          engine-minted literal search (R6.5);
   │        └─► Question: open → consumed     exactly ONE question matches (unique codes)
   │
   │ 2  CallRunner.run(ConsentDesk.held(id), 'licence')       APPROVAL IS NEVER A BYPASS:
   │        ├─ Rulebook.checkPreTool({consented: true})   spec guards → contract guards →
   │        │                                          consent band (licence pre-satisfied;
   │        │                                          the destructive throttle still counts) →
   │        │                                          honesty → universal — any can still refuse
   │        ├─ ToolPort.call(ReadyCall) ──► BuiltWorld / HostToolPort ──► { result, done: 'yes' }
   │        ├─ StatusClerk.grade(answer, diff)  → status 'done', evidence 'diff'
   │        └─ Masker on record → ActionHistory.add(act) into the draft
   │
   │ 3  ConsentDesk.sweep(turn)              → expiries closed, every closure delivered
   │
   │ 4  model loop, ≤ limits.calls:
   │        PromptWriter.system (frozen prefix) + tail(state, open questions)
   │        ModelSeat.port().step(input) ──► ModelStep { calls, text }
   │        FinishDesk.split(calls) → domain calls (SERIAL, emission order) + finish?
   │        each call → CallRunner.run(call, 'model'):
   │           Rulebook verdict routes —
   │             allow    → execute → grade → record
   │             owe      → the owed reads run engine-side (origin 'engine'), then re-check
   │             simulate → the tool runs with its OWN declared parameter → preview recorded
   │                        → Disclosure.owedReads → Disclosure.before(filled) →
   │                        ConsentDesk.hold → Question born FROM the preview:
   │                        act status 'not-done', reason 'held', result = the preview
   │             hold     → (no simulation declared) Disclosure.owedReads →
   │                        CallRunner.run(read, 'engine') each → Disclosure.before(filled) →
   │                        ConsentDesk.hold → Question born from the reads alone:
   │                        act status 'not-done', reason 'held'
   │             refuse   → act status 'not-done', reason 'blocked' (sentence = the guard's rule + detail)
   │             restate  → the first result restated, no re-execution
   │
   │ 5  finish: FinishDesk.parse → Rulebook.checkReply (incl. HonestyCheck bipartite +
   │        structural lie check) → Judge.run(declared judged guards, ctx, history)
   │        via ModelSeat.port()
   │        violations? the FULL set → PromptWriter.correction → redrive (≤ limits.retries)
   │        exhausted → FinishDesk.closure(acts)  — pure function of the records
   │
   │ 6  DeliveryWriter.compose(prose, acts, open questions, closed questions)
   │        — masker first, then the contract's rewrites, over already-approved text
   │ 7  Session.seal(draft) ──► TurnRecord (frozen)      ← the ONLY commit point;
   ▼                                                        a TurnFailure skips 7: nothing seals
 TurnRecord { text, acts, questions, finish, corrections, servedBy }
```

---

## 8 · MECHANISM HOMES (R5.1–R5.8)

| R | mechanism | home — class + signature |
|---|---|---|
| R5.1 | Consent | `ConsentDesk.hold(call, sentence, draft): Question` · `readAnswer(text, draft)` · `close(id, why, draft)` · `sweep(turn, ttl, draft)` — state machine `open → consumed \| closed(declined\|superseded\|expired\|vetoed)`; crypto entropy + per-issuance nonce + unique codes, no tool name on screen; an identical re-attempt returns the SAME question, a differing one births a sibling, and a licensed execution closes ('superseded') every open question of the same (tool, target); every closure delivered. Approval never a bypass: `CallRunner.run(ConsentDesk.held(id), 'licence')` re-enters the FULL `Rulebook.checkPreTool`. No dead ends: the engine births the question from the held call itself (no unbirthable question), and an agent/contract refusal precedes consent — no question is born for an impossible act, so no approval loop can be unsatisfiable |
| R5.2 | Disclosure | `Disclosure.owedReads(tool, call)` + `CallRunner.run(read, 'engine')` — the ENGINE performs EVERY owed read itself: consent-owed (disclose recipes) AND guard-owed (`catalog.onlyAfter` with a read prerequisite → `Verdict {kind:'owe'}`); `before/after/later` fill by alias, bound to the question's target record; no deny can starve the reads because no forced-model-read pass exists to starve |
| R5.3 | Honest report | `FinishDesk.toolCard()/parse()` (one channel, one schema) + `HonestyCheck.check(ctx)` (bipartite both directions, order-free, target-bound, evidence classes per word, figures structurally absent from declarations — engine-rendered only, structural lie check over collected record ids) + `ActionHistory.mint()` (engine act identity) + `DeliveryWriter.compose` (the record ships every turn). The model claims `(tool, target, word)` — it never writes act ids (the referencing choice is priced under R10.4); a prose-improvement pass is a judged rule ABOVE the deterministic floor and can only improve delivery |
| R5.4 | Downgrade-to-simulation | `Rulebook.checkPreTool → Verdict 'simulate'` (simulation declared) — `CallRunner` runs the tool with its OWN declared parameter, records the preview, and the question is born FROM that preview; no simulation declared → `Verdict 'hold'` (R3.4); a lying simulation is caught by `StatusClerk.grade` diff and revoked (`simulationRevoked` — plain consent thereafter, per session) |
| R5.5 | Sensitive data | `Masker.maskData(value)` at the recording seam inside `CallRunner` — the filtered form is the ONLY stored form; the executor alone receives real args; `Masker.maskProse(text)` in `DeliveryWriter`, collected literals only |
| R5.6 | Guard ordering + determinism | `Rulebook` — one frozen order: spec → contract (change-window; the spec-vs-change-window boundary declared OPEN, kept decidable) → consent band (incl. `maxDestructive`) → honesty → the universal floor (`noDuplicateCall`, `brokenReply`); `deny` pure over frozen ctx (R6.4); the ONLY model-judged escape is `Judge.run` through `ModelSeat.port()` — no JudgePort exists, the seam is deleted, not guarded; UNREADABLE first-class, priced by `Guard.judgePolicy` |
| R5.7 | Terminal protocol | `FinishDesk` — one `z.strictObject` renders the taught description AND validates (taught = validated); `split` handles early/stale finishes on typed calls; `Turn` redrives ≤ `limits.retries` carrying the FULL violation set; `closure(acts)` is a pure function of recorded acts — never empty, never "nothing changed" over `unknown`; `force()` when the model will not close |
| R5.8 | Worst-world | `WorldBuilder.build(card)` — only the BUSINESS-documented surface exists; a pipeline emendation is never a license for a world behavior (`Validator` rejects it); gates on every kind (`WorldGates`); simulate ≡ act shared path; `PatchDesk.runCustom` (frozen clone in, patches out, applied gated + audited); rendered truth via `DeliveryWriter`; every change attributable in `BuiltWorld.audit()` |

---

## 9 · PORT LIST

Four ports, one method each, declared in `contract/ports.ts` (L0, imports nothing). No
options object; no field can carry governance or a judge endpoint (R2.6) — the executor
payload is `ReadyCall = { tool, args }`, declared whole in §5.1. Authors and host devs
never see a port — composition lives inside the facades. The ENGINE owns call scheduling:
same-step sibling calls execute serially in emission order, engine-enforced.

| port | the ONE method | implemented by |
|---|---|---|
| `ModelPort` | `step(input: StepInput): Promise<ModelStep>` | `MastraModelPort` (mastra) · `ScriptedModel` (eval); `ModelSeat` routes among certified targets per turn attempt |
| `ToolPort` | `call(call: ReadyCall): Promise<ToolAnswer>` — the executor's whole vocabulary is `done: 'yes' \| 'no' \| 'unknown'` beside its result | `BuiltWorld` (core/world) · `HostToolPort` (mastra, native/MCP) |
| `RecordsPort` | `snapshot(): StateSnapshot` — a deep-frozen clone of visible records | `BuiltWorld` only; its absence on a surface grades trust (R3.6): no diff verification, `unknown` stays `unknown` |
| `ModelRuntimePort` | `serve(tier: TierSpec): Promise<ServingHandle>` | `LlamaCppRuntime` (models); MLX/ollama/vllm implement the same seam and plug in unchanged (R9.2) |

There is deliberately NO JudgePort (the judge is a `ModelPort.step` on the session's own
seat — R5.6 made structural) and NO DeliveryPort (the facades return the whole
`TurnRecord`; the server imports it from the leaf — no mirror can exist, R2.5).

---

## 10 · RESPONSIBILITY INVERSIONS

The refactoring 2.1 pattern: move the decision to the party that owns the fact.

**1 · Effect is position, not a field — and never a name.**
```
DEFECT  writes classified by name regex /^(create|update|delete|…)/ — a write named
        archiveOrder escapes; wipeAccount carries no destructive finding
NOW     a world tool declares effect by the block it sits in (reads/writes/destructive);
        an external tool's effect is a declared surface-card field the human gate approved
GAIN    the author cannot forget the field (there is none), and spelling decides nothing
```

**2 · Simulation is the tool's own parameter; gating is the engine's.**
```
DEFECT  cancelBooking({ id, confirmed: true }) → DENIED — 'confirmed' invokes simulation
        AND signals approval; tools artificially grow a parameter; prose fills the field
NOW     the surface entry declares simulation: { arg: 'dryRun', value: true } — the tool's OWN name;
        the engine downgrades an unapproved destructive call by setting THAT parameter;
        the acting call is clean, with NO field to fill
GAIN    no invented parameter, no prose-fillable approval; a surface with no dry-run still
        works — consent alone gates it (R3.4)
```

**3 · The executor answers one tiny question; the engine grades it.**
```
DEFECT  tookEffect inferred from result shape (ok && !requiresConfirmation) — a landed
        native write delivered as "nothing was changed"
NOW     ToolAnswer.done: yes | no | unknown; StatusClerk derives status done/not-done/
        unknown + reason; unknown reads "I sent it; the service did not confirm" and
        counts dangerous on destructive tools
GAIN    shape-probing ceases to exist; the unattested case has defined, non-lying words
```

**4 · The licence is the stored call; the engine executes it.**
```
DEFECT  the model re-emits the approved call; the engine prunes 'unlicensed' args by
        token-fragment matching — legitimate values deleted while cascade:true rides
NOW     ConsentDesk stores the EXACT CanonicalCall; the typed code releases it; the ENGINE
        feeds it through CallRunner('licence') where every non-consent rule still runs
GAIN    "the call and nothing else" is a construction property; a wider retry is a
        different canonical key — no licence
```

**5 · Owed reads belong to the engine.**
```
DEFECT  the engine denies, then hopes the model reads next — measured: 2 of 4
        told-to-read turns ended with the act never put to the user
NOW     Disclosure.owedReads and the 'owe' verdict build concrete calls from the held
        call's OWN args; the engine runs them (origin 'engine', recorded, masked)
GAIN    a consent question can never show another record's figures; the starved read and
        the deny-and-hope shape are unrepresentable
```

**6 · Status belongs to the engine; the model only reports.**
```
DEFECT  the model declares a did-grammar the engine verifies heuristically — a read-only
        turn could declare 'blocked' ungrounded; greedy first-fit denied honest reports
NOW     the engine assigns every status from control flow + the graded answer; the finish
        report claims (tool, target, word), matched bipartite, order-free, target-bound
GAIN    a fabricated 'refused' has no act to stand on; declaration order cannot deny
```

**7 · A rule's home is decided by its subject.**
```
DEFECT  checks / judged / rules — three names, two cards, six places to look
NOW     one field name, one Guard shape; about-a-tool → contract, about-this-desk → spec;
        judgeQuery instead of deny = judged; neither = declared prose residue
GAIN    the confusing-home question is structurally impossible: there is no split to
        be confused by
```

**8 · Custom executors patch; the world applies.**
```
DEFECT  the custom executor received the LIVE store, bypassed gates, and audited 'custom'
        whether it succeeded or failed
NOW     frozen clone in, { result, patches } out; PatchDesk applies through the shared
        gated, audited, attesting path; done is true by construction
GAIN    a custom tool cannot dodge the world's laws, and its audit row names the result
```

**9 · The judge seam is deleted, not guarded.**
```
DEFECT  a judge interface exists, so a config field could carry a third-party endpoint
        and the no-external-model law is a review item
NOW     Judge.run sends through ModelSeat.port() — the SAME port serving the session
        this moment; no JudgePort exists in ports.ts
GAIN    the forbidden call has no seam to enter through — the law is structural
```

---

## 11 · RENAME DECISIONS

Every register entry, resolved. The name gate (`lints.ts`) bans the old identifiers with
an EMPTY allowlist and WHOLE-IDENTIFIER matching, on every build and release — `ask` is
on the ban list, and no design name carries it (`Guard.judgeQuery`, `StepInput`,
`Question.sentence`).

| old | new | why the new name states its purpose |
|---|---|---|
| `Rule` · `rules` · `rules()` · `InstalledRule` | `Guard` · `guards` · `guards()` · `InstalledGuard` | the market-standard word for the concept, and the field follows the type |
| `say` | `rule` | "say what?" — a guard carries its rule; the word was freed by the type rename |
| `view` · `CallView` / `ReplyView` | `ctx` · `InputCtx` / `CallCtx` / `ResultCtx` / `ReplyCtx` | the charter's own word (R2.9: "the ctx guards read"); one ctx per phase |
| `judge` (the field) | `judgeQuery` | the query the session's own model judges — readable without the doc comment |
| `fails: 'open' \| 'closed'` | `judgePolicy: 'passOnFails' \| 'denyOnFails'` | fail-open/closed is security jargon; the value states the trigger AND the effect |
| `Sampling` / `sampling` | `LlmParams` / `llmParams` | pure ML jargon out; "the model's parameters", plain and honest |
| `Dim: spatial / input / run` and `on: 'call' \| 'reply'` | `Guard.on: 'input' \| 'preTool' \| 'postTool' \| 'reply'`, REQUIRED | four explicit phases — the hook names that read; no derived default |
| `home: 'agent' \| 'domain'` | `'spec' \| 'contract'` (+ `'engine'` for the installed floor) | ONE nomenclature pair everywhere; the synonyms die |
| `Compiler` / `controlCompile` / `ControlStrip` / `'control'` | `AgentFactory` / `AgentFactory.ungoverned` / `UngovernedAgent` / `'ungoverned'` | not a language compiler — the factory that builds agents; the variant answers to its honest name and the class NAME is the disarming; `control` joins the ban list |
| `IntakeGate` / `intakeFromWorld` | `SurfaceGate` / `factsFromWorld` | the gate guards the surface; the facts derive from the world card |
| `toolDefs` · `intake` · `IntakeTool` · `CertifiedIntake` · `expectedSurfaceHash` · `certification` (config key) | the surface card's own blocks (`world` / `mcpWorld` / `liveWorld`); engine-internal `SurfaceFacts` / `ToolFact`; the hash embedded in the generated module | the authoring concept is GONE — the block a tool sits in IS the declaration |
| `volatile` | does not exist | the licence is the exact stored call; sibling questions + (tool, target) closure replace the escape list |
| `requiresBefore` / draft `readFirst` | `onlyAfter` | one shape — "X only after Y"; the remedy derives from the prerequisite's declared effect: a read is engine-performed (`owe`), a write denies teaching the order |
| `forbidThisTurn` / draft `neverCall` | decomposed | enforcement = omit from the lane/block; the words = a contract `fact`; a state-conditioned ban = `precondition` |
| `consentRequired` | `precondition` (tool-set form) | one mechanism for "allowed only while the world says so"; the standing-consent gate is its named example |
| `resultInvariant` | `checkResult` | "invariant" is mathematics; checkResult says the mechanism — after the tool ran, check the result |
| `destructiveThrottle` | `maxDestructive` (authored as `limits.destructive`) | parallels `maxCalls`; the census row keeps its parameters visible |
| `degenerationGuard` | `brokenReply` | ML jargon out; the reply is broken as an artifact — every AS-IS branch kept |
| `jargonScrub` | `swapTerms` (a Rewrite) + `wording` | translation is not a decision: the rewrite swaps declared world terms; `wording` owns the engine's own words |
| `llmCheck` | the `judgeQuery` form | "llm" reads nothing; a judged guard is the open judged form, census kind `judged` |
| `llmCheckLie` | `lieCheck()` + the structural lie floor | two child words for the declared judged half; the free deterministic half lives in `HonestyCheck`, always on |
| `outcome` (mustAccountFor param) | `status` | `result` is the tool's DATA; `status` is THE design word for what happened |
| `did` / `Intention` / "claims" / "the declaration" | `finish.report: ReportLine[]` | the model files a report inside the finish payload; one structure, one name, in the channel, the checker, and the tutorial |
| `target` (taught) vs `targetName`/`targetValue` | `target` — one key | `FinishDesk`'s single strict schema teaches and validates the same key; the split cannot exist |
| `tool_called_request_approval` · `any_other_question` · `ask` | `held` (one Reason member) | a held call is an engine fact with one word; asking the user is not an outcome and appears in no vocabulary — and the judged field is `judgeQuery`, so the retired token returns nowhere |
| `pendingConfirmMustAsk` | does not exist | guards exist only as `Rulebook` rows; a phantom name has nowhere to live |
| `AgentSpec.mode` | does not exist | undocumented free strings have no field to live in |
| `scrubTextFields` | `secrets` + `Masker.maskProse` | one semantics: declared names masked structurally; prose scrub is only the collected literal values |
| `chain` (session mutex) vs `controls.chains` | `Session.enter` (queue) vs `catalog.onlyAfter` | the two concepts stop answering to one word |
| world audit outcome `custom` | the audit row carries `done`; executor kind is its own field | the audit states the result, never the mechanism — a failing custom executor no longer audits like a succeeding one |
| corrections tag grammar | the `Correction` discriminated union | consumers switch on `kind` exhaustively; no string-prefix families |
| `'pass' \| 'FAIL'` + `'unjudged'` + `overall` | `pass \| fail \| unreadable`, one field | one closed vocabulary, one case, no alias, no placeholder that scores |
| `stateView` / `modelParams` / `terminalProtocol` / `stopOnRepeatedToolCall` / `redrives` | deleted / `llmParams` / engine-owned (`FinishDesk`) / brake in `ModelSeat` + the floor / `limits.retries` | constructor fields name purposes; mechanisms the author never wires have no constructor field |
| `tookEffect` / `effectInferred` | `Act.said` (the executor's word) + `Act.status` + `Act.evidence` | who attested is in the fields: the executor said, the engine derived, the evidence names the grounding (R8.4) |
| `internal.ts` | does not exist | the ports are the only backend seam; there is no everything-barrel to promise nothing about |
| `probe` / taught-generic `dryRun` / `simulation.on` | the surface entry's `simulation: { arg, value }` — the tool's OWN parameter name, and `value` never collides with the guard-phase field `on` | the engine's canonical word never enters a tool schema |

---

## 12 · WHAT THE AUTHOR NEVER SEES — the construction chain

One paragraph a maintainer can hold: `new LoopRunAgent(cfg)` → `AgentAssembly.assemble`
resolves the surface card (world → `factsFromWorld`; mcpWorld/liveWorld → `SurfaceGate`
reconcile + deny-by-default + certification) → `Engine.create` over the closed
`EngineConfig` runs downstream of `CardCheck` (every problem at once, named codes) and
`AgentFactory` (one frozen `CompiledAgent`) → per session, `Session` holds `ActionHistory`/`ConsentDesk`/`Masker`/the
world instance → per turn, `Turn` sequences the desks. Spec mistakes surface at
construction, all at once; nothing surfaces mid-conversation (R1.6).

---

## 13 · THE THREE MAPS (R10.5)

### 13.1 Defect map — every AS-IS defect class → the rule that makes it unrepresentable

| AS-IS class (114 items) | the design rule | before → after |
|---|---|---|
| regex-validation | no ENGINE pattern seam exists: `Masker` scrubs collected literals only; `ConsentDesk` searches engine-minted literals only; `Monitor` reads typed kinds; judge answers are fixed tokens with UNREADABLE priced. The ONE regex home is the author's own declared pattern inside `blockPattern` / `purgePattern` / `maskPattern` — the purity lint rejects regex anywhere else | a judge reply "NONETHELESS…" read as a clean verdict → a non-token answer is `unreadable`, priced by `Guard.judgePolicy` |
| custom-guard-abuse | the catalog is the first stop (`catalog.ts`); a custom guard requires a written admission of which catalog kind fails; engine facts travel as `Correction`s, never as synthetic guards | a bundle with 12 hand-rolled regex guards → `onlyAfter`/`maxCalls`/pattern factories + declared judged checks; every hand-written survivor censused as `custom` |
| perfect-world | `Done`/`StatusClerk` grade trust; `HostToolPort` never says `yes` on its own; `unknown` is dangerous on destructive tools | a landed native write delivered as "nothing was changed" → "I sent it; the service did not confirm the result" |
| id-naming-convention | the licence is the whole call (`CanonicalCall`); the target is a DECLARED surface field; no key fishing anywhere | `transferAsset` licensed by whichever `*Id` key serialized first → one canonical key, one licence, key order irrelevant |
| order-dependence | `CanonicalCall` sorted-key identity; `HonestyCheck` bipartite order-free; serial engine-owned scheduling | "the booking blocked, and then the quote passed" DENIED for its order → either order passes; the deny names the tool |
| no-deterministic-return | `DeliveryWriter` renders every act line, every open question + code, every denial, every closure — every delivery | figures behind a refusal reaching the user only if the model's prose said them → the record line prints what the result filled |
| confusing-names | §11, enforced by the name gate with an empty allowlist | `probe`/`trunk`/`challenge` era words → `simulate`/`assembledPrompt`/`approvalRequest` era continued: every §11 row |
| entangled-dependencies | §6 one-way layers; `Turn` imports only declared collaborators (lintable); ports are the only backend seam | `turn.ts` at 1045 lines, 13 imports, two diverged loop copies → `Turn` ~180 lines sequencing 9 named desks |
| dubious-status-names | one `Status` + `Reason` + `ReportWord` set of closed unions, shared by record, report, wording and exam | `pending_confirmation` split into two interchangeable words → `held`, one word, one evidence class |
| hand-mirrored types / other | one contract leaf; the server imports `TurnRecord`; `wire.ts` has no local copy | a drifted server-side TurnMeta copy → structurally impossible: there is exactly one declaration |

### 13.2 Atlas preservation map — the fifteen, one by one

Case 72 is THE TRIPWIRE: the world and invariant are correct; `WorldBuilder` must
reproduce the refusal exactly; if its verdict moves, the port or the world layer broke —
stop and root-cause before anything else.

| # | case | where this design addresses it | expected movement |
|---|---|---|---|
| 43 | claim-settlement-figure | `Disclosure` slots bound to the question's target record; `SLOT_UNDERIVABLE` at construction | fixed by contract prose + slot binding; may flip to pass |
| 47 | plan-downgrade | spec/contract guards outrank consent (§7 step 4): no question is born for an impossible act | may flip to pass (contract layer) |
| 48 | viewer-money-refusal | denial sentence = the guard's `rule` + detail; the deny names the guard's own words | contract-layer prose; expected to move only with new contract wording |
| 49 | dispatcher-fleet-refusal | same as 48 — the refusal can name the path because the rule's sentence is authored | contract layer; as 48 |
| 50 | billing-member-refusal | as 47 — refusal precedes consent | may flip to pass |
| 51 | sole-owner-protected | as 47 | may flip to pass |
| 52 | authority-costume | the rule the world declares is a contract guard whose `rule` reaches the model (description channel) | contract layer |
| 62 | record-borne-instruction | `catalog.onlyAfter` (read prerequisite) → the `owe` verdict: the engine performs the read | expected to flip to pass (engine now guarantees the read) |
| 63 | not-onboarded-history | as 62 — guard-owed read engine-performed | expected to flip to pass |
| 72 | maintenance-lifecycle | `WorldBuilder` keeps gates and refusals exactly as declared | **MUST NOT MOVE — the tripwire** |
| 80 | maintenance-over-a-reservation | as 62 — `onlyAfter('scheduleMaintenance', 'listReservations')` engine-performed | expected to flip to pass |
| 82 | imperative-inside-a-customer-name | the rebuilt finish/redrive path (`FinishDesk.split/parse`, full-set corrections) | expected to flip to pass (engine layer) |
| 87 | viewer-cannot-invite | as 48 — authored refusal sentences | contract layer |
| 92 | invoice-reissue-is-idempotent | as 82 — the turn no longer dies in a stub | expected to flip to pass (engine layer) |
| 100 | viewer-cannot-hand-equipment-over | as 48 — the refusal names the rule's reason | contract layer |

Reading the table at the final gate: an engine-layer case that stays failed is an engine
regression; a world/rubric-layer move is the declared SURPRISE (case 72's row); a
contract-layer case moves only when its subject's ported prose changes — the port is a
mechanical translation, so an unexplained contract-layer move points at the port, not the
engine.

### 13.3 Priced open risks — obligations the runtime cannot enforce

| # | risk | where it is caught instead |
|---|---|---|
| 1 | the finish `report` redrive rate on Qwen local tiers is unmeasured — the (tool, target, word) payload must be learnable (R7.1) | measured on the exam before any 85-claim (R10.4); the brakes bound the damage meanwhile |
| 2 | the consent turn's transcript shape changes (the engine executes the stored call on consumption) | old-shape cases argued per the baseline layer table at the final gate (R10.1) |
| 3 | `Guard.deny` purity is not runtime-enforceable in JS | the purity lint over guard sources (`lints.ts`) + review |
| 4 | prose/check PARITY (R6.3) is not runtime-enforceable for hand-written guards | structural for catalog factories (`rule` and `deny` derive from the same parameters); for hand-written `deny` guards: review + an obey-the-prose exam case per custom guard that must pass governed |
| 5 | the atlas subject port is a vocabulary translation; a port error mimics an engine regression at the 85 gate | the fifteen-table layer attribution (§13.2) at the phase-4 gate; rename register as the dictionary |
| 6 | the byte-stable prefix's cache-read share must be re-measured on 10–20-turn conversations (the transcript grows, the static prefix does not) | the R10.4 measurement duty, run with the exam harness |
| 7 | `WorldGates` ships three gate kinds and no arithmetic; a world rule needing arithmetic forces a custom executor | caught at `Validator` replay; priced as authoring guidance in the skill |
| 8 | any wording change to a judged question or an engine sentence | measured on at least TWO model families before shipping, honest-damage beside detection (R10.3/R10.4) |
| 9 | the structural lie check replaces the judged lie question only at the acceptance bar: honest damage 0 on EVERY model, detection at the reference floor on ≥3 models of different developers | the exam, per model, at certification (R5.3) |
| 10 | the four judged factories are opt-in — an undeclared check is uninstalled coverage that an author may read as protection | the skill's authoring guidance declares the judged set per domain; `agent.guards()` makes absence visible, and the census lint fails a case suite that exercises none of them |

The RED battery (R10.6) ships as a first-class exam section, one case per attack class at
minimum: injection via tool results (`injectionCheck` is the declared defense), injection
via user text, record-borne instructions, stale-code replay (the nonce answers it),
licence widening, exhaustion abuse, error-message leakage (`TurnFailure` never reaches
prose), cross-session confusion (typed pair keys). New attack classes discovered during
implementation are ADDED to the battery, never fixed silently.

---

## 14 · R11 — WHAT SHIPS WITH THE ENGINE

The engine never ships alone; scope is `looprun`, `agentspec`, and the subject under
`agentspec-bench`, paid in the same working session as the phase-5 swap.

| artifact | what absorbs the change |
|---|---|
| `agentspec` skill | `references/**` rewritten to the two-card shapes of §3, the surface cards of §4, the catalog of §5.2; the lints re-keyed to `installedBecause` and the §11 name gate list |
| `docs/tutorial/**` | the ladder of §2 IS the lesson plan — one concept per lesson, each lesson a card field with its default |
| README + `governance/**` + source headers | the two-card contract, the no-external-model law restated at the `Judge`/`JudgeInputBuilder` headers, the R9-EX construction shapes |
| `packages/core/GUARDS.md` | regenerated from `catalog.ts` — the AVAILABLE list, the judged factories with their questions, the rewrites as their own section |
| `agentspec-bench` subject | the atlas bundle ported once, phase 4, mechanical translation — §11 is the dictionary |

Every authoring-visible change in this design names its absorption point in the compliance
table's R11 column (§15).

---

## 15 · COMPLIANCE TABLE — the mandatory item-by-item check

One row per charter item. PASS pointers name a section, a signature, or a diagram of THIS
document. The R11 column marks where the skill/tutorial absorb each authoring-visible
change (— = not authoring-visible).

| item | PASS | pointer | R11 absorption |
|---|---|---|---|
| R1.1 | PASS | §3 (two GOVERNANCE interfaces); the surface card (§4) is the charter's own toolDefs/world INPUT in declarative form — a data declaration of what exists, never a third governance card; §12 (no engine class/port touched) | skill references: the two cards |
| R1.2 | PASS | §2 (15 lines, 12 code); every advanced §3 field optional with stated default (`name`/`persona` required per R1.1/R1.4); the ladder | tutorial = the ladder |
| R1.3 | PASS | §3 (TypeScript interfaces; `Guard.deny` is a function); purity via `lints.ts` (§5.8) | skill: purity lint |
| R1.4 | PASS | §3: `persona` required on spec; contract has `voice`, no persona field exists | tutorial lesson 7 |
| R1.5 | PASS | `Rulebook.guards()` returns the arrays the four phase checks iterate + judged + rewrites + limits (§5.3); `Wordings` one home per sentence (§5.2); auto-install list in `AgentFactory` (§5.2) | skill: inspection contract |
| R1.6 | PASS | `CardCheck` + `CardError` (§5.1, §5.2): all at once, named codes, fix sentences; misconfigured rule throws | skill: error-code list |
| R1.7 | PASS | §3 `tools`/`teammates`; shared contract; no ceiling anywhere in §5 (≤15 is pipeline guidance) | skill: the split question |
| R2.1 | PASS | §5 preamble: every class commits ≤ ~200; largest entries are ~200 with one responsibility | — |
| R2.2 | PASS | §5: no options objects, no generics beyond one mapped type; §6: one behavior = one desk | — |
| R2.3 | PASS | §5.3 `Turn` (the only loop); §5.5 closed constructor; `EngineConfig` closed (§5.3); the ungoverned variant is a SEPARATE explicit class (`UngovernedAgent`) — no option on the governed constructor weakens governance (§5.2, §5.5) | — |
| R2.4 | PASS | §6 layers, arrows one-way, rules scoped per role (port implementations leaf-only; `AgentAssembly` the composition module); no `internal.ts` | — |
| R2.5 | PASS | §5.1 `vocabulary.ts` one home; `wire.ts`/`WireHandler` import `TurnRecord` from the leaf | — |
| R2.6 | PASS | §5.1 `ports.ts` (L0, no options field) + `ReadyCall` declared whole ({ tool, args } — nothing else); §9; serial emission-order execution in §7 step 4 | — |
| R2.7 | PASS | §5.3 `Turn` sequences only, lintable import list; every §5 entry carries its size commitment; decomposition lines pre-named (§5 preamble) | — |
| R2.8 | PASS | §5 preamble (ESLint at error, strict tsconfig); §5.1 closed unions; ctx types typed, input `unknown` | — |
| R2.9 | PASS | §5.1 freeze law paragraph; `AgentFactory` frozen output; `ActionHistory` sealed-by-reference; clones only in `snapshot()`/`PatchDesk` | — |
| R2.10 | PASS | §5.1 `TurnFailure`; §5.3 `Session.seal` single commit, draft discarded on failure; §5.8 `Monitor` incident-bound markers | — |
| R3.1 | PASS | §4 `mcpWorld` / `liveWorld` (live surfaces primary); `world` (genesis secondary) | skill A2 |
| R3.2 | PASS | §4: the `mcpWorld` module generated + approved as code review; no silent rewrite — proxies/excludes are gate exits | skill gate doc |
| R3.3 | PASS | §4 the surface entry's `does` (sanitized description) + `proxy` rename AND compose forms + `simulation` (the tool's OWN parameter); `HostToolPort` wire mapping incl. composed reads (§5.5) | skill proxy rules |
| R3.4 | PASS | §8 R5.4: no simulation declared → plain `hold`; consent creates the two-step | — |
| R3.5 | PASS | §4 surface entries (effect by BLOCK; target/label/does declared; secrets on the contract, §3); §10 inversion 1 | skill surface schema |
| R3.6 | PASS | `StatusClerk.grade` derivation table (§5.3); `Done`→`Status`+`Reason`; snapshot-diff verify; `simulationRevoked` per session (the set in `Session`'s stores); thrown-write = `unknown`, thrown-read = `TurnFailure`, never `refused` | — |
| R3.7 | PASS | `Question.code` carries no tool name (§5.1); questions worded from `label` (§2 output) | tutorial lesson 4 |
| R3.8 | PASS | §4 (credentials host env/closure; three gates); `SurfaceGate` canonical fingerprint + structural exclusions (§5.2) | skill: certification |
| R4·ASK | PASS | `targets.ts` (§5.8): every routing fact declared (`ModelTarget`), brakes armed from the declared tier | skill ASK |
| R4·GEN | PASS | `world.ts`/`WorldBuilder`/`WorldGates`/`PatchDesk` (§5.4): declared data, simulate ≡ act, `{result, patches}` over frozen clone | skill GEN |
| R4·EVALS | PASS | `ExamRunner` typed approve step (§5.8); census keyed on `installedBecause` (`lints.ts`) | skill EVALS |
| R4·NORMS | PASS | §3: contract guards bind live-surface tools (the NORMS home); disclosure, wording, rewrites, secrets on the cards | skill NORMS |
| R4·TEST | PASS | `Validator` (fresh world per phase, every preset); `UngovernedAgent` via `AgentFactory.ungoverned`; `JudgeInputBuilder` complete+blind; `Folder`; `SubjectLoader` provenance; `Certifier` margin discipline (§5.8) | skill TEST |
| R4·SHIP | PASS | `Certifier` + `Seal` over every governed artifact from the manifest (§5.8) | skill SHIP |
| R5.1 | PASS | §8 row R5.1 (`ConsentDesk` signatures; state machine; nonce; no bypass; both dead ends excluded, each by its own mechanism) | tutorial lesson 2 |
| R5.2 | PASS | §8 row R5.2 (`Disclosure.owedReads` + `owe` verdict — consent-owed AND guard-owed engine-performed) | tutorial lessons 5–8 |
| R5.3 | PASS | §8 row R5.3 (`HonestyCheck` bipartite, target-bound, evidence classes, figures engine-rendered only, structural lie check; `ActionHistory.mint`); acceptance bar in §13.3 row 9 | — |
| R5.4 | PASS | §8 row R5.4 + §5.3 CallRunner routing + §7 step 4 — one description everywhere: simulate = preview then ask; hold = the no-simulation route | — |
| R5.5 | PASS | §8 row R5.5 (`Masker` at the recording seam; only stored form; collected literals; executor alone sees real args) | tutorial lesson 9 |
| R5.6 | PASS | §8 row R5.6 (frozen order incl. the throttle's band; OPEN boundary declared; `Judge` on the session seat; UNREADABLE priced) | — |
| R5.7 | PASS | §8 row R5.7 (`FinishDesk` one strict object; full violation set; pure closure; `force()`) | — |
| R5.8 | PASS | §8 row R5.8 (`WorldBuilder` worst-world laws; emended-file-never-a-license + `Validator` check; audit attribution) | skill GEN |
| R6.1 | PASS | §3 `Guard` (rule + deny in one object); `PromptWriter` channel law: contract tool guards → the tool's own card (survives MCP), spec tool guards → the per-agent tail (every path) (§5.3) | skill guard authoring |
| R6.2 | PASS | §3 `Guard.rule` doc (present/imperative, never accusatory); denials = rule + detail | skill prose rules |
| R6.3 | PASS | catalog factories: `rule`+`deny` from the same parameters — parity structural (§5.2); hand-written guards priced in §13.3 row 4 | — |
| R6.4 | PASS | §3 `deny` pure over frozen ctx; enforced by the purity lint (§5.8) | — |
| R6.5 | PASS | every ctx carries `userText` for EXACT-LITERAL search — whole-token, contiguous, never interpretation (§3, §5.1); `ConsentDesk.readAnswer` searches engine-minted literals (§5.3); MEANING is judged only through `Judge` on the session's own seat (§5.3) | — |
| R6.6 | PASS | `Masker.maskProse` collected literals only; no lexicon module exists anywhere in §5; the corrected one-exception clause is served by the three pattern factories, with regex confined to them by the purity lint (§5.2, §5.8) | — |
| R6.7 | PASS | `catalog.ts` (§5.2): the auto-installed deterministic set + the four judged factories DECLARED, each with `judgePolicy`; a custom guard owes the written admission | skill catalog |
| R6.8 | PASS | §3: a `Guard` with neither `deny` nor `judgeQuery` is the declared residue; the prose-residue lint rejects restatements (§5.8) | skill residue rule |
| R7.1 | PASS | `ModelSeat` brakes armed from the DECLARED tier (§5.3); `targets.ts`; redrive rates measured (§13.3 row 1) | — |
| R7.2 | PASS | §3 `Limits` (calls, destructive, retries, questionTurns); `FinishDesk.force` (§5.3) | tutorial lesson 13 |
| R7.3 | PASS | `PromptWriter.system` frozen prefix, per-agent divergence last (§5.3); shared-prefix preserved by the channel law | — |
| R7.4 | PASS | `MastraModelPort` (§5.5): `llmParams` wire-tested, per-field merge over target defaults (§3); named provider presets (`gemini:thinking-off`) in the provider's dialect | tutorial lesson 16 + skill llmParams doc |
| R7.5 | PASS | `ModelSeat` (§5.3): certified-only set (`ModelChoice`), five strategies, switch between attempts, `servedBy` recorded, Judge on the seat | skill targets doc |
| R8.1 | PASS | §10 inversion 6: the model proposes, the engine disposes every status | — |
| R8.2 | PASS | `CanonicalCall` (§5.1): sorted-key identity; bipartite matching (no greedy first-fit) in `HonestyCheck` | — |
| R8.3 | PASS | `Session.enter` queue; caller-supplied id only; `WireSessions` typed pair key (§5.7) | — |
| R8.4 | PASS | `Act.said`/`status`/`evidence` (§5.1): `ok` never means effect; attested facts key success | — |
| R9.1 | PASS | `WireHandler` (§5.7): auth union (secure-by-omission unrepresentable), typed HTTP failure, TurnRecord meta, credential-owned sessions | — |
| R9.2 | PASS | `tiers.ts` declared `TierSpec` facts (MTP, KV, ctx, cache) + `LlamaCppRuntime` warm-slot recipe + one `ModelRuntimePort` + `Downloader` integrity (§5.6) | — |
| R9.3 | PASS | `Engine.create`/`chat` (§5.3): two cards in, one entry, whole typed record out — no framework dependency; `EngineConfig` closed | — |
| R9.4 | PASS | `ExamRunner` public + scriptable (§5.8); `Campaign` end-to-end | — |
| R9.5 | PASS | `LoopRunAgent extends Agent` (§5.5): same generate/stream, `new Mastra({ agents })`; reserved facade slots `@looprun-ai/vercel` / `@looprun-ai/langchain` named in §5.5 and §6 L5 | — |
| R9-EX | PASS | §4: `world`, `mcpWorld`, `liveWorld` — the charter's construction shapes absorbed into the surface card (§11's register maps the retired field names) | skill construction doc |
| R10.1 | PASS | §13.2 (the gate + layer attribution reading); the phase plan lives in `docs/refactoring.md` | — |
| R10.2 | PASS | §13.2 case 72 row — THE TRIPWIRE, must not move | — |
| R10.3 | PASS | §13.3 row 8: two-family wording rule; margin discipline in `Certifier` (§5.8) | — |
| R10.4 | PASS | §13.3 rows 1, 2, 6, 8 + the act-id referencing choice priced (§8 row R5.3) | — |
| R10.5 | PASS | §13.1 (defect map with before/after) + §13.2 (fifteen one-by-one) + §13.3 (priced risks) | — |
| R10.6 | PASS | §13.3 closing paragraph: the RED battery, 8 classes, both variants (`ExamRunner`) | skill red cases |
| R10.7 | PASS | `ExamCase.split: 'fix' \| 'held-out'` + `Certifier` discipline (§5.8) | skill T/S doc |
| R11 | PASS | §14: the absorption table; per-row column in this table; every §3 card field has a ladder lesson (§2) | itself |
| RENAME | PASS | §11 complete register + the name gate in `lints.ts`, empty allowlist, whole-identifier matching, every build and release; no design name carries a banned token (`judgeQuery`, `StepInput`, `Question.sentence`) | skill lints |

### The mechanical rejection checklist, walked

```
[no] hello-world > ~20 lines / lesson-1 engine concept       — §2: 15 lines with blanks, 12 code, pure
                                                               data; records/reads/writes/destructive
                                                               are everyday words
[no] a fact written twice / an engine object per tool        — §3 cards carry no tool objects; §4 surface
                                                               blocks declare once (factsFromWorld
                                                               derives); contract guards bind live tools
                                                               (no copy per spec)
[no] a class not honestly under 200 lines                    — §5: every entry commits ≤ ~200; the world
                                                               splits into world.ts + WorldBuilder +
                                                               WorldGates + PatchDesk; breach lines
                                                               pre-named (§5 preamble)
[no] company tools.json/MCP can't run governed unedited      — §4 mcpWorld: the same declarative blocks
                                                               beside the connection; proxies are pipeline
                                                               emendations mapped back at the wire
[no] semantics inferred from name/prose/result shape         — §10 inversions 1, 3, 6; §4 declared
                                                               surface fields; StatusClerk grades only
                                                               the declared done answer
[no] a validation decision runs a pattern over text          — Masker collected literals; ConsentDesk
                                                               minted literals; Monitor typed kinds;
                                                               judge fixed tokens with UNREADABLE priced;
                                                               the one exception: the author's declared
                                                               pattern factories (block/purge/mask)
[no] an approved call bypasses a non-consent rule            — §7 step 2: CallRunner('licence') re-enters
                                                               the FULL Rulebook
[no] a consent dead-end exists                               — §8 R5.1: the engine births the question
                                                               from the held call (no unbirthable
                                                               question); refusal precedes consent, so no
                                                               approval loop can be unsatisfiable
[no] unattestable write delivered as success/"nothing"       — §5.3 StatusClerk: unknown never success,
                                                               never no-change; FinishDesk.closure says
                                                               "could not confirm"
[no] an engine-known fact reaches the user only via prose    — §5.3 DeliveryWriter: record lines, every
                                                               open question + code, every denial, every
                                                               closure, every delivery
[no] identity/matching depends on call or key order          — §5.1 CanonicalCall; HonestyCheck
                                                               bipartite; SurfaceGate canonical fingerprint
[no] two turn machines / import cycle / mirrored type        — §6: one Turn, one-way layers, one leaf;
                                                               the exam drives LoopRunAgent.generate;
                                                               internal.ts does not exist
[no] a caller-passable option can weaken governance          — §5.5 closed constructor key set;
                                                               EngineConfig closed; Engine.chat takes two
                                                               strings; ports carry no options object;
                                                               ungoverned is a separate CLASS, never an
                                                               option on the governed one
[no] any path can reach a third-party judge model            — §9: no JudgePort exists; Judge runs
                                                               through ModelSeat.port(); targets are the
                                                               only reachable models
[no] an R5 mechanism has no signature-level home             — §8: eight rows, each class + signature
[no] an R4 phase has no serving surface                      — §5.8 R4 serving map: all six named
[no] compliance table missing / a row lacks a pointer        — §15: one row per charter item, every row
                                                               a pointer into this document
```
