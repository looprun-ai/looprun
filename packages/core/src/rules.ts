/**
 * @looprun-ai/core — guard TYPES (framework-free).
 *
 * The governance primitives the agentspec skill authors: a deterministic `check` paired with an
 * LLM-facing `prose`, keyed on tool args / world state / observed calls AND the full conversation
 * history — the user's own text included. The "magnet firewall" (guards blind to user text) is
 * RETIRED (2026-08-02 ruling): guards are deterministic code, so "influence" does not apply; what
 * the firewall protected decomposes into laws with better owners — intent-based tool routing stays
 * banned as a LOOP-shaping law, and text pattern-matching stays banned by the no-regex law in the
 * config surface. (Full doctrine rewrite: Task 4.) The world is an opaque, host-injected seam
 * (`AgentWorld`); a domain reads its own accessors through the index signature — the package itself
 * is domain-neutral.
 */

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
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>;
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
   *  from the world's `toolCalls[].tookEffect` by the backend. Lets a guard tell "an ACTION succeeded" from
   *  "a READ succeeded" — noFalseFailureClaim keys on it so it does NOT veto an honest "I cannot do X /
   *  no record found" reply on a read-only turn (over-firing there costs a redrive and then the exhaustion closure). */
  tookEffect?: boolean;
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
  /** Calls a guard VETOED before execution — the world never saw them. */
  attemptedCalls: ReadonlyArray<{ name: string; args: unknown }>;
  /** The turn's recovery/correction log (guard fires, redrives, superseded terminals, …). */
  guardEvents: ReadonlyArray<string>;
}

/** Everything a guard predicate may read — including, since the firewall was retired (2026-08-02),
 *  the user's own text (`userText` this turn; `history[].userText` for prior turns). */
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
   *  `onInput` reads it as the real incoming text; it is the field that replaced the hard-coded
   *  `args: {}`. */
  userText: string;
  /** The full PRIOR conversation, turn-structured and read-only. Available to EVERY hook. The
   *  CURRENT (in-flight) turn is NOT here — its user text is `userText`, its calls are `observed`. */
  history: ReadonlyArray<HistoryTurn>;
  reply?: string;
  producedThisTurn?: string[];
  attachmentsThisTurn?: string[];
  result?: unknown;
  notes?: string[];
  /** SAME-STEP siblings emitted EARLIER in this model step and still in flight (admitted by their
   *  preTool guards but not yet in `observed` — a domain tool lands in `observed` only in
   *  afterToolCall, AFTER execute). The AI SDK dispatches a step's calls concurrently, so two
   *  destructive calls in one step are both gated before either enters `observed`; without this a
   *  same-step throttle is blind. Populated synchronously by the backend, EXCLUDING the current call.
   *  ONLY `destructiveThrottle` reads it — every other guard sees the unchanged `observed`, so the
   *  same-step visibility is a zero-blast-radius augmentation. Absent on backends that dispatch one
   *  call per step (alien) — treat as empty. */
  siblingCallsThisStep?: ObservedCall[];
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
