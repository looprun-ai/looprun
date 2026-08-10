/**
 * THE CONSENT APPROVAL REQUEST — the engine's own question about a destructive act, and the literal the user
 * types back to agree to it.
 *
 * The agent writes no part of it: it does not compose the sentence, it does not name what the act
 * authorizes, and it does not report the answer. It only ATTEMPTS the act, and attempting is what puts
 * the question on the user's screen.
 *
 * ```
 *   agent calls     cancelBooking({bookingId:'bk_1001'})
 *   engine vetoes   and stores THAT CALL, arguments and all
 *   engine renders  To confirm cancelling a dispatch, reply: CONFIRM CANCELBOOKING-3F7A
 *   user types      "yes, CONFIRM CANCELBOOKING-3F7A"  → that same call runs
 *   user types      "go ahead"                         → denied; the question is asked again
 *   agent calls     cancelBooking({bookingId:'bk_1002'})  → a DIFFERENT call, a different question
 * ```
 *
 * THE LICENCE IS THE CALL. Nothing about the call is elected as its subject — the engine stores the whole
 * call, and the literal is derived from all of it. Two calls that differ in any argument are two acts and
 * ask two questions, so a consent given for one can never reach the other.
 *
 * WHY THE ENGINE OWNS THE MEANING. If the token stood for nothing on its own, the sentence around it
 * would have to come from the agent, and the agent would be free to misframe what agreeing does:
 *
 * ```
 *   engine   To confirm, reply: CONFIRM 1
 *   agent    "Reply CONFIRM 1 to leave everything as it is."
 *   user     "CONFIRM 1"                       → everything is deleted
 * ```
 *
 * So an approval request always carries a MEANING fixed before the conversation started — the label the
 * spec declared for the act — while the literal is derived from the call the agent actually made.
 */
import { valueSpokenBy } from '../guards/matching.js';
import { canonArgs } from '../guards/flow.js';

/** One pending consent question. */
export interface ApprovalRequest {
  /** The destructive tool this approval licenses. */
  tool: string;
  /** The exact call the question was raised on. The licence covers these arguments and no others. */
  args?: Record<string, unknown>;
  /** What the user is agreeing to, in words: the label the spec declared for this act. */
  meaning: string;
  /** The literal the user types back. */
  token: string;
  issuedTurn: number;
  /** The turn on which the user's own words carried the token. An approval request licenses its act only on that
   *  turn: consent is single use, and the act it consents to belongs to the message that gave it. */
  consumedTurn?: number;
  /** The question no longer stands: the call it names has taken effect, or a newer question about the same
   *  call replaced it. A closed approval can never be consumed — the user would be agreeing to a sentence
   *  that is no longer true of the world. */
  closed?: boolean;
}

/**
 * Does this approval license THIS call?
 *
 * Every argument the user was shown must still be there, unchanged. An argument the model added on the
 * retry is not part of what was agreed to, and {@link stripToLicensed} removes it before the call runs —
 * so an extra field can neither widen a licence nor invalidate one.
 *
 * ```
 *   licensed   payInvoice {invoiceId:'inv_7001', amount:2930}
 *   retried    payInvoice {invoiceId:'inv_7001', amount:2930, idempotencyKey:'CBBD'}  → licensed
 *   retried    payInvoice {invoiceId:'inv_7001', amount:500}                          → NOT licensed
 * ```
 */
export function approvalMatchesCall(
  c: ApprovalRequest,
  tool: string,
  args: Record<string, unknown>,
): boolean {
  if (c.tool !== tool) return false;
  if (c.args === undefined) return true;
  return Object.entries(c.args).every(([k, v]) => canonArgs(args[k]) === canonArgs(v));
}

/**
 * THE LITERAL IS AN ANSWER, NOT A VALUE — remove it from the call it licenses.
 *
 * A model that reads `CONFIRM PAYINVOICE-CBBD` off the screen sees a short code beside an optional
 * field and fills the field with it. The act then carries an argument the user never agreed to, and the
 * licence is for a call that no longer exists:
 *
 * ```
 *   licensed   payInvoice {invoiceId:'inv_7001', amount:2930}
 *   the model  payInvoice {invoiceId:'inv_7001', amount:2930, idempotencyKey:'CBBD'}
 *   what runs  payInvoice {invoiceId:'inv_7001', amount:2930}
 * ```
 *
 * ONLY the engine's own literal is removed. A field the WORLD's protocol needs — its own
 * `confirmed: true`, the schema's `simulate` — is the domain speaking, not the model copying, and it
 * passes through untouched.
 */
export function stripToLicensed(
  approvals: readonly ApprovalRequest[],
  tool: string,
  args: Record<string, unknown>,
): void {
  const c = approvals.find(
    (x) =>
      x.tool === tool &&
      x.args !== undefined &&
      Object.entries(x.args).every(([k, v]) => canonArgs(args[k]) === canonArgs(v)),
  );
  if (!c?.args) return;
  const licensed = c.args;
  const parts = c.token.split(/[\s-]+/).filter((w) => w.length >= 3);
  for (const [k, v] of Object.entries(args)) {
    if (k in licensed) continue;
    if (typeof v !== 'string') continue;
    if (parts.some((w) => w.toUpperCase() === v.toUpperCase())) delete args[k];
  }
}

/**
 * Mark every OPEN approval whose token the user's message carries, and return the ones just consumed.
 *
 * Single use: an already-consumed approval is never consumed again, so one typed literal licenses one
 * act. A closed approval is skipped — its sentence is no longer true of the world.
 */
export function consumeApprovals(
  open: ApprovalRequest[],
  userText: string,
  turnIndex: number,
): ApprovalRequest[] {
  const consumed: ApprovalRequest[] = [];
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (!valueSpokenBy(c.token, userText)) continue;
    c.consumedTurn = turnIndex;
    consumed.push(c);
  }
  return consumed;
}

/**
 * Close every open question about a call that has taken effect. The user was asked to agree to a
 * sentence about the world; once that sentence stops being true of it, the agreement it asks for is not
 * the one they would be giving.
 */
export function closeApprovalsForCall(
  open: ApprovalRequest[],
  tool: string,
  args: Record<string, unknown>,
): void {
  const canon = canonArgs(args);
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (c.tool === tool && canonArgs(c.args ?? {}) === canon) c.closed = true;
  }
}
