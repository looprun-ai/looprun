/**
 * @looprun-ai/core runtime — the per-conversation observation ACTION HISTORY (framework-free).
 *
 * The action history is what guards read (`ctx.observed`, `producedThisTurn`, …): the model's own verified
 * tool activity, plus the turn-structured `history` (user text included). `observed` and `history` accumulate for the whole conversation; the other
 * fields reset per turn via `beginTurn`.
 */
import type { AgentWorld, Guard, ObservedCall, HistoryTurn, HistoryToolCall, Judge } from '../rules.js';
import { canonArgs } from '../guards/index.js';
import { isTerminal } from './terminal.js';
import { validateClaims, type Intention, type RenderOpts } from './claims.js';
import { approvalCode, closeApprovalsFor, consumeApprovals, type ApprovalRequest } from './approval-request.js';
import { preferredIdentityValues } from '../guards/honesty.js';

/** An OUTPUT-dim (postTool) result-invariant failure OR a flowChain restate — carried on the action history
 *  and JOINED into the onReply violation set so the same bounded no-tools redrive relays its text. */
export interface PostToolViolation {
  guard: Guard;
  reason: string;
}

export interface TurnActionHistory {
  observed: ObservedCall[];
  turnIndex: number;
  producedThisTurn: string[];
  turnCorrections: string[];
  attachments: string[];
  terminalReply: string;
  /** The CURRENT turn's DELIVERED structured claim of operations — the delivered `respond`'s `did`
   *  (the last ok respond carrying a non-empty `message`, consistent with the superseded-terminal
   *  pruning). Read into the reply-side GuardCtx as `ctx.did` so the cross-check guards ground the
   *  agent's DECLARATION against the world action history. It is ALSO the turn's ask record — the turn posed a
   *  question iff `hasAskIntent(action history.did)`, never through a flag. Reset per turn. */
  did: Intention[];
  /** Consecutive guard-vetoed rounds this turn (reset when a call passes guards and executes). */
  vetoStreak: number;
  /** OUTPUT-dim (postTool) result-invariant violations + flowChain restates accrued this turn — joined
   *  into the onReply violation set before the redrive loop (see finalizeReply). Reset per turn. */
  postToolViolations: PostToolViolation[];
  /** Domain calls ADMITTED (passed preTool guards) this step but not yet reconciled into `observed`
   *  (a domain tool lands in `observed` only after execute). The model runtime dispatches a step's
   *  calls concurrently, so a same-step sibling is invisible to the next call's guards via `observed`
   *  alone; this synchronous list closes that gap. Each entry is pushed before the guard await,
   *  removed on veto (never ran) or reconciled out when the result is recorded, and cleared at turn
   *  start. Passed to preTool guards as `siblingCallsThisStep`; only the throttle reads it. */
  inFlightCalls: ObservedCall[];
  /** Calls VETOED before execution this turn (guard denied them — the world never saw them). Reset per
   *  turn; surfaced on the TurnRecord as `attemptedCalls` so a FORBIDDEN invariant can fail on the
   *  ATTEMPT the guard blocked, not only on a world-action history entry (which, for a veto, never exists). */
  attemptedCalls: Array<{ name: string; args: unknown }>;
  /** The user's incoming message for the CURRENT turn (set by `beginTurn`). Read into every GuardCtx as
   *  `ctx.userText`; onInput reads it as the real incoming text. Reset per turn. */
  currentUserText: string;
  /** The COMPLETED conversation turns — accumulated across the whole conversation (NOT reset by
   *  beginTurn), read into every GuardCtx as the read-only `ctx.history`. A turn lands here via
   *  {@link recordTurnHistory} once its reply is finalized. */
  history: HistoryTurn[];
  /** The judge seam (set at action history creation from the runtime options), threaded into every GuardCtx as
   *  `ctx.judge`. Only `llmCheck` guards read it. Conversation-scoped;
   *  never reset per turn. Absent ⇒ a spec that installs an llmCheck fails loud at conversation start. */
  judge?: Judge;
  /** The judge TIMEOUT (ms) from the registration seam, threaded into every GuardCtx alongside
   *  `judge`. Conversation-scoped; never reset per turn. Absent ⇒ the guard's own default. */
  judgeTimeoutMs?: number;
  /** The domain's render vocabulary from the contract this RUN was given, threaded into every GuardCtx
   *  as `ctx.renderOpts` so a guard composing a judging prompt renders the operation record in the words
   *  the user saw. Conversation-scoped; never reset per turn. */
  renderOpts?: RenderOpts;
  /** Every consent approval this CONVERSATION has issued — open, consumed and closed alike.
   *  Conversation-scoped: an approval request stays open until the user's own words carry its token, a newer
   *  question about the same act supersedes it, or the record it names changes. There is no turn window;
   *  what bounds a stale token is that consuming it requires typing that exact literal, and consuming it
   *  closes it. */
  approvals: ApprovalRequest[];
  /** The approvals the CURRENT turn's incoming message consumed — the WHOLE licensing surface for a
   *  destructive act. Read into every GuardCtx as `ctx.consent`. Reset per turn. */
  consentThisTurn: ApprovalRequest[];
  /** The approvals ISSUED on the current turn — the questions the delivered text must carry, so the
   *  user sees what they are being asked. Reset per turn. */
  approvalsIssuedThisTurn: ApprovalRequest[];
  /** Per destructive tool that acts on NO identifiable record, the human-facing label its question is
   *  built from. A tool absent from this map can issue no question, so it can never be consented to and
   *  never runs. */
  destructiveLabels: Record<string, string>;
  /** The destructive tools whose declared schema carries `simulate` — the only tools whose
   *  simulation bypass is licensed and whose denied act is downgraded. Seated by the backend at
   *  run start from the injected tool definitions; absent ⇒ every destructive call is gated. */
  simulatableTools?: ReadonlySet<string>;
}

