/**
 * @looprun-ai/core — guard TYPES (framework-free).
 *
 * The governance primitives the agentspec skill authors: a deterministic `check` paired with an
 * LLM-facing `prose`, keyed only on tool args / world state / observed calls — NEVER the user
 * text (the magnet firewall: guards must not scope behavior by user intent). The world is an
 * opaque, host-injected seam (`AgentWorld`); a domain reads its own accessors through the index
 * signature — the package itself is domain-neutral.
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

/** One tool call observed this CONVERSATION. Magnet-safe: no user text. */
export interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  turnIndex: number;
  resultFlags?: { requiresConfirmation?: boolean };
  /** Did this call MUTATE the world (a write that took effect), vs a pure read / a refused write? Threaded
   *  from the world's `toolCalls[].tookEffect` by the backend. Lets a guard tell "an ACTION succeeded" from
   *  "a READ succeeded" — noFalseFailureClaim keys on it so it does NOT veto an honest "I cannot do X /
   *  no record found" reply on a read-only turn (bankdesk B1: it over-fired → redrive → exhaustion). */
  tookEffect?: boolean;
}

/** Everything a guard predicate may read — NEVER the user's text. */
export interface GuardCtx {
  args: Record<string, unknown>;
  tool?: string;
  world: AgentWorld;
  observed: ObservedCall[];
  turnIndex: number;
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
 * THE POLICY (2026-07-20, runtime-consistency audit — "a guard that throws is an AUTHOR BUG"):
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
