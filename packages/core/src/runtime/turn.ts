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
 * deterministic exhaustion closure the engine DERIVES from the world action history. The delivered text is
 * COMPOSED: `message` + the engine-rendered OPERATION RECORD of the verified `did`, on every turn —
 * so the operational sentences the user reads come from action history-grounded structure, never the agent's
 * free prose, and a claim the prose makes always arrives beside the engine's own account of what
 * changed. On a turn where nothing was carried out, that account is also what gates the LIE CHECK: one
 * closed question to the backend's `judge`, and a rewrite of the prose when it answers yes.
 * The redrive is a re-generation with the correction appended — NEVER a
 * framework retry that re-runs the whole generation (that re-executes side-effecting tools; ~100× slower).
 */
import { resolveGuards, resolveMutators } from '../spec.js';
import type { AgentSpec, ChainSpec } from '../spec.js';
import type { DomainContract } from '../assembled-prompt.js';
import type { AgentWorld, Guard, GuardCtx, ObservedCall, Judge } from '../rules.js';
import { issueApprovalForVeto, recordDowngradedAttempt, recordVeto, type TurnActionHistory } from './action-history.js';
import { isTerminal } from './terminal.js';
import {
  deriveClaimsFromActionHistory,
  isBlankDelivery,
  operationRecord,
  renderOperationReport,
  respondPayload,
  type RespondPayload,
  type Intention,
} from './claims.js';
import { isChecked, llmRewriteLie, LIE_QUESTION } from './lie-check.js';
import { CLOSED_FAIL_DENY } from '../guards/llm-check.js';
import { judgePrompt, readJudgeVerdict, JUDGE_UNREACHABLE, JUDGE_UNREADABLE } from './judge-prompt.js';
import { resolveEngineText } from './engine-text.js';
import { stripToLicensed } from './approval-request.js';
import { renderAfterAct, renderDisclosure, renderLater } from './disclosure.js';
import { scrubText } from './sensitive-filter.js';
import type { ApprovalRequest } from './approval-request.js';

export interface ReplyViolation {
  guard: Guard;
  reason: string;
}

export type PreToolVerdict =
  | { verdict: 'allow' }
  | { verdict: 'deny'; reason: string; guard: Guard; mustCloseTurn: boolean }
  /** A destructive act denied for consent on a tool whose declared schema can simulate: the caller
   *  re-enters ONCE with these widened arguments and executes the simulation instead — the world
   *  validates the act, describes it, and names the record the question binds to. */
  | { verdict: 'downgrade'; args: Record<string, unknown> };

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

/** Guard kinds that gate even a schema-licensed simulation — a simulation changes nothing, but a
 *  looping simulation is still a loop. Every other preTool guard checks a rule the WORLD already
 *  validates in full on a simulation, so the world's own answer is the enforcement. */
export const ALWAYS_GUARD_KINDS: ReadonlySet<string> = new Set(['noDuplicateCall']);

/** Run the preTool guards for one candidate call. On deny, the veto is recorded in the action
 *  history. `opts.canDowngrade` (default true) says whether the caller can execute a downgraded
 *  simulation — a backend with no executor of its own (native-tools mode, or the re-entry after a
 *  downgrade) passes false, and a consent denial then takes the veto-question route instead. */
