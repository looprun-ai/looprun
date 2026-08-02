/**
 * @looprun-ai/core runtime — the governed-TURN state machine (framework-free).
 *
 * Everything deterministic about one turn lives here; a backend (e.g. @looprun-ai/mastra) supplies only
 * the framework glue: how tools are wired, how the LLM is called, and ONE async `redrive` callback
 * that re-generates text with tools disabled.
 *
 * The reply pipeline (finalizeReply): mutators → onReply checks → bounded NO-TOOLS redrive →
 * deterministic honest-abstain closure. The redrive is a plain text re-generation with the
 * correction appended — NEVER a framework retry that re-runs the whole generation (that re-executes
 * side-effecting tools; measured ~100× slower).
 */
import { resolveGuards, resolveMutators } from '../spec.js';
import type { AgentSpec, ChainSpec } from '../spec.js';
import type { DomainContract } from '../trunk.js';
import type { AgentWorld, Guard, GuardCtx, ObservedCall } from '../rules.js';
import { recordVeto, type TurnLedger } from './ledger.js';
import { isTerminal } from './terminal.js';

export interface ReplyViolation {
  guard: Guard;
  reason: string;
}

export type PreToolVerdict =
  | { verdict: 'allow' }
  | { verdict: 'deny'; reason: string; guard: Guard; mustCloseTurn: boolean };

/**
 * The result a VETOED call returns to the model.
 *
 * A tool result the model reads can mean two very different things: the WORLD refused (a fact about
 * the business, which the model should report to the user) or a GUARD corrected it (the call never
 * reached the world, and the model should fix and retry). An untagged `{success:false, error}` is
 * the same shape for both, so harness coaching text reads as if the business had said it — and is
 * one quote away from the user.
 *
 * The envelope carries the discriminator, the guard `kind` that produced it, the correction under
 * its own key, and a STRUCTURAL `mustCloseTurn` flag instead of a silently-escalating prose suffix.
 * `success:false` + `error` are preserved so {@link resultOk} and any host reading `error` keep
 * working.
 */
export interface GovernanceVeto {
  success: false;
  /** THE discriminator: this result was produced by the guard layer; the world was never called. */
  source: 'governance';
  /** The guard kind that vetoed — attribution for logs and tests without parsing prose. */
  guard: string;
  /** What the model must fix, verbatim from the guard. */
  correction: string;
  /** Same text as `correction`, for hosts and models that read `error`. */
  error: string;
  /** Set once the model is looping on vetoes: stop calling domain tools and close the turn. */
  mustCloseTurn?: true;
}

/** Build the veto result the model sees. Pure, so the envelope is unit-testable. */
export function governanceVeto(guardKind: string, reason: string, mustCloseTurn: boolean): GovernanceVeto {
  // The escalation names NO terminal tool: how to close a turn is the protocol's job, and a raw
  // tool name inside a tool result is one copy-paste away from the user.
  const correction = mustCloseTurn
    ? `${reason} STOP: do not call any more domain tools this turn. Close the turn NOW with your final ` +
      'user-facing message, reporting only what actually succeeded.'
    : reason;
  return {
    success: false,
    source: 'governance',
    guard: guardKind,
    correction,
    error: correction,
    ...(mustCloseTurn ? { mustCloseTurn: true as const } : {}),
  };
}

