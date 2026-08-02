/**
 * @looprun-ai/core runtime — the per-conversation observation LEDGER (framework-free).
 *
 * The ledger is what guards read (`ctx.observed`, `producedThisTurn`, …): the model's own verified
 * tool activity, plus the turn-structured `history` (user text included, since the firewall was
 * retired 2026-08-02). `observed` and `history` accumulate for the whole conversation; the other
 * fields reset per turn via `beginTurn`.
 */
import type { AgentWorld, Guard, ObservedCall, HistoryTurn, HistoryToolCall, Adjudicator } from '../rules.js';
import { canonArgs } from '../guards/index.js';
import { isTerminal } from './terminal.js';
import { validateClaims, type TurnClaim } from './claims.js';

/** An OUTPUT-dim (postTool) result-invariant failure OR a flowChain restate — carried on the ledger
 *  and JOINED into the onReply violation set so the same bounded no-tools redrive relays its text. */
export interface PostToolViolation {
  guard: Guard;
  reason: string;
}

export interface TurnLedger {
  observed: ObservedCall[];
  turnIndex: number;
  producedThisTurn: string[];
  turnCorrections: string[];
  attachments: string[];
  terminalReply: string;
  /** The CURRENT turn's DELIVERED structured claim of operations — the delivered `respond`'s `did`
   *  (the last ok respond carrying a non-empty `message`, consistent with the superseded-terminal
   *  pruning). Read into the reply-side GuardCtx as `ctx.did` so the cross-check guards (T4) ground the
   *  agent's DECLARATION against the world ledger. Reset per turn by `beginTurn`. */
  did: TurnClaim[];
  /** Whether that delivered `respond` posed a clarifying question (`asked:true`). Reset per turn. */
  asked: boolean;
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
   *  ATTEMPT the guard blocked, not only on a world-ledger entry (which, for a veto, never exists). */
  attemptedCalls: Array<{ name: string; args: unknown }>;
  /** The user's incoming message for the CURRENT turn (set by `beginTurn`). Read into every GuardCtx as
   *  `ctx.userText`; onInput reads it as the real incoming text. Reset per turn. */
  currentUserText: string;
  /** The COMPLETED conversation turns — accumulated across the whole conversation (NOT reset by
   *  beginTurn), read into every GuardCtx as the read-only `ctx.history`. A turn lands here via
   *  {@link recordTurnHistory} once its reply is finalized. */
  history: HistoryTurn[];
  /** The host-registered LLM adjudicator (set at ledger creation from the runtime options), threaded
   *  into every GuardCtx as `ctx.adjudicator`. Only `llmCheck` guards read it. Conversation-scoped;
   *  never reset per turn. Absent ⇒ a spec that installs an llmCheck fails loud at conversation start. */
  adjudicator?: Adjudicator;
  /** The adjudicator TIMEOUT (ms) from the registration seam, threaded into every GuardCtx alongside
   *  `adjudicator`. Conversation-scoped; never reset per turn. Absent ⇒ the guard's own default. */
  adjudicatorTimeoutMs?: number;
}

/**
 * Veto-storm limit: with the terminal protocol (toolChoice 'required') a model that cannot
 * satisfy a guard has no way to stop — it flails, and every vetoed round is a full LLM call
 * (measured: a 4B burned 15 consecutive vetoed rounds — 17 calls for 2 effective).
 * At this many consecutive vetoes the loop stops and the forced-terminal close runs.
 */
export const VETO_STORM_LIMIT = 3;

/** True when the turn is in a veto storm (see VETO_STORM_LIMIT). */
export function vetoStormHit(ledger: TurnLedger): boolean {
  return ledger.vetoStreak >= VETO_STORM_LIMIT;
}

export function createLedger(adjudicator?: Adjudicator, adjudicatorTimeoutMs?: number): TurnLedger {
  return { observed: [], turnIndex: 0, producedThisTurn: [], turnCorrections: [], attachments: [], terminalReply: '', did: [], asked: false, vetoStreak: 0, postToolViolations: [], inFlightCalls: [], attemptedCalls: [], currentUserText: '', history: [], ...(adjudicator ? { adjudicator } : {}), ...(adjudicatorTimeoutMs !== undefined ? { adjudicatorTimeoutMs } : {}) };
}