/**
 * Veto-storm limit: with the terminal protocol (toolChoice 'required') a model that cannot
 * satisfy a guard has no way to stop — it flails, and every vetoed round is a full LLM call
 * (measured: a 4B burned 15 consecutive vetoed rounds — 17 calls for 2 effective).
 * At this many consecutive vetoes the loop stops and the forced-terminal close runs.
 */
export const VETO_STORM_LIMIT = 3;

/** True when the turn is in a veto storm (see VETO_STORM_LIMIT). */
export function vetoStormHit(actionHistory: TurnActionHistory): boolean {
  return actionHistory.vetoStreak >= VETO_STORM_LIMIT;
}

export function createActionHistory(judge?: Judge, judgeTimeoutMs?: number, renderOpts?: RenderOpts): TurnActionHistory {
  return { observed: [], turnIndex: 0, producedThisTurn: [], turnCorrections: [], attachments: [], terminalReply: '', did: [], vetoStreak: 0, postToolViolations: [], inFlightCalls: [], attemptedCalls: [], currentUserText: '', history: [], approvals: [], consentThisTurn: [], approvalsIssuedThisTurn: [], destructiveLabels: {}, ...(judge ? { judge } : {}), ...(judgeTimeoutMs !== undefined ? { judgeTimeoutMs } : {}), ...(renderOpts ? { renderOpts } : {}) };
}

/** Reset the per-turn fields (the conversation-scoped `observed` and `history` are kept). `userText` is
 *  the current turn's incoming user message ('' when the turn is not opened by a fresh user message). */
export function beginTurn(actionHistory: TurnActionHistory, turnIndex: number, userText = ''): void {
  actionHistory.turnIndex = turnIndex;
  actionHistory.producedThisTurn = [];
  actionHistory.turnCorrections = [];
  actionHistory.attachments = [];
  actionHistory.terminalReply = '';
  actionHistory.did = [];
  actionHistory.vetoStreak = 0;
  actionHistory.postToolViolations = [];
  actionHistory.inFlightCalls = [];
  actionHistory.attemptedCalls = [];
  actionHistory.currentUserText = userText;
  actionHistory.approvalsIssuedThisTurn = [];
  // The user's own words are the ONLY thing that turns an open approval into consent, and they are read
  // exactly here — once per turn, by the runtime. No guard reads text.
  actionHistory.consentThisTurn = consumeApprovals(actionHistory.approvals, userText, turnIndex);
}

/**
 * Open a consent approval.
 *
 * An identical open one is left alone: a second identical question would render twice and be answered
 * once, and one act asks one question until it is answered. A DIFFERENT question about the same act
 * SUPERSEDES the old one — two open literals for one act would let the user answer a question they are
 * no longer being asked.
 */