/** Run the preTool guards for one candidate call. On deny, the veto is recorded in the ledger. */
export async function evaluatePreTool(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  tool: string,
  args: Record<string, unknown>,
): Promise<PreToolVerdict> {
  const guards = resolveGuards(spec.guards.preTool, tool);
  // SAME-STEP visibility (before the guard await, synchronously): snapshot the siblings admitted
  // EARLIER in this step, then register self so a LATER same-step sibling sees this call. The model
  // runtime dispatches a step's calls concurrently but starts them in emission order up to the first
  // await, so this ordering is deterministic. `selfEntry` is reconciled out when the result is
  // recorded (now in `observed`) or removed on the veto path just below (it never ran).
  const siblingCallsThisStep = [...ledger.inFlightCalls];
  const selfEntry: ObservedCall = { name: tool, args, ok: true, turnIndex: ledger.turnIndex };
  ledger.inFlightCalls.push(selfEntry);
  const gctx: GuardCtx = {
    args,
    tool,
    world,
    observed: ledger.observed,
    turnIndex: ledger.turnIndex,
    userText: ledger.currentUserText,
    history: ledger.history,
    attachmentsThisTurn: ledger.attachments,
    siblingCallsThisStep,
  };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      const selfIx = ledger.inFlightCalls.indexOf(selfEntry);
      if (selfIx >= 0) ledger.inFlightCalls.splice(selfIx, 1);
      recordVeto(ledger, tool, args, `${g.dim}:${g.kind}:${tool}`);
      // 2nd+ consecutive veto: the model is looping. The backend wraps `reason` in the veto
      // envelope, which carries the escalation both as prose and as a structural flag.
      return { verdict: 'deny', reason, guard: g, mustCloseTurn: ledger.vetoStreak >= 2 };
    }
  }
  return { verdict: 'allow' };
}

/** Run the onInput guards (before any LLM call). Returns the refusal reason, or null to proceed. */
export async function evaluateOnInput(spec: AgentSpec, ledger: TurnLedger, world: AgentWorld): Promise<string | null> {
  const guards = resolveGuards(spec.guards.onInput);
  // onInput: `args` is empty (no tool), but the guard now sees the REAL incoming user text via
  // `userText` (this replaces the old hard-coded `args: {}` blindness) plus the prior `history`.
  const gctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: ledger.turnIndex, userText: ledger.currentUserText, history: ledger.history };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      ledger.turnCorrections.push(`onInput:${g.kind}`);
      return reason;
    }
  }
  return null;
}

/** Apply the deterministic egress mutators (e.g. jargonScrub) to the reply text. */
function applyMutators(spec: AgentSpec, ledger: TurnLedger, world: AgentWorld, text: string): string {
  let out = text;
  for (const m of resolveMutators(spec.guards.onReplyMutate)) {
    const mctx: GuardCtx = {
      args: {},
      world,
      observed: ledger.observed,
      turnIndex: ledger.turnIndex,
      userText: ledger.currentUserText,
      history: ledger.history,
      reply: out,
      producedThisTurn: ledger.producedThisTurn,
    };
    const next = m.apply(out, mctx);
    if (next !== out) {
      ledger.turnCorrections.push(`mutate:${m.kind}`);
      out = next;
    }
  }
  return out;
}

/** Run the onReply guard checks against a candidate reply. */
async function checkReply(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  text: string,
): Promise<ReplyViolation[]> {
  const rctx: GuardCtx = {
    args: {},
    world,
    observed: ledger.observed,
    turnIndex: ledger.turnIndex,
    userText: ledger.currentUserText,
    history: ledger.history,
    reply: text,
    producedThisTurn: ledger.producedThisTurn,
    attachmentsThisTurn: ledger.attachments,
    notes: ledger.turnCorrections,
  };
  const out: ReplyViolation[] = [];
  for (const g of resolveGuards(spec.guards.onReply)) {
    const r = await g.check(rctx);
    if (r) out.push({ guard: g, reason: r });
  }
  return out;
}

/** The output of {@link enforcePostTool}: LLM-facing `output:${kind}:${tool}` correction tags (for the
 *  observed-call ledger / a turn's `recoveryEvents`) plus the `{ guard, reason }` pairs that JOIN the
 *  onReply violation set — so the SAME bounded no-tools redrive relays each correction to the model. The
 *  tool has already executed, so a failing result invariant can only be reported/repaired in the reply,
 *  never vetoed. */
export interface PostToolEnforcement {
  corrections: string[];
  violations: ReplyViolation[];
}

/**
 * OUTPUT-dim (postTool) enforcement — the previously-dead `spec.guards.postTool` hook. Runs each
 * already-resolved result-invariant guard against `ctx` (whose `ctx.result` carries the tool RESULT) and
 * collects, for every guard that FAILS, (a) an `output:${kind}:${tool}` correction tag and (b) the
 * `{ guard, reason }` pair. PURE: no I/O, no ledger mutation — the caller records the corrections and
 * joins the violations into the reply-violation set. `guards === []` ⇒ empty arrays (the zero-diff path).
 */