/** Reset the per-turn fields (the conversation-scoped `observed` and `history` are kept). `userText` is
 *  the current turn's incoming user message ('' when the turn is not opened by a fresh user message). */
export function beginTurn(ledger: TurnLedger, turnIndex: number, userText = ''): void {
  ledger.turnIndex = turnIndex;
  ledger.producedThisTurn = [];
  ledger.turnCorrections = [];
  ledger.attachments = [];
  ledger.terminalReply = '';
  ledger.did = [];
  ledger.asked = false;
  ledger.vetoStreak = 0;
  ledger.postToolViolations = [];
  ledger.inFlightCalls = [];
  ledger.attemptedCalls = [];
  ledger.currentUserText = userText;
}

/** Structural success check on a tool result ({success:false} / {error} / {PREREQ_NOT_MET} ⇒ failed). */
export function resultOk(r: unknown): boolean {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (o.success === false || o.PREREQ_NOT_MET === true || typeof o.error === 'string') return false;
  }
  return true;
}

/** Record a guard VETO of a tool call (the call did not run). */
export function recordVeto(ledger: TurnLedger, name: string, args: Record<string, unknown>, correction: string): void {
  ledger.observed.push({ name, args, ok: false, turnIndex: ledger.turnIndex });
  // The blocked ATTEMPT — surfaced to the eval layer so a FORBIDDEN invariant can fire on it (the call
  // never reached the world, so it is invisible on the world ledger by construction).
  ledger.attemptedCalls.push({ name, args });
  ledger.turnCorrections.push(correction);
  ledger.vetoStreak++;
}

/** Record an EXECUTED tool call's outcome (afterToolCall): ok flag, confirmation flag, produced label. */
export function recordToolResult(ledger: TurnLedger, name: string, args: Record<string, unknown>, output: unknown, world?: AgentWorld): void {
  ledger.vetoStreak = 0; // an executed call passed guards — the model is not looping
  const ok = output !== undefined && resultOk(output);
  const requiresConfirmation = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
  // Same-step reconcile: this call is now in `observed` — drop its provisional in-flight sibling
  // record to avoid double-counting it against a later same-step call.
  const inFlightIx = ledger.inFlightCalls.findIndex((o) => o.name === name && canonArgs(o.args) === canonArgs(args));
  if (inFlightIx >= 0) ledger.inFlightCalls.splice(inFlightIx, 1);
  // tookEffect: match this call against the world's ledger (by name+args, like the in-flight
  // reconcile above) to learn whether it MUTATED the world — so a reply-honesty check (now `llmCheck`'s
  // job) can distinguish an action-success from a read-success and NOT veto an honest "cannot do X / no
  // record found" reply on a read-only turn.
  const wtc = world
    ? [...world.toolCalls].reverse().find((t) => t.name === name && canonArgs((t.args ?? {}) as Record<string, unknown>) === canonArgs(args))
    : undefined;
  ledger.observed.push({
    name,
    args,
    ok,
    turnIndex: ledger.turnIndex,
    ...(world ? { tookEffect: wtc?.tookEffect === true } : {}),
    ...(requiresConfirmation ? { resultFlags: { requiresConfirmation: true } } : {}),
  });
  if (ok) {
    const lbl = (output as { label?: unknown } | null | undefined)?.label;
    if (typeof lbl === 'string') ledger.producedThisTurn.push(lbl);
  }
}

/** Record a terminal CALL in the observed ledger. Called from the guard hooks' SYNCHRONOUS segment
 *  (before any await): the model runtime dispatches a step's tool calls concurrently (Promise.all)
 *  but STARTS them in emission order, so a synchronous hook-time push makes a same-step `respond`
 *  (with `asked:true`) visible to a sibling destructive call's preTool checks — closing the
 *  noActAfterAskSameTurn same-step bypass. */
export function recordTerminalCall(ledger: TurnLedger, name: string, args: Record<string, unknown>): void {
  ledger.observed.push({ name, args, ok: true, turnIndex: ledger.turnIndex });
}

