/**
 * THE CONSENT CHALLENGE — the engine's own question about a destructive act, and the literal the user
 * types back to agree to it.
 *
 * The agent writes no part of it: it does not compose the sentence, it does not name what the act
 * authorizes, and it does not report the answer. It only ATTEMPTS the act, and attempting is what puts
 * the question on the user's screen.
 *
 * ```
 *   world says      cancelBooking → requiresConfirmation on BK-1
 *   engine renders  To confirm BK-1, reply: CONFIRM BK-1
 *   user types      "yes, CONFIRM BK-1"        → cancelBooking({id:'BK-1'}) runs
 *   user types      "go ahead"                 → denied; the question is asked again
 *   user types      "cancel the BK-12"         → denied; BK-12 is not BK-1
 * ```
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
 * So a challenge always carries a MEANING fixed before the conversation started — the record identity the
 * world issued, or the label the spec declared — and the token is derived from it.
 */
import { targetMatchesValue, valueSpokenBy } from '../guards/matching.js';

/** One pending consent question. */
export interface Challenge {
  /** The destructive tool this challenge licenses. */
  tool: string;
  /** The record identity the world issued for the act. Absent when the act names no identifiable
   *  record, in which case the challenge is keyed on its tool alone. */
  subject?: string;
  /** What the user is agreeing to, in words: the world's record identity, or the spec's declared label. */
  meaning: string;
  /** The literal the user types back. */
  token: string;
  issuedTurn: number;
  /** The turn on which the user's own words carried the token. A challenge licenses its act only on that
   *  turn: consent is single use, and the act it consents to belongs to the message that gave it. */
  consumedTurn?: number;
  /** The question no longer stands: the record it names has changed, or a newer question about the same
   *  act replaced it. A closed challenge can never be consumed — the user would be agreeing to a sentence
   *  that is no longer true of the world. */
  closed?: boolean;
}

/** The first word of every consent token. Keeping it to one word keeps the whole literal to two, which
 *  is what a person can retype from memory rather than copy. */
const TOKEN_PREFIX = 'CONFIRM';

/** The distinguishing part of a token, DERIVED from a meaning: its first two words, upper-cased and
 *  hyphen-joined. Deterministic, so the same act always asks for the same literal. */
export function deriveToken(meaning: string): string {
  const words: string[] = [];
  for (const raw of meaning.trim().split(/\s+/u)) {
    const w = raw.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
    if (w) words.push(w);
    if (words.length === 2) break;
  }
  return words.join('-').toUpperCase();
}

/** The full literal a challenge asks for: the prefix and the derived part. */
export function challengeToken(meaning: string): string {
  return `${TOKEN_PREFIX} ${deriveToken(meaning)}`;
}

/**
 * Does this challenge license THIS call?
 *
 * A challenge that names a record licenses a call of that tool on that record — one of the call's own
 * argument values must BE the subject, by whole-value equality, so a consent given for `BK-1` never
 * reaches `BK-12`. A challenge with no record licenses its tool, which is the only thing it can be about.
 */
export function challengeMatchesCall(
  c: Challenge,
  tool: string,
  args: Record<string, unknown>,
): boolean {
  if (c.tool !== tool) return false;
  const subject = c.subject;
  if (subject === undefined) return true;
  return Object.values(args).some((v) => typeof v === 'string' && targetMatchesValue(subject, v));
}

/**
 * Mark every OPEN challenge whose token the user's message carries, and return the ones just consumed.
 *
 * Single use: an already-consumed challenge is never consumed again, so one typed literal licenses one
 * act. A closed challenge is skipped — its sentence is no longer true of the world.
 */
export function consumeChallenges(
  open: Challenge[],
  userText: string,
  turnIndex: number,
): Challenge[] {
  const consumed: Challenge[] = [];
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (!valueSpokenBy(c.token, userText)) continue;
    c.consumedTurn = turnIndex;
    consumed.push(c);
  }
  return consumed;
}

/**
 * Close every open question about a record whose state has moved. The user was asked to agree to a
 * sentence about the world; once that sentence stops being true of it, the agreement it asks for is not
 * the one they would be giving.
 */
export function closeChallengesFor(open: Challenge[], subject: string): void {
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (c.subject !== undefined && targetMatchesValue(c.subject, subject)) c.closed = true;
  }
}