export async function evaluatePreTool(
  spec: AgentSpec,
  actionHistory: TurnActionHistory,
  world: AgentWorld,
  tool: string,
  args: Record<string, unknown>,
  opts?: { canDowngrade?: boolean },
): Promise<PreToolVerdict> {
  const guards = resolveGuards(spec.guards.preTool, tool);
  // SAME-STEP visibility (before the guard await, synchronously): snapshot the siblings admitted
  // EARLIER in this step, then register self so a LATER same-step sibling sees this call. The model
  // runtime dispatches a step's calls concurrently but starts them in emission order up to the first
  // await, so this ordering is deterministic. `selfEntry` is reconciled out when the result is
  // recorded (now in `observed`) or removed on the veto path just below (it never ran).
  // The spec's labels are what turn a DENIAL into a question the user can read and answer, so they are
  // seated where the spec and the action history first meet — a spec that declares none leaves the action history's own
  // map alone, and a destructive tool that names no record and has no label stays permanently
  // unconsentable.
  if (spec.destructiveLabels) actionHistory.destructiveLabels = spec.destructiveLabels;
  const siblingCallsThisStep = [...actionHistory.inFlightCalls];
  const selfEntry: ObservedCall = { name: tool, args, ok: true, turnIndex: actionHistory.turnIndex };
  actionHistory.inFlightCalls.push(selfEntry);
  const gctx: GuardCtx = {
    args,
    tool,
    world,
    observed: actionHistory.observed,
    turnIndex: actionHistory.turnIndex,
    userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn,
    simulatableTools: actionHistory.simulatableTools,
    history: actionHistory.history,
    attachmentsThisTurn: actionHistory.attachments,
    siblingCallsThisStep,
    notes: actionHistory.turnCorrections,
    judge: actionHistory.judge, judgeTimeoutMs: actionHistory.judgeTimeoutMs, renderOpts: actionHistory.renderOpts,
  };
  // A schema-licensed simulation changes nothing in the world, so every preTool guard whose rule is
  // about a WRITE is already answered in full by the world's own simulated response — the world IS
  // the enforcement. `confirmFirst` states this bypass for itself (its own schema-licensed line); this
  // filter extends it to every OTHER preTool guard. Only the kinds in `ALWAYS_GUARD_KINDS` still gate a
  // simulation: a simulation changes nothing, but a LOOPING simulation is still a loop.
  const isSimulation = args.simulate === true && actionHistory.simulatableTools?.has(tool) === true;
  // The user agreed to a CALL, not to that call plus whatever the retry added. Anything the model
  // appended after the question was raised is dropped before any guard sees it.
  stripToLicensed(actionHistory.consentThisTurn ?? [], tool, args);
  const active = isSimulation ? guards.filter((g) => ALWAYS_GUARD_KINDS.has(g.kind)) : guards;
  for (const g of active) {
    const reason = await g.check(gctx);
    if (reason) {
      const selfIx = actionHistory.inFlightCalls.indexOf(selfEntry);
      if (selfIx >= 0) actionHistory.inFlightCalls.splice(selfIx, 1);
      if (g.kind === 'confirmFirst' && (opts?.canDowngrade ?? true)
          && actionHistory.simulatableTools?.has(tool) && args.simulate !== true) {
        // The bare call is what made this destructive. Re-running it as a simulation costs nothing —
        // a simulation changes nothing by construction — and it is the only way the turn produces a
        // question the user can answer: the world validates the act, describes it, and names the
        // record the question binds to. Not a veto: the attempt is recorded for scoring, the turn
        // progresses.
        recordDowngradedAttempt(actionHistory, tool, args);
        return { verdict: 'downgrade', args: { ...args, simulate: true } };
      }
      recordVeto(actionHistory, tool, args, `${g.dim}:${g.kind}:${tool}`, g.publicReason);
      // THE DENIAL IS THE QUESTION. A destructive tool that cannot simulate is asked about by being
      // attempted: the gate refuses, and the refusal raises the consent question — about the record
      // the call itself names — that the delivered text then carries. An agent cannot choose not to
      // ask and still act.
      if (g.kind === 'confirmFirst') issueApprovalForVeto(actionHistory, tool, args);
      // 2nd+ consecutive veto: the model is looping. The backend wraps `reason` in the veto
      // envelope, which carries the escalation both as prose and as a structural flag.
      return { verdict: 'deny', reason, guard: g, mustCloseTurn: actionHistory.vetoStreak >= 2 };
    }
  }
  return { verdict: 'allow' };
}