function issueApproval(actionHistory: TurnActionHistory, c: { tool: string; subject?: string; meaning: string }): void {
  const token = approvalCode(c.meaning);
  const sameAct = (x: ApprovalRequest): boolean =>
    x.consumedTurn === undefined && !x.closed && x.tool === c.tool && x.subject === c.subject;
  if (actionHistory.approvals.some((x) => sameAct(x) && x.token === token)) return;
  for (const x of actionHistory.approvals) if (sameAct(x)) x.closed = true;
  const approval: ApprovalRequest = { ...c, token, issuedTurn: actionHistory.turnIndex };
  actionHistory.approvals.push(approval);
  actionHistory.approvalsIssuedThisTurn.push(approval);
}

/**
 * A destructive call was DENIED. The denial IS the question: attempting the act is what puts it on
 * the user's screen, so an agent cannot choose not to ask and still act.
 *
 * The question names the record the CALL names — `unsubscribeCustomer({customerId:'cust_2001'})`
 * raises `CONFIRM CUST_2001`, the same literal a simulation's answer would have raised. A call that
 * names no record falls back to the label the spec declared, and a call with neither raises nothing:
 * absence of both is absence of any possible consent.
 */
export function issueApprovalForVeto(actionHistory: TurnActionHistory, tool: string, args: Record<string, unknown> = {}): void {
  const [subject] = preferredIdentityValues(args);
  if (subject) return issueApproval(actionHistory, { tool, subject, meaning: subject });
  const meaning = actionHistory.destructiveLabels[tool];
  if (meaning) issueApproval(actionHistory, { tool, meaning });
}

/** Structural success check on a tool result ({success:false} / {error} / {PREREQ_NOT_MET} ⇒ failed). */
export function resultOk(r: unknown): boolean {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (o.success === false || o.PREREQ_NOT_MET === true || typeof o.error === 'string') return false;
  }
  return true;
}

/** Record a destructive attempt the runtime DOWNGRADED to its simulation (the call re-runs with
 *  `simulate: true`; the world was not reached by the bare form). The attempt is scoring surface —
 *  the agent reached for the act, and the downgrade repairs the conversation, not the mistake — so
 *  it lands in `attemptedCalls` and the guard-events log. It is not a veto: no observed row, no
 *  vetoStreak — the turn progresses. */
export function recordDowngradedAttempt(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>): void {
  actionHistory.attemptedCalls.push({ name, args });
  actionHistory.turnCorrections.push(`downgrade:confirmFirst:${name}`);
}

/** Record a guard VETO of a tool call (the call did not run). */
export function recordVeto(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>, correction: string): void {
  actionHistory.observed.push({ name, args, ok: false, turnIndex: actionHistory.turnIndex });
  // The blocked ATTEMPT — surfaced to the eval layer so a FORBIDDEN invariant can fire on it (the call
  // never reached the world, so it is invisible on the world action history by construction).
  actionHistory.attemptedCalls.push({ name, args });
  actionHistory.turnCorrections.push(correction);
  actionHistory.vetoStreak++;
}