export async function enforcePostTool(guards: Guard[], ctx: GuardCtx): Promise<PostToolEnforcement> {
  const corrections: string[] = [];
  const violations: ReplyViolation[] = [];
  for (const g of guards) {
    const reason = await g.check(ctx);
    if (reason) {
      corrections.push(`output:${g.kind}:${ctx.tool}`);
      violations.push({ guard: g, reason });
    }
  }
  return { corrections, violations };
}

/** The redrive user message a backend sends for a bounded NO-TOOLS re-generation. */
export function redriveMessage(violations: ReplyViolation[]): string {
  const correction = violations.map((v) => `- ${v.reason}`).join('\n');
  return `Revise your last reply to the user:\n${correction}\nReply now in the user's language. Do NOT call a tool.`;
}

/**
 * The built-in honest-abstain closure: a pure function of verified observations.
 *
 * `okTools` is read as a BOOLEAN — "did anything actually land this turn?" — and never interpolated.
 * A tool identifier is internal vocabulary: the user did not ask for `listItems`, they asked for
 * their items, and a runtime terminal (`replyToUser`) named in a delivered sentence is pure leakage.
 * The only nouns that reach the text are `produced`: labels the world itself issued for what it
 * created. Callers pass a DOMAIN-only `okTools` (see finalizeReply).
 */
export function defaultExhaustionReply(
  contract: DomainContract | undefined,
  world: AgentWorld,
  okTools: string[],
  produced: string[],
  violations: string[],
): string {
  if (contract?.exhaustionReply) return contract.exhaustionReply(world, okTools, produced, violations);
  return okTools.length
    ? `I completed part of this request${produced.length ? ` (${produced.join(', ')})` : ''}, but I could not safely finish the rest — how would you like to proceed?`
    : 'I could not complete this safely — nothing was changed. Could you rephrase or add detail?';
}

/**
 * The ENGINE-OWNED honest-abstain string — derived from the world ledger, so a no-effect probe is
 * NEVER announced as a done action. `okTools` is the set of tool names the turn touched; `writeTools`
 * are the ones that MUTATE. A name is announceable iff it is not a write, or some ledger entry under
 * it actually `tookEffect === true` — the exact defect this fixes: a hand-written closure announced a
 * probe (a write with `tookEffect: false`, which changed nothing) as a completed action.
 *
 * WIRING IS PENDING — the loader (`loadNormsConfig` in @looprun-ai/eval) does NOT yet wire this in as
 * the default contract exhaustionReply; the intent is that it will, closing the closure over the
 * domain's `writeTools`. Before that wiring lands there is a LEAK GATE to clear: this function
 * interpolates RAW tool names into the reply, so wiring must first map names → produced labels
 * (BACKLOG: "Abstain tool-name leak").
 */
export function buildHonestAbstain(world: AgentWorld, okTools: string[], writeTools: readonly string[]): string {
  const writes = new Set(writeTools);
  const announceable = okTools.filter(
    (name) => !writes.has(name) || world.toolCalls.some((t) => t.name === name && t.tookEffect === true),
  );
  return announceable.length
    ? `I completed part of this request (${announceable.join(', ')}), but I could not safely finish the rest — how would you like to proceed?`
    : 'I could not complete this safely — nothing was changed. Could you rephrase or add detail?';
}

/**
 * ── The TRUTH/SAFETY ↔ FORM frontier ──────────────────────────────────────────────────────────────
 *
 * The model composes the CORRECT answer inside a terminal's `text` arg, one onReply guard vetoes it —
 * often on FORM, not on truth — the bounded redrive fails to repair it, and the finalizer throws the
 * whole answer away for a generic stub that says nothing. Delivering a true answer that breaks a
 * presentational contract is strictly better for the user than that stub.
 *
 * This frontier is the ONLY thing that relaxes. A candidate that trips a TRUTH/SAFETY guard is NEVER
 * delivered — no exception, no scoring, no "fewest violations wins".
 *
 * FORM (salvageable): purely stylistic contracts — a shape rule about the reply, not about the world.
 * An omission or an awkward register misstates nothing; the mutators and the redrive already had
 * their chance at the polish.
 *
 * TRUTH/SAFETY (never delivered over): anything that can make the user believe something false about
 * what happened, or that bypasses a destructive-action protocol. That includes every guard whose
 * `dim` is an action/state dim (spatial | input | run | output) — those bind what the agent DID, not
 * how it phrased it — and every unknown kind: the frontier is an ALLOW-list, so a business-authored
 * guard the runtime has never seen defaults to TRUTH. Opting a new kind in is a deliberate edit here.
 */