/** Run the onInput guards (before any LLM call). Returns the refusal reason, or null to proceed. */
export async function evaluateOnInput(spec: AgentSpec, actionHistory: TurnActionHistory, world: AgentWorld): Promise<string | null> {
  const guards = resolveGuards(spec.guards.onInput);
  // onInput: `args` is empty (no tool); the guard reads the REAL incoming user text via `userText`
  // plus the prior `history`.
  const gctx: GuardCtx = { args: {}, world, observed: actionHistory.observed, turnIndex: actionHistory.turnIndex, userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn, history: actionHistory.history, notes: actionHistory.turnCorrections, judge: actionHistory.judge, judgeTimeoutMs: actionHistory.judgeTimeoutMs, renderOpts: actionHistory.renderOpts };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      actionHistory.turnCorrections.push(`onInput:${g.kind}`);
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
 * IS THE LIE QUESTION ENABLED? Binding {@link llmCheckLie} on the spec is the ONE place, and there is no
 * runtime flag beside it. Two enabling points would ask the same question about the same sentence twice,
 * on the same model, with the two answers free to disagree.
 */
export function specInstallsLieCheck(spec: AgentSpec): boolean {
  return lieCheckGuard(spec) !== undefined;
}

/** The bound lie guard itself — the runtime needs its `failMode`, which prices a judge that could not
 *  answer. Absent ⇒ the question is not enabled and no call is made. */
function lieCheckGuard(spec: AgentSpec): Guard | undefined {
  return spec.guards.onReply?.find((b) => !b.disabled && b.guard.kind === 'llmCheckLie')?.guard;
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
function applyMutators(spec: AgentSpec, actionHistory: TurnActionHistory, world: AgentWorld, text: string): string {
  let out = text;
  for (const m of resolveMutators(spec.guards.onReplyMutate)) {
    const mctx: GuardCtx = {
      args: {},
      world,
      observed: actionHistory.observed,
      turnIndex: actionHistory.turnIndex,
      userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn,
      history: actionHistory.history,
      reply: out,
      producedThisTurn: actionHistory.producedThisTurn,
      did: actionHistory.did,
      judge: actionHistory.judge, judgeTimeoutMs: actionHistory.judgeTimeoutMs, renderOpts: actionHistory.renderOpts,
    };
    const next = m.apply(out, mctx);
    if (next !== out) {
      actionHistory.turnCorrections.push(`mutate:${m.kind}`);
      out = next;
    }
  }
  return out;
}

/** Run the onReply guard checks against a candidate reply. */
async function checkReply(
  spec: AgentSpec,
  actionHistory: TurnActionHistory,
  world: AgentWorld,
  text: string,
): Promise<ReplyViolation[]> {
  const rctx: GuardCtx = {
    args: {},
    world,
    observed: actionHistory.observed,
    turnIndex: actionHistory.turnIndex,
    userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn,
    history: actionHistory.history,
    reply: text,
    producedThisTurn: actionHistory.producedThisTurn,
    attachmentsThisTurn: actionHistory.attachments,
    notes: actionHistory.turnCorrections,
    did: actionHistory.did,
    // This turn's guard-vetoed attempts — so claimIsGrounded can ground a blocked/refused claim against
    // the call the guard stopped (invisible on the world action history by construction).
    attemptedThisTurn: actionHistory.attemptedCalls,
    judge: actionHistory.judge, judgeTimeoutMs: actionHistory.judgeTimeoutMs, renderOpts: actionHistory.renderOpts,
  };
  const out: ReplyViolation[] = [];
  for (const g of resolveGuards(spec.guards.onReply)) {
    const r = await g.check(rctx);
    if (r) out.push({ guard: g, reason: r });
  }
  return out;
}

/** The output of {@link enforcePostTool}: LLM-facing `output:${kind}:${tool}` correction tags (for the
 *  observed-call action history / a turn's `recoveryEvents`) plus the `{ guard, reason }` pairs that JOIN the
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
 * `{ guard, reason }` pair. PURE: no I/O, no action history mutation — the caller records the corrections and
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
/** The engine's exhaustion sentence when NOTHING landed (a simulate-only / read-only / all-refused turn). */
const EXHAUSTION_NOTHING = 'I could not complete this safely — nothing was changed. Could you rephrase or add detail?';

/**
 * The DELIVERED text: the agent's `message`, then the CONSENT QUESTIONS this turn raised — each under
 * the domain's own sentence about what agreeing would do — then the engine-rendered OPERATION RECORD
 * of the (already action history-grounded) `did`.
 *
 * ```
 *   Your booking BK-1 carries an 80.00 fee.     ← the agent's prose
 *
 *   Cancelling BK-1 releases the room and       ← the engine's disclosure
 *   forfeits the 80.00 deposit.
 *   To confirm BK-1, reply: CONFIRM BK-1        ← the engine's question
 *
 *   No operation was carried out on this turn.  ← the engine's account
 * ```
 *
 * The engine blocks are the parts the agent does not write: what agreeing does, the question it must
 * not be able to reframe, and the account of what changed it must not be able to soften. This is the
 * ONE place any of them enters the delivered text. An approval whose tool the domain discloses nothing
 * about carries its question alone.
 *
 * EVERY delivery carries the record, with no exception and no configuration. A turn that declared only
 * speech carries the empty-case closure — the sentence that denies whatever operation the prose beside
 * it may have claimed. There is no branch here that can omit it: a delivery with no record is a claim
 * with nothing standing against it.
 *
 * A contract that declares `scrubTextFields` names free text as a place contact data drifts into. The
 * agent's PROSE is the last place that drift can be caught, so it passes through the scrub here — an
 * address copied out of a result, an email the user typed and the prose repeated.
 *
 * ```
 *   composeDeliveryText('I will write to ops@x.example.', [{ op: 'inform' }], [], actionHistory, contract)
 *   → 'I will write to •••.\n\nNo operation was carried out on this turn.'
 * ```
 */
export function composeDeliveryText(
  message: string,
  did: Intention[],
  approvals: readonly ApprovalRequest[],
  actionHistory: TurnActionHistory,
  contract?: Pick<DomainContract, 'renderClaim' | 'outcomes' | 'engineText' | 'scrubTextFields' | 'disclose' | 'discloseMissing'>,
): string {
  const text = resolveEngineText(contract?.engineText);
  const report = renderOperationReport(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text });
  const asked = approvals.map((c) => renderApproval(c, contract, actionHistory)).join('\n\n');
  // What each CALL of this turn did, in the domain's own sentence, filled from that call's own
  // result. The model is not in this path either: it cannot soften the line or leave it out.
  // EVERY ok call is offered, reads included — `renderAfterAct` prints only the sentences whose
  // slots the result actually fills, so a refused call and a read the domain wrote nothing for
  // both come back empty. A turn that refuses runs no act at all, and binding this to an effect
  // would leave the engine silent exactly where the operator needs the figures behind the refusal.
  const after = (actionHistory?.observed ?? [])
    .filter((c) => c.turnIndex === actionHistory.turnIndex && c.ok !== false && !isTerminal(c.name) && 'result' in c)
    .map((c) => renderAfterAct(c.name, c.result, contract))
    .filter((t) => t.trim())
    .join('\n');
  // `later` rides the operation record: what an act of an earlier turn left standing.
  const standing = renderLater(actionHistory, contract);
  const account = [after, standing, report].filter((x) => x.trim()).join('\n');
  return [authoredProse(message.trim(), contract), asked, account].filter((s) => s.trim()).join('\n\n');
}

/** ONE approval as the operator reads it — used by BOTH delivery routes, so they cannot drift. */
function renderApproval(
  c: ApprovalRequest,
  contract: Pick<DomainContract, 'engineText' | 'disclose' | 'discloseMissing'> | undefined,
  actionHistory: TurnActionHistory,
): string {
  const text = resolveEngineText(contract?.engineText);
  return [renderDisclosure(c, contract, actionHistory), text.approval(c.meaning, c.token)].filter(Boolean).join('\n');
}

/**
 * AUTHORED prose through the free-text net — and nothing else through it.
 *
 * The net runs on the text a MODEL or a DOMAIN wrote: the agent's message, a contract's closing
 * sentence. It never runs on the engine's own blocks, which are composed from the already-filtered
 * record: the approval question, the operation report, the derived closure. A record id can be shaped
 * exactly like a phone number, and the consent token is matched against the LITERAL the approval
 * stores —
 *
 * ```
 *   scrubbed as a whole:   'To confirm •••, reply: CONFIRM •••'      the act can never be confirmed
 *   engine blocks intact:  'To confirm 2026-0801-77, reply: CONFIRM 2026-0801-77'
 * ```
 */
function authoredProse(text: string, contract?: Pick<DomainContract, 'scrubTextFields'>): string {
  return contract?.scrubTextFields?.length ? scrubText(text) : text;
}

/** Every approval still awaiting the user's answer — not consumed, not closed. Rendered on every
 *  delivery regardless of the turn that issued it: an unanswered question is outstanding work until
 *  the user's own words carry its token or the record it names moves. */
function openApprovals(actionHistory: TurnActionHistory): ApprovalRequest[] {
  return actionHistory.approvals.filter((a) => a.consumedTurn === undefined && !a.closed);
}

function composeDelivery(payload: RespondPayload, actionHistory: TurnActionHistory, contract?: DomainContract): string {
  return composeDeliveryText(payload.message, payload.did, openApprovals(actionHistory), actionHistory, contract);
}

/**
 * The engine-DERIVED exhaustion closure, used when the redrive loop exhausts. The engine builds the TRUE
 * claims from the world action history ({@link deriveClaimsFromActionHistory}) — the model never produced a groundable
 * declaration, so the engine authors one it can stand behind — renders their operation REPORT, and pairs it
 * with one honest SENTENCE keyed on whether anything actually landed.
 *
 * Report and sentence are returned SEPARATELY because an `exhaustionReply` override may replace the
 * sentence and may NEVER replace the report (see {@link finalizeReply}).
 *
 * The derived `did` is never empty: a turn on which the action history shows nothing to report is still a DELIVERED
 * turn, and no delivered turn may carry zero intentions — the closure is prose, so the engine declares it
 * as the speech act it is (`inform`, which renders no operation line).
 */
function deriveExhaustionClosure(
  actionHistory: TurnActionHistory,
  writeTools: readonly string[],
  contract?: DomainContract,
): { report: string; sentence: string; text: string; did: Intention[] } {
  const fromActionHistory = deriveClaimsFromActionHistory(actionHistory.observed, actionHistory.turnIndex, writeTools);
  const did: Intention[] = fromActionHistory.length ? fromActionHistory : [{ op: 'inform' }];
  const report = renderOperationReport(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text: resolveEngineText(contract?.engineText) });
  const landed = did.some((c) => c.outcome === 'success');
  const sentence = landed ? EXHAUSTION_PARTIAL : EXHAUSTION_NOTHING;
  return { report, sentence, text: closureText(report, sentence, openApprovals(actionHistory), contract, actionHistory), did };
}

