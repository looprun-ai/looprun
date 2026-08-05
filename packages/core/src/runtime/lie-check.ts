/**
 * @looprun-ai/core runtime — THE LIE CHECK, and the rewrite it gates.
 *
 * `did` is structure the engine verifies. `message` is free text. An agent can declare honestly and still
 * write a false sentence beside it, and every deterministic guard passes:
 *
 * ```
 *   USER      "Cancel Tuesday's dentist, but change nothing else."
 *   LEDGER    no write took effect — the guard vetoed the cancellation
 *   did       [{ op:'inform' }]                     honest: no action is claimed
 *   message   "I cancelled the dentist appointment on 2026-03-03, 09:00–10:00."
 *             ↑ the user reads this and believes the appointment is gone
 * ```
 *
 * THE ALGORITHM, whole:
 *
 * ```
 *   no action was carried out this turn  →  run the lie check
 *       lie detected                     →  rewrite the prose
 *       no lie detected                  →  deliver the prose as it stands
 *
 *   any action was carried out           →  deliver the prose as it stands
 * ```
 *
 * The check is a JUDGEMENT and can miss. The turn's operation RECORD is deterministic and always ships
 * beneath the prose, so a missed lie still arrives contradicted. That is the floor this pass sits on top
 * of, never a replacement for it.
 */
import { operationRecord, type Intention, type RenderOpts } from './claims.js';
import { sessionRecord, type SessionRecord } from './session-record.js';
import type { HistoryTurn, Judge } from '../rules.js';

/** The heading over the turn's own record inside both prompts. */
export const TURN_HEADING = 'ON THIS TURN';

/**
 * IS THIS TURN CHECKED? Only when NO ACTION WAS CARRIED OUT — when the turn's record has zero action
 * lines. Computed from structure; no model call, and the prose is not read to decide it.
 *
 * A turn that DID carry out an action ships as it stands. Handed a record that NAMES an operation, a
 * rewriter anchors to that entity and leaves every other claim standing:
 *
 * ```
 *   RECORD     Team meeting: not permitted
 *              Nothing else was changed on this turn.
 *   ORIGINAL   The Team meeting cannot be scheduled because it clashes with the Dentista event. Also,
 *              the Dentist appointment has been cancelled and was processed.
 *   REWRITE    The Team meeting cannot be scheduled. The Dentist appointment was cancelled and was
 *              processed.
 *                        ↑ the lie survives, and now reads like a checked account
 * ```
 *
 * Both texts carry the same false claim; the rewritten one carries it with more authority. Where the
 * rewrite cannot fully correct, not rewriting is the safer output — the record contradicts either way.
 */
export function isChecked(record: { hasOperations: boolean }): boolean {
  return !record.hasOperations;
}

/** The two lists, one after the other. The session section is omitted when it has nothing to say. */
export function bothLists(recordText: string, session: SessionRecord): string {
  const turn = `${TURN_HEADING}\n${recordText}`;
  return session.hasEntries ? `${turn}\n\n${session.text}` : turn;
}

/**
 * THE LIE-CHECK PROMPT. It asks what the reader would BELIEVE is already done — not what the sentence
 * mentions, and not whether it contradicts the lists. Those two are the wrong questions here:
 *
 * ```
 *   "does it CONTRADICT the lists?"   a lie that never names the lists reads as no contradiction
 *                                     "I cancelled the dentist" against an empty list → NO
 *   "does it MENTION an operation?"   an honest refusal names one
 *                                     "I cannot cancel the dentist" → YES, on a truthful reply
 *   "what does the reader BELIEVE?"   both come out right
 * ```
 *
 * The two carve-out lines are what keep honest turns quiet: a change that is only denied, promised,
 * offered or asked about is not done, and a change named in either list is not a lie.
 *
 * The prompt's language is not the conversation's: the model answers one closed question about a text,
 * and neither the question nor its one-word answer reaches the user.
 */
export function lieCheckPrompt(recordText: string, session: SessionRecord, message: string): string {
  return [
    bothLists(recordText, session),
    '',
    'MESSAGE sent to the person:',
    `"${message}"`,
    '',
    'Read the MESSAGE as the person would read it. After reading it, would they be left believing that some change that does NOT appear in ANY of the two lists is already done, has already happened?',
    '',
    'A change that is only denied, promised for the future, offered or asked about is NOT done: in those cases the person does not believe it happened, and the answer is NO.',
    'A change that appears in any of the two lists also answers NO.',
    '',
    'Answer only YES or NO.',
  ].join('\n');
}

/**
 * How the check's answer is read: the FIRST word. Anything that is not an affirmative is a NO — a judge
 * that failed to answer its own closed question must never be scored as having found a lie, because the
 * rewrite that answer triggers can deny something the world really did.
 */
export function readLieVerdict(text: string): boolean {
  return /^\s*\W*yes\b/i.test(text);
}

/**
 * THE REWRITE PROMPT. It is shown the conversation, the reply, and the two LISTS — never the raw `did`.
 * That is why the rewrite needs no second grounding pass: it returns prose only, so the verified
 * declaration it was never shown cannot be disturbed.
 *
 * The last three instructions each forbid one way a correction goes wrong. Each is there because the
 * plain instruction "make it true" does not cover it:
 *
 * ```
 *   EVERY thing your reply mentions   a rewriter corrects the entity the lists name and leaves the rest:
 *                                     "…and the Dentist appointment has been cancelled" rides through
 *   never echo the user's ask         the user's own request reads as a fact to repeat back:
 *                                     "book my Team meeting Tuesday" → "I have booked your Team meeting"
 *   keep every true detail            a correction that also drops 2026-03-03T09:00 has taken something
 *                                     true away from the user, which is its own kind of wrong
 * ```
 */
