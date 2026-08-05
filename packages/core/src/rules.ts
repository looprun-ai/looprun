/**
 * @looprun-ai/core — guard TYPES (framework-free).
 *
 * The governance primitives the agentspec skill authors: a deterministic `check` paired with an
 * LLM-facing `prose`, keyed on tool args / world state / observed calls AND the full conversation
 * history — the user's own text included. The "magnet firewall" (guards blind to user text) is
 * RETIRED (2026-08-02 ruling): guards are deterministic code, so "influence" does not apply; what
 * the firewall protected decomposes into laws with better owners — intent-based tool routing stays
 * banned as a LOOP-shaping law, and text pattern-matching stays banned by the no-regex law in the
 * config surface (structural in config; a grep-gate in code). The world is an opaque, host-injected seam
 * (`AgentWorld`); a domain reads its own accessors through the index signature — the package itself
 * is domain-neutral.
 */
import type { Intention, RenderOpts } from './runtime/claims.js';
import type { Challenge } from './runtime/challenge.js';

/** The five enforcement dims (taxonomy metadata; the structural key is the hook it maps to). */
export type Dim = 'spatial' | 'input' | 'run' | 'output' | 'behavior';

/**
 * The read/exec world seam the runtime + guards depend on — host-injected, opaque to the package.
 * The core methods the runtime calls are typed; domain-specific accessors (imageQuotaRemaining,
 * hasVisualStyle, _state, brand, …) flow through the index signature so a domain's guards/domain contract can
 * read them without the package knowing the domain.
 */
export interface AgentWorld {
  exec(name: string, args: Record<string, unknown>): Promise<unknown> | unknown;
  advanceTurn(): void;
  ingestAttachment(url: string): string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean; effectInferred?: boolean }>;
  sseActions: unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

/** One tool call observed this CONVERSATION. */
export interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  turnIndex: number;
  resultFlags?: { requiresConfirmation?: boolean };
  /** Did this call MUTATE the world (a write that took effect), vs a pure read / a refused write? Threaded
   *  from the world's `toolCalls[].tookEffect` by the backend. Lets a reply-honesty check tell "an ACTION
   *  succeeded" from "a READ succeeded" so it does NOT veto an honest "I cannot do X / no record found"
   *  reply on a read-only turn (over-firing there costs a redrive and then the exhaustion closure). */
  tookEffect?: boolean;
  /** Was `tookEffect` INFERRED by the runtime rather than ATTESTED by the world?
   *
   *  A world that keeps its own ledger (`defineWorld`, `FixtureWorld`, any custom world) sets `tookEffect`
   *  per executor — it is a deliberate statement that THIS call mutated the world, and it is trustworthy
   *  for any tool name. The native-tools/MCP path has no executor to ask: the tool ran itself, so the
   *  runtime derives the flag from the RESULT (`ok && !requiresConfirmation`), which is really "the call
   *  succeeded" — true of every successful READ as well. The two must not be read with the same authority:
   *  "it took effect ⇒ it must be reported" is a sound law only over an ATTESTED effect. Set only by the
   *  inferring path; absent everywhere else. */
  effectInferred?: boolean;
  /** The LABEL this call's own result issued (a world-issued noun for what it produced/touched), when it
   *  issued one. Attached PER CALL so the engine's derived account (`deriveClaimsFromLedger`) names the
   *  entity the acting call itself named — the conversation-wide `producedThisTurn` array is a positional
   *  stream that includes READ labels, and consuming it positionally made a read's label shift onto a
   *  write's derived target. */
  producedLabel?: string;
}

/** One EXECUTED tool call as it is retained in the conversation `history` (a guard-vetoed attempt is
 *  NOT here — it rides `HistoryTurn.attemptedCalls`). `result` is present only when the backend that
 *  built the turn had the world result to hand; the framework-free ledger keeps `ok`/`tookEffect`. */
export interface HistoryToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  tookEffect?: boolean;
  result?: unknown;
}

/** One COMPLETED conversation turn, as seen by a later turn's guards. Read-only: the entries the
 *  runtime hands to `GuardCtx.history` are frozen. */
export interface HistoryTurn {
  turnIndex: number;
  /** The user's message that opened this turn, verbatim. */
  userText: string;
  /** The assistant reply the user actually received (post mutators/redrive/exhaustion). */
  reply: string;
  /** Domain tool calls that EXECUTED this turn (terminals excluded). */
  toolCalls: ReadonlyArray<HistoryToolCall>;
  /** The turn's DELIVERED structured claim of operations (the delivered `respond`'s `did`). Retained so
   *  a later turn's guards can read what the agent DECLARED it did. Frozen with the entry. Task 4 will
   *  feed this the VERIFIED (post-cross-check) set; for now it is what the ledger held at seal time.
   *  This is ALSO the ask record: a turn posed a question iff `hasAskIntent(did)`, never through a flag,
   *  and a SEALED turn is the authoritative answer for its own `turnIndex`. */
  did: ReadonlyArray<Intention>;
  /** Calls a guard VETOED before execution — the world never saw them. */
  attemptedCalls: ReadonlyArray<{ name: string; args: unknown }>;
  /** The turn's recovery/correction log (guard fires, redrives, superseded terminals, …). */
  guardEvents: ReadonlyArray<string>;
}