/** The closure's delivered shape: the VERIFIED operation report first, the closing sentence after — the
 *  same order (and the same separator) {@link composeDelivery} uses on the clean path. Both parts arrive
 *  ready to deliver: the report is engine-rendered from the filtered record, and a domain-authored
 *  sentence passed the free-text net where it entered. */
function closureText(
  report: string,
  sentence: string,
  approvals: readonly ApprovalRequest[],
  contract: Pick<DomainContract, 'engineText' | 'disclose' | 'discloseMissing'> | undefined,
  actionHistory: TurnActionHistory,
): string {
  // A turn that ran out of steps still owes the user the question its attempt raised. Dropping it here
  // would leave a standing consent question the user can never answer.
  const asked = approvals.map((c) => renderApproval(c, contract, actionHistory)).join('\n\n');
  return [report, sentence, asked].filter((s) => s.trim()).join('\n\n');
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
  actionHistory: TurnActionHistory,
  writeTools: readonly string[],
  contract: DomainContract | undefined,
): FinalizedReply {
  const did = payload.did;
  // BLANK means the user would receive NOTHING THEY CAN READ AS AN ANSWER: no prose, no operation line
  // AND no question STILL STANDING. The record's closure sentence is always there, so the composed text
  // is never literally empty — it is the record ALONE that this floor is about, and a record with a line
  // still tells the user what changed, exactly as an open consent question still tells them what they
  // are being asked — whether that question was raised this turn or is still outstanding from an
  // earlier one. Prose gone AND nothing changed AND nothing outstanding is the case with nothing to
  // deliver.
  const record = operationRecord(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text: resolveEngineText(contract?.engineText) });
  if (!isBlankDelivery(payload.message) || record.hasOperations || openApprovals(actionHistory).length) {
    return { text: composeDelivery(payload, actionHistory, contract), exhausted: exhaustedIfNotBlank, violations, did };
  }
  actionHistory.turnCorrections.push('exhaustion-blank-floor');
  const derived = deriveExhaustionClosure(actionHistory, writeTools, contract);
  actionHistory.did = derived.did;
  return { text: derived.text, exhausted: true, violations, did: derived.did };
}