const FORM_GUARD_KINDS: ReadonlySet<string> = new Set([
  'replySingleQuestion',
  'replyMaxOccurrences',
  'replyMustMention',
  'replyConfirmsLabels',
  'degenerationGuard',
]);

/** Behaviour-dim kinds that are TRUTH/SAFETY — listed explicitly so the allow-list above can never
 *  accidentally grow over one of them (belt-and-braces: they are not in FORM_GUARD_KINDS either). */
const TRUTH_GUARD_KINDS: ReadonlySet<string> = new Set([
  'noFabricatedSuccess',
  'destructiveClaimRequiresSuccess',
  'noFalseFailureClaim',
  'pendingConfirmMustAsk',
  'emptyReply',
]);

/** True when this violation is purely a FORM contract, so the candidate may still be delivered. */
function isFormViolation(g: Guard): boolean {
  if (g.dim !== 'behavior') return false; // action/state dims are TRUTH by construction
  if (TRUTH_GUARD_KINDS.has(g.kind)) return false;
  return FORM_GUARD_KINDS.has(g.kind); // allow-list: unknown kinds default to TRUTH (deny)
}

export interface FinalizedReply {
  text: string;
  exhausted: boolean;
  violations: string[];
}

/**
 * The whole reply pipeline: mutators → onReply checks → up to `maxRedrives` NO-TOOLS re-generations
 * (via the backend-supplied `redrive` callback) → deterministic exhaustion closure if still violating.
 */
export async function finalizeReply(
  spec: AgentSpec,
  contract: DomainContract | undefined,
  world: AgentWorld,
  ledger: TurnLedger,
  initialText: string,
  redrive: (message: string) => Promise<string>,
  maxRedrives: number,
): Promise<FinalizedReply> {
  let text = applyMutators(spec, ledger, world, initialText);

  let violations = await checkReply(spec, ledger, world, text);
  // OUTPUT-dim postTool violations + flowChain restates (accrued in the backend's afterToolCall / chain
  // pass) join the reply-violation set so the SAME bounded no-tools redrive relays their correction text —
  // a report/repair of an already-run result, never a veto. Empty ⇒ `violations` untouched (zero-diff).
  if (ledger.postToolViolations.length) violations = [...ledger.postToolViolations, ...violations];
  for (let r = 0; r < maxRedrives && violations.length; r++) {
    const next = await redrive(redriveMessage(violations));
    for (const v of violations) ledger.turnCorrections.push(`redrive:${v.guard.kind}`);
    if (next) text = next;
    violations = await checkReply(spec, ledger, world, text);
  }

  const finalViolations = violations.map((v) => v.guard.kind);
  if (finalViolations.length) {
    // Salvage-before-canned-closure (measured on the
    // eight-second-limit / zero-quota cells): when the turn DID produce a verified user-facing text —
    // the `text` arg of a SUCCESSFUL askUser/replyToUser call this turn — and that text itself passes
    // every onReply check, surface IT instead of the generic exhaustion closure. The violations that got
    // us here came from the generated reply (or postTool reports), not from this verified text; swallowing
    // correct content behind the canned fallback is the silent-filter deadlock's judge-facing twin.
    // Purity holds: the salvage is a verified observation (ok call arg), re-validated by the same
    // deterministic checks — never fabricated. postTool violations are NOT re-counted (they report an
    // already-run result; no choice of closure text can undo them).
    const lastAsk = [...ledger.observed].reverse().find(
      (o) => o.turnIndex === ledger.turnIndex && o.ok && (o.name === 'askUser' || o.name === 'replyToUser') && typeof o.args?.text === 'string' && (o.args.text as string).trim().length > 0,
    );
    if (lastAsk) {
      const candidate = (lastAsk.args.text as string).trim();
      if (candidate === text.trim()) {
        ledger.turnCorrections.push('salvage-miss:same-text');
      } else {
        const candViolations = await checkReply(spec, ledger, world, candidate);
        if (candViolations.length === 0) {
          ledger.turnCorrections.push('exhaustion-salvage');
          return { text: candidate, exhausted: true, violations: finalViolations };
        }
        if (candViolations.every((v) => isFormViolation(v.guard))) {
          ledger.turnCorrections.push(`salvage:form-only:${candViolations.map((v) => v.guard.kind).join(',')}`);
          return { text: candidate, exhausted: true, violations: finalViolations };
        }
        ledger.turnCorrections.push(`salvage-miss:checks:${candViolations.map((v) => v.guard.kind).join(',')}`);
      }
    } else {
      ledger.turnCorrections.push('salvage-miss:no-terminal-observed');
    }
    // DOMAIN-only evidence. This list is the closure's answer to "what actually landed this turn",
    // and a turn-closing terminal is not that — it is the runtime's own delivery mechanism. The hooks
    // record every terminal in `observed` with ok:true (they must, so a same-step sibling's preTool
    // checks can see an askUser), so the filter belongs here, at the one place the ledger is read as
    // evidence for user-facing prose.
    const okTools = ledger.observed
      .filter((o) => o.turnIndex === ledger.turnIndex && o.ok && !isTerminal(o.name))
      .map((o) => o.name);
    const closure = spec.controls.exhaustionReply
      ? spec.controls.exhaustionReply(world, okTools, ledger.producedThisTurn, finalViolations)
      : defaultExhaustionReply(contract, world, okTools, ledger.producedThisTurn, finalViolations);
    ledger.turnCorrections.push('exhaustion-terminal');
    return { text: closure, exhausted: true, violations: finalViolations };
  }

  return { text, exhausted: false, violations: [] };
}

