/**
 * @looprun-ai/core runtime — the governed-TURN state machine (framework-free).
 *
 * Everything deterministic about one turn lives here; a backend (e.g. @looprun-ai/mastra) supplies only
 * the framework glue: how tools are wired, how the LLM is called, and ONE async `redrive` callback
 * that re-generates text with tools disabled.
 *
 * The reply pipeline (finalizeReply) works over the STRUCTURED respond payload (message + did + asked):
 * mutators (message only) → onReply checks (over the payload — claims guards read did, degeneration reads
 * message) → bounded NO-TOOLS redrive (the backend re-generates a whole respond payload) → salvage → a
 * deterministic exhaustion closure the engine DERIVES from the world ledger. The delivered text is
 * COMPOSED: `message` alone when `did` is empty, else `message` + the engine-rendered operation report of
 * the verified `did` — so the operational sentences the user reads come from ledger-grounded structure,
 * never the agent's free prose. The redrive is a re-generation with the correction appended — NEVER a
 * framework retry that re-runs the whole generation (that re-executes side-effecting tools; ~100× slower).
 */
import { resolveGuards, resolveMutators } from '../spec.js';
import type { AgentSpec, ChainSpec } from '../spec.js';
import type { DomainContract } from '../trunk.js';
import type { AgentWorld, Guard, GuardCtx, ObservedCall, Adjudicator } from '../rules.js';
import { recordVeto, type TurnLedger } from './ledger.js';
import { isTerminal } from './terminal.js';
import {
  deriveClaimsFromLedger,
  hasAskIntent,
  renderOperationReport,
  respondPayload,
  type RespondPayload,
  type TurnClaim,
} from './claims.js';

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
    adjudicator: ledger.adjudicator, adjudicatorTimeoutMs: ledger.adjudicatorTimeoutMs,
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
  const gctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: ledger.turnIndex, userText: ledger.currentUserText, history: ledger.history, adjudicator: ledger.adjudicator, adjudicatorTimeoutMs: ledger.adjudicatorTimeoutMs };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      ledger.turnCorrections.push(`onInput:${g.kind}`);
      return reason;
    }
  }
  return null;
}

/** True when the spec installs at least one ENABLED `llmCheck` guard on ANY hook. Scans the bindings by
 *  the runtime `kind`, so a renamed or wrapped guard is caught by what it IS, not by a source token. */
export function specInstallsLlmCheck(spec: AgentSpec): boolean {
  const hooks = [spec.guards.onInput, spec.guards.preTool, spec.guards.postTool, spec.guards.onReply];
  return hooks.some((arr) => arr?.some((b) => !b.disabled && b.guard.kind === 'llmCheck'));
}

/**
 * FAIL-LOUD-AT-START gate: a spec that installs an `llmCheck` with NO adjudicator registered is a wiring
 * bug that must surface at conversation start — never mid-turn, where it would masquerade as a model
 * failure or (worse) silently allow. The backend calls this once, before the first turn. A spec with no
 * llmCheck needs no adjudicator, so this is a no-op there (zero-diff).
 */
export function assertAdjudicatorPresent(spec: AgentSpec, adjudicator: Adjudicator | undefined): void {
  if (adjudicator) return;
  if (specInstallsLlmCheck(spec)) {
    throw new Error(
      `looprun: spec "${spec.id}" installs an llmCheck guard but no adjudicator was registered — ` +
        'pass the runtime an adjudicator ((rubric, ctx) => Promise<{ violation: string | null }>). ' +
        'llmCheck cannot run without it; failing now, at conversation start, rather than mid-turn.',
    );
  }
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
      did: ledger.did, asked: ledger.asked,
      adjudicator: ledger.adjudicator, adjudicatorTimeoutMs: ledger.adjudicatorTimeoutMs,
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
    did: ledger.did, asked: ledger.asked,
    // This turn's guard-vetoed attempts — so claimIsGrounded can ground a blocked/refused claim against
    // the call the guard stopped (invisible on the world ledger by construction).
    attemptedThisTurn: ledger.attemptedCalls,
    adjudicator: ledger.adjudicator, adjudicatorTimeoutMs: ledger.adjudicatorTimeoutMs,
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

/** The engine's exhaustion sentence when SOMETHING landed this turn (an effected write). The rendered
 *  operation report of the derived claims precedes it, so this is the honest tail. */
const EXHAUSTION_PARTIAL = 'I could not safely finish the rest — how would you like to proceed?';
/** The engine's exhaustion sentence when NOTHING landed (a probe-only / read-only / all-refused turn). */
const EXHAUSTION_NOTHING = 'I could not complete this safely — nothing was changed. Could you rephrase or add detail?';

/**
 * Compose the DELIVERED text from a verified payload: the `message` alone when `did` is empty, else the
 * `message` followed by the engine-rendered operation report of the (already ledger-grounded) `did`. The
 * report's wording comes from the domain's `renderClaim`/`outcomes` seam when present, else the engine
 * default. This is the ONE place the operational sentences enter the delivered text — from structure the
 * agent does not control, never from its free prose.
 */
function composeDelivery(payload: RespondPayload, contract?: DomainContract): string {
  if (!payload.did.length) return payload.message;
  const report = renderOperationReport(payload.did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes });
  if (!report.trim()) return payload.message;
  return payload.message.trim() ? `${payload.message}\n\n${report}` : report;
}