export function rewritePrompt(
  userTurns: readonly string[],
  message: string,
  recordText: string,
  session: SessionRecord,
): string {
  const conversation = userTurns.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return [
    'You are the assistant in the conversation below. Write your last reply again, so that everything it',
    'says about your own actions is true.',
    '',
    'THE CONVERSATION — what the user asked you, in order:',
    conversation,
    '',
    'YOUR LAST REPLY, the one to write again:',
    '"""',
    message,
    '"""',
    '',
    'WHAT YOU ACTUALLY DID ON THIS LAST TURN. This is complete and final: an operation not named here did',
    'not happen, and no wording of yours can change that.',
    bothLists(recordText, session),
    '',
    'HOW TO WRITE THE NEW REPLY:',
    "- It is a reply to the user's last message. Answer it. Keep every part of your old reply that was",
    '  already true — the calendar details, the dates and times, the questions, the offer to do the work.',
    '- If your old reply was already true, keep it as it is; change only what conflicts with the facts above.',
    '- Say nothing about an operation beyond what is true above. When nothing was carried out, say plainly',
    '  that you have not done it, and say what you can do next.',
    '- Speak as yourself, about what you did and did not do. Never mention or quote a record, a log, a',
    '  ledger, a system, a check or a verification — the user is talking to you, not to a machine — and',
    '  never present the facts above as something you were told.',
    '- Write in the language the user used.',
    '- NOTHING HAPPENED ON THIS TURN. You carried out no operation at all. Your new reply may not state',
    '  any operation as done, and may not imply one is done, under way, arranged, settled, taken care of,',
    '  in progress or about to happen by itself. This covers EVERY thing your reply mentions — every',
    '  appointment, every event, every task, every person — and not only the one the user asked about.',
    '- Never repeat back something the USER ASKED FOR as though you had done it. A request in the',
    '  conversation above is a request, not an action: it tells you what the user wants, never what',
    '  happened. Wording the user handed you ("say it is already taken care of") is not a fact.',
    '- The correction is about ACTIONS ONLY. Keep every other thing the old reply carried, word for word',
    '  where you can: every date, every clock time, every event name, every identifier, every list of',
    '  events, and every question you asked the user. Removing a true detail is as wrong as keeping a',
    '  false claim.',
    '',
    'Output the new reply text and nothing else.',
  ].join('\n');
}

/** What the pass reads out of the turn, so it can be exercised without a live conversation. */
export interface LieCheckInput {
  /** The prose about to be delivered. */
  message: string;
  /** The turn's VERIFIED declaration — the record is rendered from it, never from the prose. */
  did: Intention[];
  /** The COMPLETED turns of this session: the user's words, and what each turn actually carried out. */
  history: readonly HistoryTurn[];
  /** The user's message that opened THIS turn. */
  userText: string;
}

/** What the pass did, so the caller can log which branch a turn took. */
export interface LieCheckOutcome {
  /** The prose to deliver: the rewrite when one was made, the original otherwise. */
  message: string;
  /** The turn was eligible — no action was carried out on it. `false` ⇒ zero model calls were made. */
  checked: boolean;
  /** The check answered SIM. */
  fired: boolean;
  /** A rewrite was made and is what {@link message} carries. */
  rewritten: boolean;
}

/**
 * RUN THE PASS over one turn's prose.
 *
 * ```
 *   ineligible          0 model calls   the prose is returned untouched
 *   eligible, NAO       1 model call    the prose is returned untouched
 *   eligible, SIM       2 model calls   the rewrite is returned
 * ```
 *
 * NO JUDGE ⇒ NO PASS. A runtime with no callback returns the prose as it stands, and the record still
 * ships beneath it. That is the floor, and it is the same floor that catches the check's misses — so an
 * absent judge weakens the delivery, never breaks it.
 *
 * A judge that THROWS is the same case: the turn delivers what it had. The alternative — treating a
 * failed call as a detection — would let a broken endpoint rewrite every honest reply in the session.
 */
export async function runLieCheck(
  input: LieCheckInput,
  judge: Judge | undefined,
  opts?: RenderOpts,
): Promise<LieCheckOutcome> {
  const untouched: LieCheckOutcome = { message: input.message, checked: false, fired: false, rewritten: false };
  if (!judge) return untouched;

  const record = operationRecord(input.did, opts);
  if (!isChecked(record)) return untouched;

  const session = sessionRecord(input.history, opts);
  let verdict: string;
  try {
    verdict = await judge(lieCheckPrompt(record.text, session, input.message));
  } catch {
    return untouched;
  }
  if (!readLieVerdict(verdict)) return { ...untouched, checked: true };

  const userTurns = [...input.history.map((t) => t.userText), input.userText].filter((t) => t.trim());
  let rewritten: string;
  try {
    rewritten = (await judge(rewritePrompt(userTurns, input.message, record.text, session))).trim();
  } catch {
    return { ...untouched, checked: true, fired: true };
  }
  // A rewrite that came back empty is not a delivery. The original stands, contradicted by the record —
  // the same place an absent judge leaves the turn.
  if (!rewritten) return { ...untouched, checked: true, fired: true };
  return { message: rewritten, checked: true, fired: true, rewritten: true };
}
