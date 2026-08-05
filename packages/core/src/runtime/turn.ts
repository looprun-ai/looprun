/**
 * @looprun-ai/core runtime — the governed-TURN state machine (framework-free).
 *
 * Everything deterministic about one turn lives here; a backend (e.g. @looprun-ai/mastra) supplies only
 * the framework glue: how tools are wired, how the LLM is called, and ONE async `redrive` callback
 * that re-generates text with tools disabled.
 *
 * The reply pipeline (finalizeReply) works over the STRUCTURED respond payload (message + did):
 * mutators (message only) → onReply checks (over the payload — claims guards read did, degeneration reads
 * message) → bounded NO-TOOLS redrive (the backend re-generates a whole respond payload) → salvage → a
 * deterministic exhaustion closure the engine DERIVES from the world ledger. The delivered text is
 * COMPOSED: `message` + the engine-rendered OPERATION RECORD of the verified `did`, on every turn —
 * so the operational sentences the user reads come from ledger-grounded structure, never the agent's
 * free prose, and a claim the prose makes always arrives beside the engine's own account of what
 * changed. On a turn where nothing was carried out, that account is also what gates the LIE CHECK: one
 * closed question to the backend's `judge`, and a rewrite of the prose when it answers yes.
 * The redrive is a re-generation with the correction appended — NEVER a
 * framework retry that re-runs the whole generation (that re-executes side-effecting tools; ~100× slower).
 */
import { resolveGuards, resolveMutators } from '../spec.js';
import type { AgentSpec, ChainSpec } from '../spec.js';
import type { DomainContract } from '../trunk.js';
import type { AgentWorld, Guard, GuardCtx, ObservedCall, Judge } from '../rules.js';
import { issueChallengeForVeto, recordVeto, type TurnLedger } from './ledger.js';
import { isTerminal } from './terminal.js';
import {
  deriveClaimsFromLedger,
  isBlankDelivery,
  operationRecord,
  renderOperationReport,
  respondPayload,
  type RespondPayload,
  type Intention,
} from './claims.js';
import { runLieCheck } from './lie-check.js';
import { resolveEngineText } from './engine-text.js';
import type { Challenge } from './challenge.js';

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
  // The spec's labels are what turn a DENIAL into a question the user can read and answer, so they are
  // seated where the spec and the ledger first meet — a spec that declares none leaves the ledger's own
  // map alone, and a flag-less destructive tool with no label stays permanently unconsentable.
  if (spec.destructiveLabels) ledger.destructiveLabels = spec.destructiveLabels;
  const siblingCallsThisStep = [...ledger.inFlightCalls];
  const selfEntry: ObservedCall = { name: tool, args, ok: true, turnIndex: ledger.turnIndex };
  ledger.inFlightCalls.push(selfEntry);
  const gctx: GuardCtx = {
    args,
    tool,
    world,
    observed: ledger.observed,
    turnIndex: ledger.turnIndex,
    userText: ledger.currentUserText, consent: ledger.consentThisTurn,
    history: ledger.history,
    attachmentsThisTurn: ledger.attachments,
    siblingCallsThisStep,
    notes: ledger.turnCorrections,
    judge: ledger.judge, judgeTimeoutMs: ledger.judgeTimeoutMs, renderOpts: ledger.renderOpts,
  };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      const selfIx = ledger.inFlightCalls.indexOf(selfEntry);
      if (selfIx >= 0) ledger.inFlightCalls.splice(selfIx, 1);
      recordVeto(ledger, tool, args, `${g.dim}:${g.kind}:${tool}`);
      // THE DENIAL IS THE QUESTION. A destructive tool the world has no preview form for is asked about
      // by being attempted: the gate refuses, and the refusal raises the consent question the delivered
      // text then carries. An agent cannot choose not to ask and still act.
      if (g.kind === 'confirmFirst') issueChallengeForVeto(ledger, tool);
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
  // onInput: `args` is empty (no tool); the guard reads the REAL incoming user text via `userText`
  // plus the prior `history`.
  const gctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: ledger.turnIndex, userText: ledger.currentUserText, consent: ledger.consentThisTurn, history: ledger.history, notes: ledger.turnCorrections, judge: ledger.judge, judgeTimeoutMs: ledger.judgeTimeoutMs, renderOpts: ledger.renderOpts };
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
 * FAIL-LOUD-AT-START gate: a spec that installs an `llmCheck` with NO judge registered is a wiring
 * bug that must surface at conversation start — never mid-turn, where it would masquerade as a model
 * failure or (worse) silently allow. The backend calls this once, before the first turn. A spec with no
 * llmCheck needs no judge, so this is a no-op there (zero-diff).
 */