/** Record an EXECUTED tool call's outcome (afterToolCall): ok flag, confirmation flag, produced label. */
export function recordToolResult(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>, output: unknown, world?: AgentWorld): void {
  actionHistory.vetoStreak = 0; // an executed call passed guards — the model is not looping
  const ok = output !== undefined && resultOk(output);
  const requiresConfirmation = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
  // Same-step reconcile: this call is now in `observed` — drop its provisional in-flight sibling
  // record to avoid double-counting it against a later same-step call.
  const inFlightIx = actionHistory.inFlightCalls.findIndex((o) => o.name === name && canonArgs(o.args) === canonArgs(args));
  if (inFlightIx >= 0) actionHistory.inFlightCalls.splice(inFlightIx, 1);
  // tookEffect: match this call against the world's action history (by name+args, like the in-flight
  // reconcile above) to learn whether it MUTATED the world — so a reply-honesty check (now `llmCheck`'s
  // job) can distinguish an action-success from a read-success and NOT veto an honest "cannot do X / no
  // record found" reply on a read-only turn.
  //
  // NO RECORD ⇒ UNKNOWN, NEVER `false`. Writing `tookEffect: false` whenever a world object is present
  // but holds no matching row would conflate "the world says it changed nothing" with "nobody recorded
  // what happened" — and a world whose action history nothing writes (the native-tools/MCP stub) would then
  // report every mutation as effect-free, making `destructiveThrottle`'s EFFECT-BEATS-FLAGS rule inert.
  // The field is OMITTED when there is no row, and the readers treat unknown as unverified rather than
  // as "no effect".
  const wtc = world
    ? [...world.toolCalls].reverse().find((t) => t.name === name && canonArgs((t.args ?? {}) as Record<string, unknown>) === canonArgs(args))
    : undefined;
  // The label THIS call's result issued, if any. It rides the observed entry (so the derived account can
  // name the acting call's own entity) AND the turn-wide `producedThisTurn` stream (which
  // the guard ctx and the domain `exhaustionReply` seams still read as a flat list of what was produced).
  const lbl = ok ? (output as { label?: unknown } | null | undefined)?.label : undefined;
  const producedLabel = typeof lbl === 'string' ? lbl : undefined;
  // The result's own sentence about what it did — authored in the world/tool, rendered
  // verbatim under the delivery so the fact arrives even when the prose forgets it.
  const rep = (output as { report?: unknown } | null | undefined)?.report;
  const report = typeof rep === 'string' && rep.trim() !== '' ? rep : undefined;
  actionHistory.observed.push({
    name,
    args,
    ok,
    turnIndex: actionHistory.turnIndex,
    ...(wtc ? { tookEffect: wtc.tookEffect === true } : {}),
    // PROVENANCE of the effect flag rides with it: a world that keeps its own action history ATTESTS the effect
    // per executor, while the native-tools path INFERS it from the result. Only the attested form carries
    // "this call mutated the world" for a tool the domain never listed (see ObservedCall.effectInferred).
    ...(wtc?.effectInferred === true ? { effectInferred: true } : {}),
    ...(requiresConfirmation ? { resultFlags: { requiresConfirmation: true } } : {}),
    ...(producedLabel !== undefined ? { producedLabel } : {}),
    ...(report !== undefined ? { report } : {}),
  });
  if (producedLabel !== undefined) actionHistory.producedThisTurn.push(producedLabel);
  // The world runs the two-step protocol itself: its "I need confirmation" answer NAMES the record, so
  // the question it raises is bound to that record and to nothing else.
  if (requiresConfirmation) {
    const [subject] = preferredIdentityValues(output);
    if (subject) issueApproval(actionHistory, { tool: name, subject, meaning: subject });
  } else if (wtc?.tookEffect === true) {
    // A write that LANDED moves the record, so every open question about it stops being true and closes.
    for (const subject of preferredIdentityValues(output)) closeApprovalsFor(actionHistory.approvals, subject);
  }
}

/** Record a terminal CALL in the observed action history. Called from the guard hooks' SYNCHRONOUS segment
 *  (before any await): the model runtime dispatches a step's tool calls concurrently (Promise.all)
 *  but STARTS them in emission order, so a synchronous hook-time push makes a same-step `respond`
 *  (whose `did` carries an `ask` intention) visible to a sibling destructive call's preTool checks —
 *  closing the noActAfterAskSameTurn same-step bypass. */
export function recordTerminalCall(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>): void {
  actionHistory.observed.push({ name, args, ok: true, turnIndex: actionHistory.turnIndex });
}

/**
 * Clear the DELIVERED terminal declaration — the reply text AND its structured `did`.
 *
 * The premature-terminal invalidation path (a terminal that shared its closing step with a domain call,
 * so its text was composed before that call's result existed) must clear the WHOLE delivered declaration,
 * not just the reply prose: an invalidated terminal's `did` is an equally-premature claim, and leaving it
 * on the action history would let the cross-check guards ground against — or history retain — a declaration the
 * user never saw. The backend calls this where core owns the invalidation seam; a single call keeps the
 * two fields in lockstep so no site can clear the text while orphaning the claims.
 *
 * It does NOT touch `observed`: the invalidated terminal's OBSERVATION is dropped by
 * {@link pruneSupersededTerminals} fed with `prematureTerminalCalls(steps)` — the backend runs both.
 */
export function clearDeliveredTerminal(actionHistory: TurnActionHistory): void {
  actionHistory.terminalReply = '';
  actionHistory.did = [];
}

/**
 * Drop terminal calls that were emitted but never DELIVERED. TWO producers feed it, one per ghost path:
 * `supersededTerminalCalls` (the within-step delivery contest) and `prematureTerminalCalls` (a terminal
 * that shared its step with domain work, so the premature policy invalidated it).
 *
 * Runs once the generation has resolved, so the hook-time record that gave a same-step sibling's preTool
 * checks visibility of an ask (`respond` whose `did` carries an `ask` intention) has already done its
 * job; what is corrected here is the evidence a LATER check reads — this turn's `pendingConfirmMustAsk`
 * fallback and every later turn's consent scan, where an undelivered question must not read as consent
 * obtained. Returns the names actually pruned, for the turn's recovery log.
 */
