/** The L1 card types: the authoring guard shape, the limits, and the compiled forms
 *  the machine runs on. Types and constants only — no logic. */
import type { Act, InputCtx, CallCtx, ResultCtx, ReplyCtx, InstalledGuard, OwedRead } from '../contract/vocabulary.js';
import type { EngineSentenceKey, LlmParams, Reason, ResolvedWording, Rewrite, Status, SurfaceFacts } from '../contract/vocabulary.js';

export type { LlmParams, Rewrite } from '../contract/vocabulary.js';

/** CARD 1 — one agent = one AgentSpec. Everything about HOW THIS DESK BEHAVES. */
export interface AgentSpec {
  /** The agent's name — records, errors, the exam, the server's /v1/models row. Required. */
  name: string;
  /** Who this agent is; the first prompt line. Required — the contract carries NO persona. */
  persona: string;
  /** This agent's lane: tool NAMES from the surface. Omitted = every surface tool. */
  tools?: readonly string[];
  /** Other lanes, for hand-offs: agent name → what that desk handles. Omitted = single-agent domain. */
  teammates?: Readonly<Record<string, string>>;
  /** Guards about how THIS desk works. Highest priority. Omitted = []. */
  guards?: readonly Guard[];
  /** The model's parameters, merged PER FIELD over the target's declared defaults. */
  llmParams?: LlmParams;
  /** This desk's ceilings, merged PER FIELD over the contract's limits — the spec wins. */
  limits?: Limits;
}

/** Disclosure for one tool — sentences, not code. Slots are {alias.path} over
 *  engine-performed reads. */
export interface Disclosure {
  /** Reads the ENGINE performs itself on the held call's own args: alias → read tool
   *  (an args map when the read's arg names differ from the held call's). Omitted = {}. */
  needs?: Readonly<Record<string, string | { readonly tool: string;
    readonly args: Readonly<Record<string, string>> }>>;
  /** Before-tense, shown on the consent question. Omitted = engine sentence from the label. */
  before?: string;
  /** After-tense: the record line once the act ran. Omitted = engine sentence. */
  after?: string;
  /** Standing sentence in later turns while the act stays relevant. Omitted = none. */
  later?: string;
}

/** CARD 2 — everything conversation-global = one DomainContract. */
export interface DomainContract {
  /** The domain's name. Required. */
  name: string;
  /** Shared business tone, one sentence — never a persona. Omitted = none. */
  voice?: string;
  /** Domain truths stated in every agent's prompt. Omitted = []. */
  facts?: readonly string[];
  /** Guards about TOOLS and the whole conversation. Run after spec guards. Omitted = []. */
  guards?: readonly Guard[];
  /** Per-tool disclosure sentences, three tenses, keyed by tool name. */
  disclosure?: Readonly<Record<string, Disclosure>>;
  /** Rewrites of the outgoing reply — a guard decides, a rewrite rewrites. Omitted = []. */
  rewrites?: readonly Rewrite[];
  /** THE ONE HOME of what is secret. Field names or dotted paths, masked at every
   *  seam; the object form picks 'omit'. Omitted = []. */
  secrets?: readonly (string | { readonly path: string; readonly mode: 'omit' | 'mask' })[];
  /** Named overrides for engine sentences and status words. Omitted = the engine pack. */
  wording?: Wording;
  /** Bounded-everything ceilings. Omitted = the engine defaults. */
  limits?: Limits;
}

/** THE ONE GUARD SHAPE — both cards, three strengths of the same thing:
 *    prose-only      { rule }                  the declared residue
 *    deterministic   { rule, deny }            a pure function refuses
 *    judged          { rule, judgeQuery }      only when no check can decide
 *  `deny` and `judgeQuery` are exclusive; declaring both throws at construction. */