export function assertJudgePresent(spec: AgentSpec, judge: Judge | undefined): void {
  if (judge) return;
  if (specInstallsLlmCheck(spec)) {
    throw new Error(
      `looprun: spec "${spec.id}" installs an llmCheck guard but no judge was registered — ` +
        'pass the runtime a judge ((prompt: string) => Promise<string>). ' +
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
      userText: ledger.currentUserText, consent: ledger.consentThisTurn,
      history: ledger.history,
      reply: out,
      producedThisTurn: ledger.producedThisTurn,
      did: ledger.did,
      judge: ledger.judge, judgeTimeoutMs: ledger.judgeTimeoutMs, renderOpts: ledger.renderOpts,
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
    userText: ledger.currentUserText, consent: ledger.consentThisTurn,
    history: ledger.history,
    reply: text,
    producedThisTurn: ledger.producedThisTurn,
    attachmentsThisTurn: ledger.attachments,
    notes: ledger.turnCorrections,
    did: ledger.did,
    // This turn's guard-vetoed attempts — so claimIsGrounded can ground a blocked/refused claim against
    // the call the guard stopped (invisible on the world ledger by construction).
    attemptedThisTurn: ledger.attemptedCalls,
    judge: ledger.judge, judgeTimeoutMs: ledger.judgeTimeoutMs, renderOpts: ledger.renderOpts,
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
 * OUTPUT-dim (postTool) enforcement — the `spec.guards.postTool` hook. Runs each
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
 * The DELIVERED text: the agent's `message`, then the CONSENT QUESTIONS this turn raised, then the
 * engine-rendered OPERATION RECORD of the (already ledger-grounded) `did`.
 *
 * ```
 *   Your booking BK-1 carries an 80.00 fee.     ← the agent's prose
 *
 *   To confirm BK-1, reply: CONFIRM BK-1        ← the engine's question
 *
 *   No operation was carried out on this turn.  ← the engine's account
 * ```
 *
 * The two engine blocks are the parts the agent does not write: the question it must not be able to
 * reframe, and the account of what changed it must not be able to soften. This is the ONE place either
 * enters the delivered text.
 *
 * EVERY delivery carries the record, with no exception and no configuration. A turn that declared only
 * speech carries the empty-case closure — the sentence that denies whatever operation the prose beside
 * it may have claimed. There is no branch here that can omit it: a delivery with no record is a claim
 * with nothing standing against it.
 */
export function composeDeliveryText(
  message: string,
  did: Intention[],
  challenges: readonly Challenge[],
  contract?: Pick<DomainContract, 'renderClaim' | 'outcomes' | 'engineText'>,
): string {
  const text = resolveEngineText(contract?.engineText);
  const report = renderOperationReport(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text });
  const asked = challenges.map((c) => text.challenge(c.meaning, c.token)).join('\n');
  return [message.trim(), asked, report].filter((s) => s.trim()).join('\n\n');
}

function composeDelivery(payload: RespondPayload, ledger: TurnLedger, contract?: DomainContract): string {
  return composeDeliveryText(payload.message, payload.did, ledger.challengesIssuedThisTurn, contract);
}

/**
 * The engine-DERIVED exhaustion closure, used when the redrive loop exhausts. The engine builds the TRUE
 * claims from the world ledger ({@link deriveClaimsFromLedger}) — the model never produced a groundable
 * declaration, so the engine authors one it can stand behind — renders their operation REPORT, and pairs it
 * with one honest SENTENCE keyed on whether anything actually landed.
 *
 * Report and sentence are returned SEPARATELY because an `exhaustionReply` override may replace the
 * sentence and may NEVER replace the report (see {@link finalizeReply}).
 *
 * The derived `did` is never empty: a turn on which the ledger shows nothing to report is still a DELIVERED
 * turn, and no delivered turn may carry zero intentions — the closure is prose, so the engine declares it
 * as the speech act it is (`inform`, which renders no operation line).
 */
function deriveExhaustionClosure(
  ledger: TurnLedger,
  writeTools: readonly string[],
  contract?: DomainContract,
): { report: string; sentence: string; text: string; did: Intention[] } {
  const fromLedger = deriveClaimsFromLedger(ledger.observed, ledger.turnIndex, writeTools);
  const did: Intention[] = fromLedger.length ? fromLedger : [{ op: 'inform' }];
  const report = renderOperationReport(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text: resolveEngineText(contract?.engineText) });
  const landed = did.some((c) => c.outcome === 'success');
  const sentence = landed ? EXHAUSTION_PARTIAL : EXHAUSTION_NOTHING;
  return { report, sentence, text: closureText(report, sentence), did };
}

/** The closure's delivered shape: the VERIFIED operation report first, the closing sentence after — the
 *  same order (and the same separator) {@link composeDelivery} uses on the clean path. */
function closureText(report: string, sentence: string): string {
  return [report, sentence].filter((s) => s.trim()).join('\n\n');
}

/**
 * The blank-delivery FLOOR — the backend-independent non-empty guarantee. Schema cannot supply it: the
 * `respond` schema's `minLength` is enforced by the mastra backend but a zero-width message SATISFIES it,
 * and a mutator (e.g. `jargonScrub`) can blank an otherwise-fine delivery after every check has passed.
 * Called at every point a
 * composed delivery text is about to leave {@link finalizeReply} — the clean path and both salvage
 * returns: when `text` is blank ({@link isBlankDelivery}), swap in the engine-derived exhaustion closure
 * (non-empty by construction — {@link deriveExhaustionClosure}) and mark the turn exhausted. `exhausted`
 * is fixed at `true` on the blank branch (routing to the exhaustion closure IS exhaustion); the caller
 * supplies what `exhausted` should read when `text` is NOT blank, since that differs by call site (the
 * clean path is `false`, salvage is `true`).
 */
function withBlankFloor(
  payload: RespondPayload,
  violations: string[],
  exhaustedIfNotBlank: boolean,
  ledger: TurnLedger,
  writeTools: readonly string[],
  contract: DomainContract | undefined,
): FinalizedReply {
  const did = payload.did;
  // BLANK means the user would receive NOTHING THEY CAN READ AS AN ANSWER: no prose, no operation line
  // AND no question. The record's closure sentence is always there, so the composed text is never
  // literally empty — it is the record ALONE that this floor is about, and a record with a line still
  // tells the user what changed, exactly as a consent question still tells them what they are being
  // asked. Prose gone AND nothing changed AND nothing asked is the case with nothing to deliver.
  const record = operationRecord(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text: resolveEngineText(contract?.engineText) });
  if (!isBlankDelivery(payload.message) || record.hasOperations || ledger.challengesIssuedThisTurn.length) {
    return { text: composeDelivery(payload, ledger, contract), exhausted: exhaustedIfNotBlank, violations, did };
  }
  ledger.turnCorrections.push('exhaustion-blank-floor');
  const derived = deriveExhaustionClosure(ledger, writeTools, contract);
  ledger.did = derived.did;
  return { text: derived.text, exhausted: true, violations, did: derived.did };
}