// ── flowChain completion (controls.chains) ────────────────────────────────────────────────────────

/**
 * Synthetic reply-accounting guard for an executed flowChain. NOT a real check (check ⇒ null, prose ⇒
 * ''): it only carries the restate `reason` (relayed by the shared no-tools redrive) and a `kind` so
 * `recoveryEvents` shows `redrive:chainRestate`. Reused across turns/chains — it holds no state.
 */
const CHAIN_RESTATE_GUARD: Guard = { kind: 'chainRestate', dim: 'behavior', check: () => null, prose: () => '' };

const chainRestateReason = (call: string): string =>
  `You also completed ${call} this turn — restate the outcome so the user knows; do not claim anything else.`;

/**
 * PURE per-chain trigger — the pass's decision function, extracted so it is unit-testable without a live
 * model. Fires iff (a) `after` was observed OK THIS turn, (b) `call` was NOT observed OK this turn, and
 * (c) `when` is absent or returns true. `when` is spec-authored business code — it reads ONLY
 * (world, observed), never the user text (the firewall). Evaluate it per-chain AT execution time, in
 * order: a 'direct' chain appends to `observed`, so a later chain sees the updated ledger.
 */
export function shouldFireChain(
  chain: ChainSpec,
  world: AgentWorld,
  observed: ObservedCall[],
  turnIndex: number,
): boolean {
  const afterOk = observed.some((o) => o.name === chain.after && o.ok && o.turnIndex === turnIndex);
  if (!afterOk) return false;
  const callDone = observed.some((o) => o.name === chain.call && o.ok && o.turnIndex === turnIndex);
  if (callDone) return false;
  if (chain.when && !chain.when(world, observed)) return false;
  return true;
}

/** The side-effecting seam the completion pass needs — injected so the pass is model-free/testable. The
 *  backend supplies the REAL guard hooks + a `forceLlmCall` that drives one pinned micro-generate. */