/**
 * THE JUDGE SEAM — the ONE callback every judging call in the engine rides: a prompt in, the model's
 * raw text out. The lie check, the rewrite it gates, and every question an `llmCheck` guard binds all
 * go through this single shape.
 *
 * Backend-supplied, never host-configured: a backend already driving a model for the turn drives these
 * on the same model and endpoint. What makes that safe is ISOLATION — the call carries no persona, no
 * tools, no history and no knowledge that anything is pending. It sees the text it is given, and
 * answers it.
 *
 * The CALLER composes the prompt and reads the answer. A judge that throws or rejects propagates to its
 * caller, which is the only place that knows what an unanswered question means.
 */
export type Judge = (prompt: string) => Promise<string>;

/** Everything a guard predicate may read — including the user's own text (`userText` this turn;
 *  `history[].userText` for prior turns). */
export interface GuardCtx {
  args: Record<string, unknown>;
  tool?: string;
  world: AgentWorld;
  observed: ObservedCall[];
  turnIndex: number;
  /** The user's incoming message for the CURRENT turn, verbatim — set once at `beginTurn` and stable
   *  for every hook of the turn (the forced chain micro-generate runs inside the same turn, so it
   *  sees it too). It is '' only when the turn was NOT opened by a string user message: the stream
   *  path, and `generate(messagesArray)` (a caller-managed message array, no fresh string input).
   *  `onInput` reads it as the real incoming text. */
  userText: string;
  /** The full PRIOR conversation, turn-structured and read-only. Available to EVERY hook. The
   *  CURRENT (in-flight) turn is NOT here — its user text is `userText`, its calls are `observed`. */
  history: ReadonlyArray<HistoryTurn>;
  reply?: string;
  producedThisTurn?: string[];
  attachmentsThisTurn?: string[];
  result?: unknown;
  notes?: string[];
  /** The CURRENT turn's structured claim of operations, extracted from the delivered `respond`'s `did`
   *  and grounded against the ledger by the cross-check guards. Populated on the REPLY-side ctx —
   *  the onReply checks, the postTool result-invariants and the egress mutators — so a guard reads the
   *  agent's DECLARATION, not its prose. Absent on preTool/onInput (no delivered respond exists yet).
   *  It carries the turn's ASK too: `hasAskIntent(ctx.did)`, never a flag.
   *  PRESENT ⇒ AUTHORITATIVE: a guard that needs "did this turn pose a question" must trust it over any
   *  observed scan, which can still hold a terminal the user never received. */
  did?: Intention[];
  /** THIS turn's guard-VETOED attempts — the calls a preTool guard blocked before they reached the world
   *  (the ledger's `attemptedCalls`, reset per turn). Populated on the reply-side ctx beside {@link did}
   *  so `claimIsGrounded` can ground a `blocked`/`refused` claim against the attempt the guard stopped —
   *  which, by construction, appears on NO world-ledger entry. Absent on preTool/onInput. */
  attemptedThisTurn?: ReadonlyArray<{ name: string; args: unknown }>;
  /** SAME-STEP siblings emitted EARLIER in this model step and still in flight (admitted by their
   *  preTool guards but not yet in `observed` — a domain tool lands in `observed` only in
   *  afterToolCall, AFTER execute). The AI SDK dispatches a step's calls concurrently, so two
   *  destructive calls in one step are both gated before either enters `observed`; without this a
   *  same-step throttle is blind. Populated synchronously by the backend, EXCLUDING the current call.
   *  ONLY `destructiveThrottle` reads it — every other guard sees the unchanged `observed`, so the
   *  same-step visibility is a zero-blast-radius augmentation. Absent on backends that dispatch one
   *  call per step (alien) — treat as empty. */
  siblingCallsThisStep?: ObservedCall[];
  /** The judge seam, threaded from the runtime options. Present iff the host registered one or the
   *  backend resolved one; ONLY `llmCheck` guards read it — every deterministic guard ignores it, so
   *  the augmentation is zero-blast-radius. Absent while an `llmCheck` is installed is caught loud at
   *  conversation start (`assertJudgePresent`), never mid-turn. */
  judge?: Judge;
  /** The consent challenges the CURRENT turn's incoming message consumed — the WHOLE licensing surface
   *  for a destructive act. A guard asks whether one of these is about the call in front of it, and
   *  never reads text or history to decide: the runtime already did the reading, once, at turn start.
   *  Absent ⇒ empty, which is no consent. */
  consent?: ReadonlyArray<Challenge>;
  /** The per-call judge TIMEOUT (ms), threaded from the registration seam beside `judge`. An llmCheck
   *  races the judge against this deadline: a HUNG (never-settling) judge would otherwise hang the turn,
   *  and `failMode` only fires on a settled rejection — so on expiry the guard treats the judge as
   *  unreachable and applies `failMode`. Absent ⇒ the guard's own default. */
  judgeTimeoutMs?: number;
  /** The domain's own render vocabulary (`renderClaim` / `outcomes`), threaded from the contract beside
   *  {@link judge}. A guard that composes a judging prompt renders the turn's operation record and the
   *  session list through it, so the judge reads the operations in the words the user saw them in.
   *
   *  It rides the ctx because it is RUN-scoped exactly as the judge is — a host may hand the runtime a
   *  different contract than the spec carries — while a guard is built once per spec. Absent ⇒ the
   *  engine's neutral defaults, under which a claim declared with a domain outcome word the engine does
   *  not know renders no operation line at all. */
  renderOpts?: RenderOpts;
}