/**
 * Drop terminal calls that were emitted but never DELIVERED (see `supersededTerminalCalls`). Runs
 * once the generation has resolved, so the hook-time record that gave a same-step sibling's preTool
 * checks visibility of an ask (`respond` with `asked:true`) has already done its job; what is corrected here is the
 * cross-turn evidence, where an undelivered question must not read as consent obtained.
 * Returns the names actually pruned, for the turn's recovery log.
 */
export function pruneSupersededTerminals(
  ledger: TurnLedger,
  superseded: Array<{ name: string; args: Record<string, unknown> }>,
): string[] {
  const pruned: string[] = [];
  for (const s of superseded) {
    const ix = ledger.observed.findIndex(
      (o) => o.turnIndex === ledger.turnIndex && o.name === s.name && canonArgs(o.args) === canonArgs(s.args),
    );
    if (ix >= 0) {
      ledger.observed.splice(ix, 1);
      pruned.push(s.name);
    }
  }
  return pruned;
}

/** Capture the DELIVERED respond's declaration (the observed push happens at hook time via
 *  recordTerminalCall). The user-facing prose is `respond`'s `message` arg (SCG, 2026-08-02 — was
 *  `text`); the structured operations ride `did`, and `asked` marks a clarifying question. All three
 *  are the DELIVERED terminal's — captured together, gated on a non-empty `message` and last-wins, so
 *  they track the exact respond the runtime delivers (the last ok respond with non-empty message,
 *  consistent with `supersededTerminalCalls`). An ill-shaped `did` is not silently dropped: the
 *  well-formed subset is stored and a `claims-invalid:<n>` correction records the defect count. */
export function recordTerminal(ledger: TurnLedger, name: string, args: Record<string, unknown>): void {
  const text = typeof args.message === 'string' ? args.message : '';
  if (!text.trim()) return;
  ledger.terminalReply = text;
  const { claims, errors } = validateClaims(args.did);
  ledger.did = claims;
  ledger.asked = args.asked === true;
  if (errors.length) ledger.turnCorrections.push(`claims-invalid:${errors.length}`);
}

/**
 * Seal the CURRENT turn into `ledger.history` once its `reply` is finalized — so the NEXT turn's guards
 * see it as read-only conversation context (user text included). Assembled purely from the ledger:
 *   · toolCalls  — the non-terminal calls EXECUTED this turn (a guard-vetoed call is excluded here; it
 *                  never reached the world and rides `attemptedCalls`). `result` is joined from the
 *                  world ledger when `world` is passed; `ok`/`tookEffect` come from the observed entry.
 *   · userText   — the turn's incoming message (`ledger.currentUserText`).
 *   · guardEvents — the turn's recovery/correction log.
 * The pushed entry (and its arrays) is FROZEN: `ctx.history` is read-only by construction.
 */
export function recordTurnHistory(ledger: TurnLedger, reply: string, world?: AgentWorld): void {
  const vetoed = new Set(ledger.attemptedCalls.map((a) => a.name + '|' + canonArgs(a.args as Record<string, unknown>)));
  const toolCalls: HistoryToolCall[] = ledger.observed
    .filter((o) => o.turnIndex === ledger.turnIndex && !isTerminal(o.name) && !vetoed.has(o.name + '|' + canonArgs(o.args)))
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
    turnIndex: ledger.turnIndex,
    userText: ledger.currentUserText,
    reply,
    toolCalls: Object.freeze(toolCalls),
    // The turn's DELIVERED claims (Task 4 will feed the VERIFIED set; for now what the ledger holds),
    // frozen entry-and-claim so `ctx.history[n].did` is read-only by construction.
    did: Object.freeze(ledger.did.map((c) => Object.freeze({ ...c }))),
    asked: ledger.asked,
    attemptedCalls: Object.freeze(ledger.attemptedCalls.map((a) => Object.freeze({ ...a }))),
    guardEvents: Object.freeze(ledger.turnCorrections.slice()),
  });
  ledger.history.push(entry);
}