/**
 * The synthetic violation a fired lie question raises on a turn that ACTED. It carries the judge's own
 * words as the correction, exactly as an {@link llmCheck} deny does, and its `kind` puts
 * `redrive:llmCheckLie` in `recoveryEvents`. Not a real check (`check ⇒ null`): the runtime already has
 * the verdict, and asking again inside the redrive would be the second asker this design removes.
 */
const LIE_GUARD: Guard = { kind: 'llmCheckLie', dim: 'behavior', check: () => null, prose: () => '' };

/** What the lie question decided about ONE candidate payload. */
interface LieVerdict {
  /** The judge's words, to relay as a correction — set only on a turn that carried out an action. */
  deny: string | null;
  /** The prose must be rewritten before delivery — set only on a turn that carried out nothing. */
  rewrite: boolean;
}

const NO_LIE: LieVerdict = { deny: null, rewrite: false };

/**
 * ASK THE LIE QUESTION about one candidate payload — once, and never twice about the same text.
 *
 * ```
 *   the spec does not bind llmCheckLie  →  0 model calls
 *   NONE / unreadable / the call fails  →  the prose stands
 *   VIOLATION, no action carried out    →  rewrite
 *   VIOLATION, an action carried out    →  deny, and the model writes the reply again
 * ```
 *
 * A REWRITE IS THE OUTCOME ONLY WHERE NOTHING HAPPENED. Handed a record that names an operation, a
 * rewriter anchors to that entity and leaves every other claim standing:
 *
 * ```
 *   did        [{ op:'book', target:'Team meeting', outcome:'success' }]
 *   ORIGINAL   "The team meeting is booked, and I also cancelled the dentist appointment."
 *   REWRITE    "The team meeting is booked. The dentist appointment was cancelled."
 *                                            ↑ the lie survives, now reading as a checked account
 * ```
 *
 * On a turn that acted, the deny is the honest remedy: the model writes the reply again, and on
 * exhaustion the engine's own closure ships.
 *
 * A FAILED CALL IS NOT A DETECTION. A judge that throws, rejects or answers illegibly leaves the prose
 * where it was — scoring an outage as a verdict would let a broken endpoint rewrite or deny every reply
 * in the session, and the operation record still ships beneath the prose either way.
 */