/** A typed guard instance: deterministic gate + LLM-facing explanation (the prose+check pairing). */
export interface Guard {
  kind: string;
  dim: Dim;
  check(ctx: GuardCtx): string | null | Promise<string | null>;
  prose(): string;
  /** Optional STRUCTURAL introspection a kind may attach for static analyzers (e.g. the eval lint):
   *  `before` (requiresBefore's dep list), `requiredStrings` (strings a reply guard demands).
   *  Purely additive metadata — never read by the runtime's enforcement path. */
  meta?: { before?: string[]; requiredStrings?: string[] } & Record<string, unknown>;
}

/** A deterministic egress TRANSFORM on the final reply (no LLM call), applied before the onReply checks. */
export interface ReplyMutator {
  kind: string;
  apply(reply: string, ctx: GuardCtx): string;
}

/** A producer→consumer flow edge, rendered as a FLOW line in the trunk. */
export interface SpatialEdge {
  from: string;
  to: string;
}

/**
 * A guard's `check()` / `prose()` (or a mutator's `apply()`) THREW.
 *
 * THE POLICY ("a guard that throws is an AUTHOR BUG"):
 * a throwing guard is neither a deny nor an allow; it is broken code. The runtime therefore
 *   (a) NEVER swallows it — catching it and returning `null` would silently delete a safety gate
 *       (the no-op-guard class this audit exists to close), and returning the message as a `reason`
 *       would invent a deny the author never wrote;
 *   (b) NEVER lets it be mistaken for a model/provider failure — `runSpecConversation`'s per-turn
 *       `catch` records ordinary errors as an "error turn" and moves on, which would bury an author
 *       bug inside eval output as if the MODEL had failed;
 *   (c) ALWAYS attributes it — the raw stack says only "Cannot read properties of undefined"; this
 *       wrapper names the hook, the binding id, the guard kind and (for tool hooks) the tool, so the
 *       author knows which of ~30 bindings is broken.
 * Net: it propagates OUT of `runSpecConversation`, loud and addressed. `AgentSpecBase.addGuard` /
 * `addMutator` install the wrapper, so every guard reached through a spec is covered regardless of
 * which layer calls it (backend hook, trunk renderer, or a host's own code).
 */
export class GuardExecutionError extends Error {
  readonly hook: string;
  readonly bindingId: string;
  readonly guardKind: string;
  readonly phase: 'check' | 'prose' | 'apply';
  readonly tool?: string;
  constructor(opts: {
    hook: string;
    bindingId: string;
    guardKind: string;
    phase: 'check' | 'prose' | 'apply';
    tool?: string;
    cause: unknown;
  }) {
    const where = opts.tool ? ` (tool "${opts.tool}")` : '';
    super(
      `Guard "${opts.bindingId}" (kind ${opts.guardKind}, hook ${opts.hook}${where}) THREW in ${opts.phase}(): ` +
        `${opts.cause instanceof Error ? opts.cause.message : String(opts.cause)}. ` +
        'A guard must return a deny string or null — never throw. Fix the guard; the runtime will not guess.',
      { cause: opts.cause },
    );
    this.name = 'GuardExecutionError';
    this.hook = opts.hook;
    this.bindingId = opts.bindingId;
    this.guardKind = opts.guardKind;
    this.phase = opts.phase;
    if (opts.tool) this.tool = opts.tool;
  }
}