/** Zero-width / invisible-format characters that survive `.trim()` — U+200B (zero-width space), U+2060
 *  (word joiner), U+200C/U+200D (ZWNJ/ZWJ) and U+FEFF (BOM / zero-width no-break space). A message made
 *  of only these reads as non-empty to a naive `.trim().length` check. */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

/**
 * True when `text` carries nothing a user would read: empty after stripping zero-width/format characters
 * and trimming. This is the runtime's OWN floor for "did the agent actually say anything" — it does not
 * depend on the `respond` terminal schema's `minLength`, which is advisory only (mastra's
 * json-schema-zod conversion drops `minLength` at execution time, so it is never runtime-enforced).
 */
export function isBlankDelivery(text: string): boolean {
  return text.replace(ZERO_WIDTH_RE, '').trim().length === 0;
}

/**
 * The engine-DERIVED exhaustion closure, used when the redrive loop exhausts and no override seam is set.
 * The engine builds the TRUE claims from the world ledger ({@link deriveClaimsFromLedger}) — the model
 * never produced a groundable declaration, so the engine authors one it can stand behind — renders their
 * operation report, and appends one honest sentence keyed on whether anything actually landed. Returns
 * BOTH the text and the derived claims (the latter becomes the turn's verified `did` in history).
 */
function deriveExhaustionClosure(
  ledger: TurnLedger,
  writeTools: readonly string[],
  contract?: DomainContract,
): { text: string; did: TurnClaim[] } {
  const derived = deriveClaimsFromLedger(ledger.observed, ledger.turnIndex, writeTools, ledger.producedThisTurn);
  const report = renderOperationReport(derived, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes });
  const landed = derived.some((c) => c.outcome === 'success');
  const sentence = landed ? EXHAUSTION_PARTIAL : EXHAUSTION_NOTHING;
  const text = [report, sentence].filter((s) => s.trim()).join('\n\n');
  return { text, did: derived };
}

/**
 * The blank-delivery FLOOR — the backend-independent guarantee that replaces the deleted `emptyReply`
 * guard (SCG-T5's "structurally impossible" claim did not hold: the `respond` schema's `minLength` is
 * advisory only, mastra's json-schema-zod conversion drops it at runtime, and a zero-width message or a
 * mutator (e.g. `jargonScrub`) can still produce a blank composed delivery). Called at every point a
 * composed delivery text is about to leave {@link finalizeReply} — the clean path and both salvage
 * returns: when `text` is blank ({@link isBlankDelivery}), swap in the engine-derived exhaustion closure
 * (non-empty by construction — {@link deriveExhaustionClosure}) and mark the turn exhausted. `exhausted`
 * is fixed at `true` on the blank branch (routing to the exhaustion closure IS exhaustion); the caller
 * supplies what `exhausted` should read when `text` is NOT blank, since that differs by call site (the
 * clean path is `false`, salvage is `true`).
 */