async function askLieQuestion(
  spec: AgentSpec,
  world: AgentWorld,
  payload: RespondPayload,
  actionHistory: TurnActionHistory,
  contract: DomainContract | undefined,
): Promise<LieVerdict> {
  const guard = lieCheckGuard(spec);
  const judge = actionHistory.judge;
  if (!judge || !guard) return NO_LIE;
  const failMode = guard.failMode ?? 'closed';
  const opts = { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes };
  const ctx: GuardCtx = {
    args: {},
    world,
    observed: actionHistory.observed,
    turnIndex: actionHistory.turnIndex,
    userText: actionHistory.currentUserText,
    history: actionHistory.history,
    reply: payload.message,
    did: payload.did,
    notes: actionHistory.turnCorrections,
    renderOpts: opts,
  };
  let answer: string;
  try {
    answer = await judge(judgePrompt(LIE_QUESTION, ctx, opts));
  } catch {
    // The judge REJECTED — failMode prices it. A backstop that deletes itself the moment its own seam
    // fails is not a backstop: install it, break the judge, and the only named mitigation of the prose
    // residual is gone with nothing recorded. Two facts, two markers.
    actionHistory.turnCorrections.push(JUDGE_UNREACHABLE);
    actionHistory.turnCorrections.push(`llmcheck-unreachable:${failMode}`);
    return failMode === 'closed' ? { deny: CLOSED_FAIL_DENY, rewrite: false } : NO_LIE;
  }
  // SETTLED WITHOUT A VERDICT. A call that answered nothing, or answered something that is not a
  // verdict, found no violation, and scoring either as a detection would let one broken endpoint deny
  // every reply in the session. `failMode` does not fire here: it prices a REJECTION, and this call
  // did not reject.
  if (!answer.trim()) {
    actionHistory.turnCorrections.push(JUDGE_UNREACHABLE);
    return NO_LIE;
  }
  const { violation, readable } = readJudgeVerdict(answer);
  if (!readable) actionHistory.turnCorrections.push(JUDGE_UNREADABLE);
  if (!violation) return NO_LIE;
  return isChecked(operationRecord(payload.did, opts))
    ? { deny: null, rewrite: true }
    : { deny: violation, rewrite: false };
}

/**
 * THE REWRITE, applied to a payload that is about to be delivered. It runs on the paths that deliver the
 * AGENT's own sentence (the clean path and both salvages) and on no other: the exhaustion closure's prose
 * is engine-derived or domain-authored, so there is no agent claim in it to correct.
 *
 * Only the `message` can change. `did` is untouched, so nothing here needs re-grounding, and the record
 * composed beneath the prose is the same record the question was shown.
 */