/**
 * THE LIE CHECK, applied to a payload that is about to be delivered — the ONE place agent prose is
 * checked for a claim the turn cannot back. It runs on the paths that deliver the AGENT's own sentence
 * (the clean path and both salvages) and on no other: the exhaustion closure's prose is engine-derived
 * or domain-authored, so there is no agent claim in it to check.
 *
 * Only the `message` can change. `did` is untouched, so nothing here needs re-grounding, and the record
 * composed beneath the prose is the same record the check was shown.
 */
async function withLieCheck(
  payload: RespondPayload,
  ledger: TurnLedger,
  contract: DomainContract | undefined,
  judge: Judge | undefined,
): Promise<RespondPayload> {
  const outcome = await runLieCheck(
    { message: payload.message, did: payload.did, history: ledger.history, userText: ledger.currentUserText },
    judge,
    { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes },
  );
  // A check that found nothing is the nominal path and is recorded nowhere: `turnCorrections` is the
  // log of what the engine had to CORRECT, and a clean turn corrected nothing. Only a fired check —
  // and the rewrite it produced — is an event.
  if (outcome.fired) ledger.turnCorrections.push(outcome.rewritten ? 'lie-check:rewritten' : 'lie-check:fired');
  return outcome.rewritten ? { ...payload, message: outcome.message } : payload;
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
// `degenerationGuard` — an artifact-shape lint — is the ONLY salvageable FORM contract. Nothing that
// judges reply TEXT for meaning belongs here, because a salvaged delivery must still be true.
const FORM_GUARD_KINDS: ReadonlySet<string> = new Set([
  'degenerationGuard',
]);

/** Behaviour-dim kinds that are TRUTH/SAFETY — listed explicitly so the allow-list above can never
 *  accidentally grow over one of them (belt-and-braces: they are not in FORM_GUARD_KINDS either).
 *  `llmCheck` is the behavior TRUTH guard: its verdict can make the user believe something false, so a
 *  candidate it vetoes is never delivered. (Unknown behavior kinds already default to TRUTH via the
 *  allow-list.) */
const TRUTH_GUARD_KINDS: ReadonlySet<string> = new Set([
  'llmCheck',
  // The cross-check honesty core: each grounds the agent's structured declaration against the
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
   *  set on exhaustion. `finalizeReply` also syncs `ledger.did` to this, so `recordTurnHistory`
   *  retains the grounded set (T2 left history storing the RAW declaration; this is the verified one). */
  did: Intention[];
}

/**
 * The MANDATORY-DECLARATION FLOOR — engine-owned, like the blank-delivery floor beside it.
 *
 * A candidate payload with ZERO intentions is not deliverable. The `respond` schema's `minItems:1` cannot
 * be the guarantee: it counts entries, and it cannot express the speech/action partition, so a single
 * malformed intention (`{op:'inform', outcome:'success'}` — the likeliest `did` mistake a weak model makes)
 * is schema-legal and is DROPPED by `validateClaims`, leaving the pipeline holding an empty declaration.
 * Without this floor `claimIsGrounded` short-circuits on it, the operation report renders '', and the raw
 * prose ships alone with no violations — and the same hole swallows the free-text fallback path, where a
 * model that never called the terminal would deliver undeclared prose.
 *
 * As a violation rather than a hard failure, it takes the ordinary route: the redrive relays the correction
 * (the backends re-generate with the terminal pinned), and a model that still declares nothing falls
 * through to the engine-derived closure — which declares its own intention. Its kind is unknown to
 * `FORM_GUARD_KINDS`, so the frontier's allow-list treats it as TRUTH: an undeclared candidate is never
 * salvaged over.
 */
const DECLARATION_REASON =
  'Your reply declared no intentions — every reply must declare at least one: each operation you performed ' +
  'with its honest outcome, or a speech intention (inform/greet/refuse/ask) when you only spoke.';

const DECLARATION_GUARD: Guard = {
  kind: 'declarationPresent',
  dim: 'behavior',
  check: (ctx) => (ctx.did?.length ? null : DECLARATION_REASON),
  prose: () => 'every reply declares what you did — at least one intention, always',
};

/** Sync the ledger's reply-side declaration to `payload` and run the onReply checks against it — the ONE
 *  place `ctx.did` (read by the claims cross-check guards, and by the consent guards as the turn's
 *  AUTHORITATIVE ask record) and `ctx.reply` (the message, read by degenerationGuard) are seated,
 *  so a candidate payload is checked as a whole. The engine's own declaration floor runs FIRST, ahead of
 *  every installed guard: an undeclared payload is a protocol failure, not a content judgment. */
async function checkPayload(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  payload: RespondPayload,
): Promise<ReplyViolation[]> {
  ledger.did = payload.did;
  const violations = await checkReply(spec, ledger, world, payload.message);
  if (payload.did.length) return violations;
  return [{ guard: DECLARATION_GUARD, reason: DECLARATION_REASON }, ...violations];
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
  judge?: Judge,
): Promise<FinalizedReply> {
  // Mutators touch the MESSAGE only; seat the declaration first so their ctx (and the checks') read it.
  ledger.did = initial.did;
  let payload: RespondPayload = { ...initial, message: applyMutators(spec, ledger, world, initial.message) };

  let violations = await checkPayload(spec, ledger, world, payload);
  // OUTPUT-dim postTool violations + flowChain restates (accrued in the backend's afterToolCall / chain
  // pass) join the reply-violation set so the SAME bounded no-tools redrive relays their correction text —
  // a report/repair of an already-run result, never a veto. Empty ⇒ `violations` untouched (zero-diff).
  if (ledger.postToolViolations.length) violations = [...ledger.postToolViolations, ...violations];
  for (let r = 0; r < maxRedrives && violations.length; r++) {
    const next = await redrive(redriveMessage(violations));
    for (const v of violations) ledger.turnCorrections.push(`redrive:${v.guard.kind}`);
    // MESSAGE AND `did` COME FROM THE SAME PAYLOAD — never spliced. Keeping the PREVIOUS message when a
    // re-generation returns a blank one, while adopting the new `did` unconditionally, would let a
    // redrive answering `{message:'', did:[{op:'ask'}]}` deliver the OLD, uncorrected sentence and SEAL
    // the turn as having asked a question. That seal is the authoritative cross-turn consent signal
    // (`askedInDeliveredTurn`'s history arm), so the engine would manufacture a licence for a
    // `confirmed:true` destructive act — and no prune could reach it, because the defect would be in the
    // reply pipeline, not in the ledger.
    // A re-generation with no readable message is REJECTED WHOLE: the previous payload stands intact
    // (message AND did), the redrive counts as spent, and the turn falls through to salvage / the
    // engine-derived exhaustion closure — the honest outcome for a model that said nothing.
    if (isBlankDelivery(next.message)) {
      ledger.turnCorrections.push('redrive-empty:kept-previous');
      continue;
    }
    payload = { message: applyMutators(spec, ledger, world, next.message), did: next.did };
    violations = await checkPayload(spec, ledger, world, payload);
  }

  const finalViolations = violations.map((v) => v.guard.kind);
  if (finalViolations.length) {
    // Salvage-before-canned-closure (measured on the eight-second-limit / zero-quota cells): when the turn
    // DID produce a verified terminal — the FULL payload (message + did) of a SUCCESSFUL `respond`
    // this turn — and that whole payload re-passes every onReply check (the claims guards INCLUDED, so a
    // fabricated `did` is never salvaged), surface it instead of the generic closure. Purity holds: the
    // salvage is a verified observation (ok call args), re-validated by the same deterministic checks.
    const lastRespond = [...ledger.observed].reverse().find(
      (o) => o.turnIndex === ledger.turnIndex && o.ok && o.name === 'respond' && typeof o.args?.message === 'string' && (o.args.message as string).trim().length > 0,
    );
    if (lastRespond) {
      const candidate = respondPayload(lastRespond.args as Record<string, unknown>);
      const candidateText = composeDelivery(candidate, ledger, contract);
      if (candidateText.trim() === composeDelivery(payload, ledger, contract).trim()) {
        ledger.turnCorrections.push('salvage-miss:same-text');
      } else {
        const candViolations = await checkPayload(spec, ledger, world, candidate);
        if (candViolations.length === 0) {
          ledger.turnCorrections.push('exhaustion-salvage');
          ledger.did = candidate.did;
          const checked = await withLieCheck(candidate, ledger, contract, judge);
          return withBlankFloor(checked, finalViolations, true, ledger, contract?.writeTools ?? [], contract);
        }
        if (candViolations.every((v) => isFormViolation(v.guard))) {
          ledger.turnCorrections.push(`salvage:form-only:${candViolations.map((v) => v.guard.kind).join(',')}`);
          ledger.did = candidate.did;
          const checked = await withLieCheck(candidate, ledger, contract, judge);
          return withBlankFloor(checked, finalViolations, true, ledger, contract?.writeTools ?? [], contract);
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
    // COMPOSE, NEVER REPLACE. Letting an override discard the WHOLE derived closure, report included,
    // would put the user and the ledger in disagreement: the override signature cannot re-render the
    // report, so a domain whose override says "nothing was changed" (the natural abstain wording) would
    // deliver exactly that over a write the ledger recorded, while `ledger.did` kept the derived truth.
    // The override supplies the closing SENTENCE;
    // the engine always prepends the verified operation report, exactly as `composeDelivery` does on the
    // clean path. The blank floor holds UNCONDITIONALLY: a blank override falls back to the engine's own
    // sentence rather than delivering the report alone.
    const sentence = overrideText && !isBlankDelivery(overrideText) ? overrideText : derived.sentence;
    ledger.did = derived.did;
    return { text: closureText(derived.report, sentence), exhausted: true, violations: finalViolations, did: derived.did };
  }

  // Clean delivery: compose message + the verified operation report; the accepted payload IS the verified
  // declaration (it passed the claims cross-check), so it becomes the turn's `did` in history. The blank
  // floor still applies here — a zero-width `message` + empty `did` composes to a blank the schema
  // `minLength` accepts, and a mutator can rewrite an otherwise-fine `message` to `''` after the checks.
  ledger.did = payload.did;
  const checked = await withLieCheck(payload, ledger, contract, judge);
  return withBlankFloor(checked, [], false, ledger, contract?.writeTools ?? [], contract);
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