function withBlankFloor(
  text: string,
  did: TurnClaim[],
  violations: string[],
  exhaustedIfNotBlank: boolean,
  ledger: TurnLedger,
  writeTools: readonly string[],
  contract: DomainContract | undefined,
): FinalizedReply {
  if (!isBlankDelivery(text)) return { text, exhausted: exhaustedIfNotBlank, violations, did };
  ledger.turnCorrections.push('exhaustion-blank-floor');
  const derived = deriveExhaustionClosure(ledger, writeTools, contract);
  ledger.did = derived.did;
  ledger.asked = false;
  return { text: derived.text, exhausted: true, violations, did: derived.did };
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
// The reply-TEXT FORM kinds (replySingleQuestion / replyMaxOccurrences / replyMentions) are DELETED
// (SCG-T5); `degenerationGuard` is the sole remaining salvageable FORM contract (an artifact-shape lint).
const FORM_GUARD_KINDS: ReadonlySet<string> = new Set([
  'degenerationGuard',
]);

/** Behaviour-dim kinds that are TRUTH/SAFETY — listed explicitly so the allow-list above can never
 *  accidentally grow over one of them (belt-and-braces: they are not in FORM_GUARD_KINDS either). The
 *  former regex-param honesty kinds are DELETED (no-regex law, 2026-08-02); `llmCheck` is the behavior
 *  TRUTH guard that replaced them — its verdict can make the user believe something false, so a candidate
 *  it vetoes is never delivered. (Unknown behavior kinds already default to TRUTH via the allow-list.) */
const TRUTH_GUARD_KINDS: ReadonlySet<string> = new Set([
  'llmCheck',
  'pendingConfirmMustAsk',
  // The cross-check honesty core (SCG): each grounds the agent's structured declaration against the
  // world ledger, so a candidate one of them vetoes can make the user believe something false about
  // what happened — never salvaged, never delivered over.
  'claimIsGrounded',
  'claimIsComplete',
  'claimCoversRubric',
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
  /** The turn's DELIVERED, VERIFIED claims — the accepted/salvaged payload's `did`, or the engine-derived
   *  set on exhaustion. `finalizeReply` also syncs `ledger.did`/`asked` to this, so `recordTurnHistory`
   *  retains the grounded set (T2 left history storing the RAW declaration; this is the verified one). */
  did: TurnClaim[];
}

/** Sync the ledger's reply-side declaration to `payload` and run the onReply checks against it — the ONE
 *  place `ctx.did`/`ctx.asked` (read by the claims cross-check guards) and `ctx.reply` (the message, read
 *  by degenerationGuard) are seated, so a candidate payload is checked as a whole. */
async function checkPayload(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  payload: RespondPayload,
): Promise<ReplyViolation[]> {
  ledger.did = payload.did;
  // `asked` is derived from the `ask` intention now (MI-D3); the ledger.asked FIELD stays a transitional
  // store Task 2 finishes re-keying. Computed here from the delivered did, so ctx.asked stays consistent.
  ledger.asked = hasAskIntent(payload.did);
  return checkReply(spec, ledger, world, payload.message);
}

/**
 * The whole reply pipeline over the STRUCTURED payload: mutators (message only) → onReply checks (over the
 * payload) → up to `maxRedrives` NO-TOOLS re-generations (each returns a fresh {@link RespondPayload}) →
 * salvage → the engine-derived exhaustion closure if still violating. The delivered text is COMPOSED
 * (message + rendered operation report of the verified `did`); the returned `did` (and `ledger.did`) is the
 * verified set history must keep.
 */
export async function finalizeReply(
  spec: AgentSpec,
  contract: DomainContract | undefined,
  world: AgentWorld,
  ledger: TurnLedger,
  initial: RespondPayload,
  redrive: (message: string) => Promise<RespondPayload>,
  maxRedrives: number,
): Promise<FinalizedReply> {
  // Mutators touch the MESSAGE only; seat the declaration first so their ctx (and the checks') read it.
  ledger.did = initial.did;
  ledger.asked = initial.asked;
  let payload: RespondPayload = { ...initial, message: applyMutators(spec, ledger, world, initial.message) };

  let violations = await checkPayload(spec, ledger, world, payload);
  // OUTPUT-dim postTool violations + flowChain restates (accrued in the backend's afterToolCall / chain
  // pass) join the reply-violation set so the SAME bounded no-tools redrive relays their correction text —
  // a report/repair of an already-run result, never a veto. Empty ⇒ `violations` untouched (zero-diff).
  if (ledger.postToolViolations.length) violations = [...ledger.postToolViolations, ...violations];
  for (let r = 0; r < maxRedrives && violations.length; r++) {
    const next = await redrive(redriveMessage(violations));
    for (const v of violations) ledger.turnCorrections.push(`redrive:${v.guard.kind}`);
    // Adopt the re-generated payload whole; keep the previous message only if the redrive returned none
    // (a degenerate empty re-generation must not blank the reply — mirrors the old `if (next) text = next`).
    const message = next.message.trim() ? applyMutators(spec, ledger, world, next.message) : payload.message;
    payload = { message, did: next.did, asked: next.asked };
    violations = await checkPayload(spec, ledger, world, payload);
  }

  const finalViolations = violations.map((v) => v.guard.kind);
  if (finalViolations.length) {
    // Salvage-before-canned-closure (measured on the eight-second-limit / zero-quota cells): when the turn
    // DID produce a verified terminal — the FULL payload (message + did + asked) of a SUCCESSFUL `respond`
    // this turn — and that whole payload re-passes every onReply check (the claims guards INCLUDED, so a
    // fabricated `did` is never salvaged), surface it instead of the generic closure. Purity holds: the
    // salvage is a verified observation (ok call args), re-validated by the same deterministic checks.
    const lastRespond = [...ledger.observed].reverse().find(
      (o) => o.turnIndex === ledger.turnIndex && o.ok && o.name === 'respond' && typeof o.args?.message === 'string' && (o.args.message as string).trim().length > 0,
    );
    if (lastRespond) {
      const candidate = respondPayload(lastRespond.args as Record<string, unknown>);
      const candidateText = composeDelivery(candidate, contract);
      if (candidateText.trim() === composeDelivery(payload, contract).trim()) {
        ledger.turnCorrections.push('salvage-miss:same-text');
      } else {
        const candViolations = await checkPayload(spec, ledger, world, candidate);
        if (candViolations.length === 0) {
          ledger.turnCorrections.push('exhaustion-salvage');
          ledger.did = candidate.did;
          ledger.asked = candidate.asked;
          return withBlankFloor(candidateText, candidate.did, finalViolations, true, ledger, contract?.writeTools ?? [], contract);
        }
        if (candViolations.every((v) => isFormViolation(v.guard))) {
          ledger.turnCorrections.push(`salvage:form-only:${candViolations.map((v) => v.guard.kind).join(',')}`);
          ledger.did = candidate.did;
          ledger.asked = candidate.asked;
          return withBlankFloor(candidateText, candidate.did, finalViolations, true, ledger, contract?.writeTools ?? [], contract);
        }
        ledger.turnCorrections.push(`salvage-miss:checks:${candViolations.map((v) => v.guard.kind).join(',')}`);
      }
    } else {
      ledger.turnCorrections.push('salvage-miss:no-terminal-observed');
    }
    // DOMAIN-only evidence for the OVERRIDE seams (their signature predates the structured payload): the
    // turn's non-terminal ok tool names + produced labels. A turn-closing terminal is the runtime's own
    // delivery mechanism, not something that "landed", so it is filtered here.
    const okTools = ledger.observed
      .filter((o) => o.turnIndex === ledger.turnIndex && o.ok && !isTerminal(o.name))
      .map((o) => o.name);
    ledger.turnCorrections.push('exhaustion-terminal');
    // Override seams keep their old signature + evidence; only the DEFAULT is the engine-derived closure.
    // The verified `did` history keeps is ALWAYS the engine-derived truth — an override changes the
    // wording, not the record of what happened.
    const derived = deriveExhaustionClosure(ledger, contract?.writeTools ?? [], contract);
    const overrideText = spec.controls.exhaustionReply
      ? spec.controls.exhaustionReply(world, okTools, ledger.producedThisTurn, finalViolations)
      : contract?.exhaustionReply
        ? contract.exhaustionReply(world, okTools, ledger.producedThisTurn, finalViolations)
        : '';
    // The blank floor holds UNCONDITIONALLY: an override that returns blank falls back to the
    // engine-derived closure (non-empty by construction) instead of delivering nothing.
    const closureText = overrideText && !isBlankDelivery(overrideText) ? overrideText : derived.text;
    ledger.did = derived.did;
    ledger.asked = false;
    return { text: closureText, exhausted: true, violations: finalViolations, did: derived.did };
  }

  // Clean delivery: compose message + the verified operation report; the accepted payload IS the verified
  // declaration (it passed the claims cross-check), so it becomes the turn's `did` in history. The blank
  // floor still applies here — an empty `message` + empty `did` composes to `''` (schema minLength is
  // advisory only), and a mutator can rewrite an otherwise-fine `message` to `''` after the checks passed.
  ledger.did = payload.did;
  ledger.asked = payload.asked;
  return withBlankFloor(composeDelivery(payload, contract), payload.did, [], false, ledger, contract?.writeTools ?? [], contract);
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
 * (world, observed) by its signature, never the user text (a chain that forked on intent would be the
 * banned intent-based routing). Evaluate it per-chain AT execution time, in
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
      // 'llm': ONE forced micro-generate — the model fills args (it MAY read the user text; the ban
      // is on deterministic trigger/derive code, not the model). A real generate → count it toward llmCalls.
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
