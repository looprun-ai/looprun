/**
 * @looprun-ai/core — guard TYPES (framework-free).
 *
 * The governance primitives the agentspec skill authors: a deterministic `check` paired with an
 * LLM-facing `prose`, keyed only on tool args / world state / observed calls — NEVER the user
 * text (the magnet firewall: guards must not scope behavior by user intent). The world is an
 * opaque, host-injected seam (`AgentWorld`); domain guards narrow it (e.g. `MediaWorld`) — the
 * package itself is domain-neutral.
 */

/** The five enforcement dims (taxonomy metadata; the structural key is the hook it maps to). */
export type Dim = 'spatial' | 'input' | 'run' | 'output' | 'behavior';

/**
 * The read/exec world seam the runtime + guards depend on — host-injected, opaque to the package.
 * The core methods the runtime calls are typed; domain-specific accessors (hasMediaLabel,
 * imageQuotaRemaining, hasVisualStyle, …) flow through the index signature so a domain's
 * guards/theme can read them without the package knowing the domain.
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

/** The media-label capability a media domain's world exposes (narrowed by label guards). */
export interface MediaWorld {
  hasMediaLabel(label: string): boolean;
  mediaLabels(): string[];
}

/** One tool call observed this CONVERSATION. Magnet-safe: no user text. */
export interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  turnIndex: number;
  resultFlags?: { requiresConfirmation?: boolean };
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
