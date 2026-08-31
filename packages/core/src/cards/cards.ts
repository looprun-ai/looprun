/** The L1 card types: the authoring guard shape, the limits, and the compiled forms
 *  the machine runs on. Types and constants only — no logic.
 *
 *  THE WHOLE AUTHORING SURFACE IS TWO CARDS. An AgentSpec says how one desk behaves;
 *  a DomainContract says what the business is. Everything else an author writes is
 *  the world card, where the block a tool sits in IS its effect declaration — a tool
 *  under `destructive` needs no other field for the engine to hold it for consent. */
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
  /** The other desks by name, each with its own description. The HOUSE fills this when it
   *  builds the desks — it is never authored, because it would be a second copy of what those
   *  desks already say about themselves. */
  teammates?: Readonly<Record<string, string>>;
  /** What this desk does, in the operator's words — every act it performs, as verbs. The
   *  front desk routes on it and every other desk reads it to know who to hand off to, so
   *  it is written long: each verb is one more message the desk can be chosen for.
   *  Required on every desk of a multi-desk subject; never on a single desk. */
  description?: string;
  /** The same desk in a handful of words — what a person at the counter would call it.
   *  The house's own refusal is built from these, so an operator asking for something no
   *  desk performs hears what the house does cover, and never a label like 'desk2'.
   *  Required on every desk of a multi-desk subject; never on a single desk. */
  summary?: string;
  /** Guards about how THIS desk works. Highest priority. Omitted = []. */
  guards?: readonly Guard[];
  /** THE JUDGED PASS, opted into by the desk that pays for it: one extra model call
   *  per judged guard on every reply the guard is scoped to. Omitted = this desk asks
   *  no judge, and a judged guard on its card is carried and never asked. */
  judgePass?: boolean;
  /** The model's parameters, merged PER FIELD over the target's declared defaults. */
  llmParams?: LlmParams;
  /** This desk's ceilings, merged PER FIELD over the contract's limits — the spec wins. */
  limits?: Limits;
}

/** Disclosure for one tool — sentences, not code. Slots are {alias.path} over
 *  engine-performed reads. */
export interface Disclosure {
  /** Reads the ENGINE performs itself on the held call's own args: alias → read tool
   *  (an args map when the read's arg names differ from the held call's). A `pick`
   *  binds the alias to ONE row of a list-valued read — the row of `list` whose `by`
   *  field equals the held call's `key` argument; no match refuses through the empty
   *  sentence, as any unanswered slot does. Omitted = {}. */
  needs?: Readonly<Record<string, string | { readonly tool: string;
    readonly args: Readonly<Record<string, string>>;
    readonly pick?: { readonly list: string; readonly by: string;
                      readonly key: string } }>>;
  /** Before-tense, shown on the consent question. Omitted = engine sentence from the label. */
  before?: string;
  /** After-tense: the record line once the act ran. Omitted = engine sentence. */
  after?: string;
  /** Standing sentence in later turns while the act stays relevant. Omitted = none. */
  later?: string;
  /** Refuse the call outright when its named arg exceeds what an owed read
   *  answered: arg = the call's own arg, at = an {alias.path} over the needs
   *  reads, refusal = the refusal sentence, slots included. Omitted = no cap. */
  cap?: { readonly arg: string; readonly at: string; readonly refusal: string };
  /** The refusal sentence when a declared tense finds no value in the reads —
   *  the record carries nothing for this act to act on. Slots {args.*} only.
   *  Omitted = the engine's plain sentence. */
  empty?: string;
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
   *  construction validates. An answer the engine cannot read decides nothing, so the
   *  rule stands unmet and the reply is corrected. */
  judgeQuery?: string;
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
  /** Non-null = the coded argument and the options it may carry: the call is refused
   *  and the operator is asked to choose; the ChoiceDesk owns the question lifecycle
   *  and mints its code — the guard only declares. */
  choose?(ctx: CallCtx): { readonly arg: string; readonly options: readonly string[] } | null;
  /** The same declaration standing still: the argument this guard gates and the options
   *  it accepts, readable without a call. A case script is validated against it. */
  choice?: { readonly arg: string; readonly options: readonly string[] };
}

/** The prompt raw material an agent compiles to. */
export interface PromptParts { readonly persona: string;
                               readonly voice: string | null;
                               readonly facts: readonly string[];
                               /** The other desks by name, each with its own description —
                                *  composed by the house, never authored twice. */
                               readonly teammates: Readonly<Record<string, string>> | null }

/** One compiled secret path; 'mask' replaces the value with ****, 'omit' drops the key. */
export interface MaskKey { readonly path: readonly string[]; readonly mode: 'omit' | 'mask' }

/** A declared judged guard as the Judge runs it: the census row plus its question. */
export interface JudgedGuard extends InstalledGuard { readonly judgeQuery: string }

/** One tool's compiled disclosure: needs recipes normalized to the object form
 *  (read arg → held arg), the three tense sentences resolved or null, and the
 *  optional cap — refuse the call outright when its named arg exceeds what an
 *  owed read answered, saying the declared sentence with the record's figures. */
export interface DisclosureBinding {
  readonly needs: Readonly<Record<string, { readonly tool: string;
    readonly args: Readonly<Record<string, string>>;
    readonly pick?: { readonly list: string; readonly by: string;
                      readonly key: string } }>>;
  readonly before: string | null;
  readonly after: string | null;
  readonly later: string | null;
  readonly cap: { readonly arg: string; readonly at: string;
                  readonly refusal: string } | null;
  readonly empty: string | null;
}

/** The frozen compiled agent the Engine runs — AgentFactory is its one birthplace;
 *  guards arrive priority-ordered: spec → contract → consent → the engine floor. */
export interface CompiledAgent { readonly guards: readonly CompiledGuard[];
                                 readonly judged: readonly JudgedGuard[];
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