export function pruneSupersededTerminals(
  actionHistory: TurnActionHistory,
  undelivered: Array<{ name: string; args: Record<string, unknown> }>,
): string[] {
  const pruned: string[] = [];
  for (const s of undelivered) {
    const ix = actionHistory.observed.findIndex(
      (o) => o.turnIndex === actionHistory.turnIndex && o.name === s.name && canonArgs(o.args) === canonArgs(s.args),
    );
    if (ix >= 0) {
      actionHistory.observed.splice(ix, 1);
      pruned.push(s.name);
    }
  }
  return pruned;
}

/** Capture the DELIVERED respond's declaration (the observed push happens at hook time via
 *  recordTerminalCall). The user-facing prose is `respond`'s `message` arg; the structured intentions
 *  ride `did`, and asking is an `ask` intention among them.
 *  All of it is the DELIVERED terminal's — captured together, gated on a non-empty `message` and last-wins, so
 *  they track the exact respond the runtime delivers (the last ok respond with non-empty message,
 *  consistent with `supersededTerminalCalls`). An ill-shaped `did` is not silently dropped: the
 *  well-formed subset is stored and a `claims-invalid:<n>` correction records the defect count. */
export function recordTerminal(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>): void {
  const text = typeof args.message === 'string' ? args.message : '';
  if (!text.trim()) return;
  actionHistory.terminalReply = text;
  const { claims, errors } = validateClaims(args.did);
  actionHistory.did = claims;
  if (errors.length) actionHistory.turnCorrections.push(`claims-invalid:${errors.length}`);
}

/**
 * Seal the CURRENT turn into `action history.history` once its `reply` is finalized — so the NEXT turn's guards
 * see it as read-only conversation context (user text included). Assembled purely from the action history:
 *   · toolCalls  — the non-terminal calls EXECUTED this turn (a guard-vetoed call is excluded here; it
 *                  never reached the world and rides `attemptedCalls`). `result` is joined from the
 *                  world action history when `world` is passed; `ok`/`tookEffect` come from the observed entry.
 *   · userText   — the turn's incoming message (`action history.currentUserText`).
 *   · guardEvents — the turn's recovery/correction log.
 * The pushed entry (and its arrays) is FROZEN: `ctx.history` is read-only by construction.
 */
export function recordTurnHistory(actionHistory: TurnActionHistory, reply: string, world?: AgentWorld): void {
  const vetoed = new Set(actionHistory.attemptedCalls.map((a) => a.name + '|' + canonArgs(a.args as Record<string, unknown>)));
  const toolCalls: HistoryToolCall[] = actionHistory.observed
    .filter((o) => o.turnIndex === actionHistory.turnIndex && !isTerminal(o.name) && !vetoed.has(o.name + '|' + canonArgs(o.args)))
    .map((o) => {
      const wtc = world?.toolCalls.find(
        (t) => t.name === o.name && canonArgs((t.args ?? {}) as Record<string, unknown>) === canonArgs(o.args),
      );
      return Object.freeze({
        name: o.name,
        args: o.args,
        ok: o.ok,
        ...(o.tookEffect !== undefined ? { tookEffect: o.tookEffect } : {}),
        ...(wtc && 'result' in wtc ? { result: (wtc as { result?: unknown }).result } : {}),
      }) as HistoryToolCall;
    });
  const entry: HistoryTurn = Object.freeze({
    turnIndex: actionHistory.turnIndex,
    userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn,
    reply,
    toolCalls: Object.freeze(toolCalls),
    // The turn's DELIVERED, VERIFIED claims: finalizeReply syncs `action history.did` to what it actually
    // delivered (the accepted/salvaged payload's did, or the engine-derived exhaustion set), so history
    // retains the grounded set — never a raw or fabricated declaration. Frozen entry-and-claim so
    // `ctx.history[n].did` is read-only by construction.
    did: Object.freeze(actionHistory.did.map((c) => Object.freeze({ ...c }))),
    attemptedCalls: Object.freeze(actionHistory.attemptedCalls.map((a) => Object.freeze({ ...a }))),
    guardEvents: Object.freeze(actionHistory.turnCorrections.slice()),
  });
  actionHistory.history.push(entry);
}