async function withLieRewrite(
  payload: RespondPayload,
  verdict: LieVerdict,
  actionHistory: TurnActionHistory,
  contract: DomainContract | undefined,
): Promise<RespondPayload> {
  const judge = actionHistory.judge;
  if (!verdict.rewrite || !judge) return payload;
  const message = await llmRewriteLie(
    { message: payload.message, did: payload.did, history: actionHistory.history, userText: actionHistory.currentUserText },
    judge,
    { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes },
  );
  actionHistory.turnCorrections.push(message === payload.message ? 'lie-check:fired' : 'lie-check:rewritten');
  return message === payload.message ? payload : { ...payload, message };
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
  // world action history, so a candidate one of them vetoes can make the user believe something false about
  // what happened — never salvaged, never delivered over.
  'claimIsGrounded',
  'claimIsComplete',
  'mustAccountFor',
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
   *  set on exhaustion. `finalizeReply` also syncs `action history.did` to this, so `recordTurnHistory`
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

/** Sync the action history's reply-side declaration to `payload` and run the onReply checks against it — the ONE
 *  place `ctx.did` (read by the claims cross-check guards, and by the consent guards as the turn's
 *  AUTHORITATIVE ask record) and `ctx.reply` (the message, read by degenerationGuard) are seated,
 *  so a candidate payload is checked as a whole. The engine's own declaration floor runs FIRST, ahead of
 *  every installed guard: an undeclared payload is a protocol failure, not a content judgment. */
async function checkPayload(
  spec: AgentSpec,
  actionHistory: TurnActionHistory,
  world: AgentWorld,
  payload: RespondPayload,
  contract?: DomainContract,
): Promise<{ violations: ReplyViolation[]; lie: LieVerdict }> {
  actionHistory.did = payload.did;
  const checked = await checkReply(spec, actionHistory, world, payload.message);
  const lie = await askLieQuestion(spec, world, payload, actionHistory, contract);
  const denied = lie.deny ? [...checked, { guard: LIE_GUARD, reason: lie.deny }] : checked;
  const violations = payload.did.length
    ? denied
    : [{ guard: DECLARATION_GUARD, reason: DECLARATION_REASON }, ...denied];
  return { violations, lie };
}

/**
 * The whole reply pipeline over the STRUCTURED payload: mutators (message only) → onReply checks (over the
 * payload) → up to `maxRedrives` NO-TOOLS re-generations (each returns a fresh {@link RespondPayload}) →
 * salvage → the engine-derived exhaustion closure if still violating. The delivered text is COMPOSED
 * (message + rendered operation report of the verified `did`); the returned `did` (and `action history.did`) is the
 * verified set history must keep.
 */
export async function finalizeReply(
  spec: AgentSpec,
  contract: DomainContract | undefined,
  world: AgentWorld,
  actionHistory: TurnActionHistory,
  initial: RespondPayload,
  redrive: (message: string) => Promise<RespondPayload>,
  maxRedrives: number,
): Promise<FinalizedReply> {
  // Mutators touch the MESSAGE only; seat the declaration first so their ctx (and the checks') read it.
  actionHistory.did = initial.did;
  let payload: RespondPayload = { ...initial, message: applyMutators(spec, actionHistory, world, initial.message) };

  let checked = await checkPayload(spec, actionHistory, world, payload, contract);
  let violations = checked.violations;
  // OUTPUT-dim postTool violations + flowChain restates (accrued in the backend's afterToolCall / chain
  // pass) join the reply-violation set so the SAME bounded no-tools redrive relays their correction text —
  // a report/repair of an already-run result, never a veto. Empty ⇒ `violations` untouched (zero-diff).
  if (actionHistory.postToolViolations.length) violations = [...actionHistory.postToolViolations, ...violations];
  for (let r = 0; r < maxRedrives && violations.length; r++) {
    const next = await redrive(redriveMessage(violations));
    for (const v of violations) actionHistory.turnCorrections.push(`redrive:${v.guard.kind}`);
    // MESSAGE AND `did` COME FROM THE SAME PAYLOAD — never spliced. Keeping the PREVIOUS message when a
    // re-generation returns a blank one, while adopting the new `did` unconditionally, would let a
    // redrive answering `{message:'', did:[{op:'ask'}]}` deliver the OLD, uncorrected sentence and SEAL
    // the turn as having asked a question. That seal is the authoritative cross-turn consent signal
    // (`askedInDeliveredTurn`'s history variant), so the engine would manufacture a licence for a
    // bare destructive act — and no prune could reach it, because the defect would be in the
    // reply pipeline, not in the action history.
    // A re-generation with no readable message is REJECTED WHOLE: the previous payload stands intact
    // (message AND did), the redrive counts as spent, and the turn falls through to salvage / the
    // engine-derived exhaustion closure — the honest outcome for a model that said nothing.
    if (isBlankDelivery(next.message)) {
      actionHistory.turnCorrections.push('redrive-empty:kept-previous');
      continue;
    }
    payload = { message: applyMutators(spec, actionHistory, world, next.message), did: next.did };
    checked = await checkPayload(spec, actionHistory, world, payload, contract);
    violations = checked.violations;
  }

  const finalViolations = violations.map((v) => v.guard.kind);
  if (finalViolations.length) {
    // Salvage-before-canned-closure (measured on the eight-second-limit / zero-quota cells): when the turn
    // DID produce a verified terminal — the FULL payload (message + did) of a SUCCESSFUL `respond`
    // this turn — and that whole payload re-passes every onReply check (the claims guards INCLUDED, so a
    // fabricated `did` is never salvaged), surface it instead of the generic closure. Purity holds: the
    // salvage is a verified observation (ok call args), re-validated by the same deterministic checks.
    const lastRespond = [...actionHistory.observed].reverse().find(
      (o) => o.turnIndex === actionHistory.turnIndex && o.ok && o.name === 'respond' && typeof o.args?.message === 'string' && (o.args.message as string).trim().length > 0,
    );
    if (lastRespond) {
      const candidate = respondPayload(lastRespond.args as Record<string, unknown>);
      const candidateText = composeDelivery(candidate, actionHistory, contract);
      if (candidateText.trim() === composeDelivery(payload, actionHistory, contract).trim()) {
        actionHistory.turnCorrections.push('salvage-miss:same-text');
      } else {
        const cand = await checkPayload(spec, actionHistory, world, candidate, contract);
        const candViolations = cand.violations;
        if (candViolations.length === 0) {
          actionHistory.turnCorrections.push('exhaustion-salvage');
          actionHistory.did = candidate.did;
          const delivered = await withLieRewrite(candidate, cand.lie, actionHistory, contract);
          return withBlankFloor(delivered, finalViolations, true, actionHistory, contract?.writeTools ?? [], contract);
        }
        if (candViolations.every((v) => isFormViolation(v.guard))) {
          actionHistory.turnCorrections.push(`salvage:form-only:${candViolations.map((v) => v.guard.kind).join(',')}`);
          actionHistory.did = candidate.did;
          const delivered = await withLieRewrite(candidate, cand.lie, actionHistory, contract);
          return withBlankFloor(delivered, finalViolations, true, actionHistory, contract?.writeTools ?? [], contract);
        }
        actionHistory.turnCorrections.push(`salvage-miss:checks:${candViolations.map((v) => v.guard.kind).join(',')}`);
      }
    } else {
      actionHistory.turnCorrections.push('salvage-miss:no-terminal-observed');
    }
    // DOMAIN-only evidence for the OVERRIDE seams (their signature predates the structured payload): the
    // turn's non-terminal ok tool names + produced labels. A turn-closing terminal is the runtime's own
    // delivery mechanism, not something that "landed", so it is filtered here.
    const okTools = actionHistory.observed
      .filter((o) => o.turnIndex === actionHistory.turnIndex && o.ok && !isTerminal(o.name))
      .map((o) => o.name);
    actionHistory.turnCorrections.push('exhaustion-terminal');
    // Override seams keep their old signature + evidence; only the DEFAULT is the engine-derived closure.
    // The verified `did` history keeps is ALWAYS the engine-derived truth — an override changes the
    // wording, not the record of what happened.
    const derived = deriveExhaustionClosure(actionHistory, contract?.writeTools ?? [], contract);
    const overrideText = spec.controls.exhaustionReply
      ? spec.controls.exhaustionReply(world, okTools, actionHistory.producedThisTurn, finalViolations)
      : contract?.exhaustionReply
        ? contract.exhaustionReply(world, okTools, actionHistory.producedThisTurn, finalViolations)
        : '';
    // COMPOSE, NEVER REPLACE. Letting an override discard the WHOLE derived closure, report included,
    // would put the user and the action history in disagreement: the override signature cannot re-render the
    // report, so a domain whose override says "nothing was changed" (the natural abstain wording) would
    // deliver exactly that over a write the action history recorded, while `action history.did` kept the derived truth.
    // The override supplies the closing SENTENCE;
    // the engine always prepends the verified operation report, exactly as `composeDelivery` does on the
    // clean path. The blank floor holds UNCONDITIONALLY: a blank override falls back to the engine's own
    // sentence rather than delivering the report alone. A closure is a delivery, so the sentence a
    // DOMAIN authored crosses the free-text net here, exactly as the agent's own prose does — while the
    // engine's report and its own derived sentence are delivered as rendered.
    const sentence = overrideText && !isBlankDelivery(overrideText) ? authoredProse(overrideText, contract) : derived.sentence;
    actionHistory.did = derived.did;
    return {
      text: closureText(derived.report, sentence, openApprovals(actionHistory), contract, actionHistory),
      exhausted: true,
      violations: finalViolations,
      did: derived.did,
    };
  }

  // Clean delivery: compose message + the verified operation report; the accepted payload IS the verified
  // declaration (it passed the claims cross-check), so it becomes the turn's `did` in history. The blank
  // floor still applies here — a zero-width `message` + empty `did` composes to a blank the schema
  // `minLength` accepts, and a mutator can rewrite an otherwise-fine `message` to `''` after the checks.
  actionHistory.did = payload.did;
  const delivered = await withLieRewrite(payload, checked.lie, actionHistory, contract);
  return withBlankFloor(delivered, [], false, actionHistory, contract?.writeTools ?? [], contract);
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
 * order: a 'direct' chain appends to `observed`, so a later chain sees the updated action history.
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
  /** The live per-turn action history of observed calls (mutated by afterToolCall/forceLlmCall as chains run). */
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

/** What the pass hands back to the backend (applied to the action history by the caller). */
export interface ChainPassResult {
  /** turnCorrections to append: `chain:${call}` / `chain-vetoed:${call}` / `chain-failed:${call}`. */
  corrections: string[];
  /** Reply-accounting violations to JOIN into the action history's postToolViolations (the redrive consumes them). */
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