export interface Guard {
  /** Unique among the card's guards — the census keys on it. Required. */
  name: string;
  /** THE sentence — the prompt, the denial, and guards() all print this one string.
   *  Present/imperative, never accusatory. Required. */
  rule: string;
  /** Exact declared tool names this guard covers (Set membership, never substring).
   *  Omitted = the whole conversation. */
  tool?: string | readonly string[];
  /** REQUIRED — the phase of the turn this guard runs in. Factories fill it themselves;
   *  only a hand-written guard types it. */
  on: 'input' | 'preTool' | 'postTool' | 'reply';
  /** Pure check over the frozen typed ctx; returns the specific detail for THIS violation
   *  (appended to `rule` in the denial), null = allow. */
  deny?(ctx: InputCtx | CallCtx | ResultCtx | ReplyCtx): string | null;
  /** A yes/no question answered by the session's OWN model. Its phase is 'reply' —
   *  construction validates. */
  judgeQuery?: string;
  /** What an UNREADABLE judged answer does. Only beside judgeQuery. Omitted = 'denyOnFails'. */
  judgePolicy?: 'passOnFails' | 'denyOnFails';
}

/** Named overrides for engine sentences and the user-facing status words. Omitted
 *  keys keep the engine pack. */
export interface Wording {
  readonly status?: Readonly<Partial<Record<Status | Reason, string>>>;
  readonly sentence?: Readonly<Partial<Record<EngineSentenceKey, string>>>;
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

export const DEFAULT_LIMITS: Required<Limits> =
  { calls: 10, destructive: 1, retries: 2, questionTurns: 3 };

/** A guard as the Rulebook runs it: the census row plus its executable checks.
 *  Method syntax on the checks lets a factory bind a phase-narrowed ctx. */
export interface CompiledGuard extends InstalledGuard {
  /** Non-null = the specific violation detail; the denial prints rule + detail. */
  deny(ctx: InputCtx | CallCtx | ResultCtx | ReplyCtx): string | null;
  /** Non-null = reads the engine owes BEFORE this call may be re-checked. */
  owe?(ctx: CallCtx): readonly OwedRead[] | null;
  /** Non-null = the id of the earlier act whose result answers this duplicate call. */
  restate?(ctx: CallCtx): string | null;
  /** Non-null = the consent sentence: the call holds for approval; the ConsentDesk
   *  owns the question lifecycle — the guard only declares. */
  hold?(ctx: CallCtx): string | null;
}

/** The prompt raw material an agent compiles to. */
export interface PromptParts { readonly persona: string;
                               readonly voice: string | null;
                               readonly facts: readonly string[] }

/** One compiled secret path; 'mask' replaces the value with ****, 'omit' drops the key. */
export interface MaskKey { readonly path: readonly string[]; readonly mode: 'omit' | 'mask' }

/** One tool's compiled disclosure: needs recipes normalized to the object form
 *  (read arg → held arg), the three tense sentences resolved or null. */
export interface DisclosureBinding {
  readonly needs: Readonly<Record<string, { readonly tool: string;
    readonly args: Readonly<Record<string, string>> }>>;
  readonly before: string | null;
  readonly after: string | null;
  readonly later: string | null;
}

/** The frozen compiled agent the Engine runs — AgentFactory is its one birthplace;
 *  guards arrive priority-ordered: spec → contract → consent → the engine floor. */
export interface CompiledAgent { readonly guards: readonly CompiledGuard[];
                                 readonly judged: readonly InstalledGuard[];
                                 readonly rewrites: readonly Rewrite[];
                                 readonly limits: Required<Limits>;
                                 readonly maskKeys: readonly MaskKey[];
                                 readonly disclosureBindings: Readonly<Record<string, DisclosureBinding>>;
                                 readonly wording: ResolvedWording;
                                 readonly promptParts: PromptParts;
                                 readonly facts: SurfaceFacts }

/** Narrowing helpers for hand-written guards: each phase receives exactly one ctx shape. */
export type GuardCtx = InputCtx | CallCtx | ResultCtx | ReplyCtx;
export type { Act };