export interface ChainPassCtx {
  world: AgentWorld;
  /** The live per-turn ledger of observed calls (mutated by afterToolCall/forceLlmCall as chains run). */
  observed: ObservedCall[];
  turnIndex: number;
  /** Whether a terminal reply already exists (post-fallback) — gates the restate reply-accounting. */
  terminalReplyPresent: boolean;
  /** The run-level preTool veto hook — a chained call MUST still pass the preTool guards. */
  beforeToolCall: (a: { toolName: string; input: unknown }) => Promise<{ proceed: false; output: unknown } | void>;
  /** The run-level afterToolCall recorder (pushes the observed entry + runs postTool). */
  afterToolCall: (a: { toolName: string; input: unknown; output?: unknown }) => Promise<void> | void;
  /** 'llm' mode: force ONE micro-generate pinned to `call` (the model fills args), recording via the
   *  hooks. Injected so the pass never imports a model — the backend closes over agent.generate. */
  forceLlmCall: (call: string) => Promise<void>;
}

/** What the pass hands back to the backend (applied to the ledger by the caller). */
export interface ChainPassResult {
  /** turnCorrections to append: `chain:${call}` / `chain-vetoed:${call}` / `chain-failed:${call}`. */
  corrections: string[];
  /** Reply-accounting violations to JOIN into the ledger's postToolViolations (the redrive consumes them). */
  replyViolations: ReplyViolation[];
  /** extraCalls to add — llm-mode chains only (a real generate); a direct chain runs NO LLM. */
  llmCalls: number;
}

/**
 * The flowChain completion pass. For each declared chain, in order: skip unless {@link shouldFireChain};
 * then force the missing `call` — 'direct' via `world.exec` on the SAME guard-checked path a model call
 * takes (beforeToolCall veto → world.exec → afterToolCall record), or 'llm' via one pinned micro-generate.
 * A preTool veto ⇒ `chain-vetoed:${call}` (world NOT called); a call that never lands OK ⇒ `chain-failed`.
 * On success ⇒ `chain:${call}` + (iff a terminal reply already exists) a restate reply-accounting
 * violation, so the existing bounded no-tools redrive regenerates the reply to mention the outcome.
 *
 * ZERO-DIFF: `chains` absent/empty ⇒ returns empty corrections/violations + 0 llmCalls with NO work.
 */
export async function runChainCompletionPass(
  chains: ChainSpec[] | undefined,
  ctx: ChainPassCtx,
): Promise<ChainPassResult> {
  const corrections: string[] = [];
  const replyViolations: ReplyViolation[] = [];
  let llmCalls = 0;
  if (!chains?.length) return { corrections, replyViolations, llmCalls };
  for (const chain of chains) {
    if (!shouldFireChain(chain, ctx.world, ctx.observed, ctx.turnIndex)) continue;
    let landed = false;
    if (chain.mode === 'direct') {
      const args = typeof chain.args === 'function' ? chain.args(ctx.world, ctx.observed) : (chain.args ?? {});
      // Same execution path a model tool-call takes: preTool guards can VETO the chain (governance is
      // not bypassable), then world.exec, then afterToolCall records + runs postTool.
      const veto = await ctx.beforeToolCall({ toolName: chain.call, input: args });
      if (veto && veto.proceed === false) { corrections.push(`chain-vetoed:${chain.call}`); continue; }
      try {
        const output = await ctx.world.exec(chain.call, args);
        await ctx.afterToolCall({ toolName: chain.call, input: args, output });
      } catch { corrections.push(`chain-failed:${chain.call}`); continue; }
      landed = ctx.observed.some((o) => o.name === chain.call && o.ok && o.turnIndex === ctx.turnIndex);
    } else {
      // 'llm': ONE forced micro-generate — the model fills args (it MAY read the user text; the firewall
      // bars only deterministic guard/trigger code). A real generate → count it toward llmCalls.
      try { await ctx.forceLlmCall(chain.call); llmCalls++; }
      catch { corrections.push(`chain-failed:${chain.call}`); continue; }
      landed = ctx.observed.some((o) => o.name === chain.call && o.ok && o.turnIndex === ctx.turnIndex);
    }
    if (!landed) { corrections.push(`chain-failed:${chain.call}`); continue; }
    corrections.push(`chain:${chain.call}`);
    if (ctx.terminalReplyPresent) replyViolations.push({ guard: CHAIN_RESTATE_GUARD, reason: chainRestateReason(chain.call) });
  }
  return { corrections, replyViolations, llmCalls };
}
