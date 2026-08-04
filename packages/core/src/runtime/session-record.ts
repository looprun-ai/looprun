/**
 * @looprun-ai/core runtime — WHAT THE SESSION HAS ALREADY DONE.
 *
 * The turn's own record answers "what changed on THIS turn". That is the right scope for the user, and
 * the wrong scope for a check that reads the prose: a reply which truthfully reports something an EARLIER
 * turn did looks like a lie against a record scoped to this one.
 *
 * ```
 *   turn 1   user: "Cancel my lunch with Marina."      → the world cancels it
 *   turn 2   user: "Thanks."                           ← the turn being checked
 *
 *   the turn record   No operation was carried out on this turn.     correct
 *   the message       "Your lunch with Marina was cancelled…"        true, from turn 1
 *   without this list the check reads that as a lie, and the rewrite it triggers DENIES a real
 *   cancellation — the dangerous direction.
 * ```
 *
 * So the check and the rewriter are shown a SECOND list: one line per distinct entity the session has
 * changed, carrying its latest state. It is INPUT ONLY — the user receives the turn's record alone.
 */
import { operationRecord, resolveOutcome, type Intention, type RenderOpts } from './claims.js';
import { targetMatchesValue } from '../guards/honesty.js';
import type { HistoryTurn } from '../rules.js';

/**
 * The heading the session list carries into both prompts. Printed only when the session has changed
 * something — an empty heading would read as an assertion that the session did nothing, which is a
 * different claim from having nothing to add.
 *
 * Nothing here reaches the user: the session list is input to two model calls and to nothing else.
 */
export const SESSION_HEADING = 'ALREADY DONE IN THIS SESSION';

/** One line per distinct entity, its latest state, over the whole session. */
export interface SessionRecord {
  /** `<entity>: <state>` lines, in first-touched order. */
  lines: string[];
  /** The session has changed something. `false` ⇒ {@link text} is empty and the section is omitted. */
  hasEntries: boolean;
  /** The list as the prompts carry it, heading included. Empty string when there is nothing to say. */
  text: string;
}

/**
 * SUCCESS ONLY, and this is load-bearing rather than a simplification.
 *
 * The check's rule is "an alteration named in either list is not a lie". A line for an attempt that was
 * BLOCKED or FAILED would therefore silence the check on exactly the claim it exists to catch:
 *
 * ```
 *   turn 1   the guard vetoes the cancellation   → the turn record says "Dentist: not permitted"
 *   turn 2   the message says "I cancelled the Dentist"
 *            with a blocked line in the session list, the check answers NO — the lie ships
 * ```
 *
 * Only what the world actually carried out belongs in a list that licenses a claim.
 */
function isCarriedOut(claim: Intention, outcomes?: RenderOpts['outcomes']): boolean {
  return resolveOutcome(claim.outcome ?? '', outcomes) === 'success';
}

/**
 * The KEY an entity folds on. Identity is the claim's `target` — the label or id the WORLD issued, which
 * the cross-check guards already grounded — compared by {@link targetMatchesValue}, the one boundary
 * predicate every grounding verdict in the engine routes through. There is no second identity rule here.
 *
 * A carried-out claim with no `target` names no entity, so it folds on its rendered LINE instead: the
 * engine's targetless success line is one fixed sentence, so any number of them collapse to one.
 */
function keyFor(keys: readonly string[], claim: Intention, line: string): string {
  const target = claim.target;
  if (target === undefined) return line;
  return keys.find((k) => targetMatchesValue(target, k)) ?? target;
}

/**
 * Fold the SESSION's completed turns into one line per entity, the latest state winning.
 *
 * ```
 *   turn 1   Lunch with Marina: cancelled          three turns, one entity,
 *   turn 3   Lunch with Marina: rescheduled        one line — the last state
 *   turn 5   Dentist: cancelled                    a second entity, a second line
 *
 *   → Lunch with Marina: rescheduled
 *     Dentist: cancelled
 * ```
 *
 * SOURCE is each completed turn's DELIVERED, VERIFIED `did` — the same structure the turn's own record
 * was rendered from, accumulated instead of reset. WORDING is the same renderer too, so a domain's
 * `renderClaim` speaks in both lists or in neither.
 *
 * SCOPE is the whole session: no turn window, never reset. A window bounded by turns cuts the wrong
 * thing — it can drop exactly the turn that performed the action, and the misfire above returns. The
 * bound here is how many DISTINCT things the session touched, which grows far slower than turns do.
 *
 * The CURRENT turn is deliberately absent: the check runs only on a turn whose record has no action
 * line at all, so the current turn has nothing to contribute to it.
 */
export function sessionRecord(history: readonly HistoryTurn[], opts?: RenderOpts): SessionRecord {
  const byEntity = new Map<string, string>();
  for (const turn of history) {
    for (const claim of turn.did) {
      if (!isCarriedOut(claim, opts?.outcomes)) continue;
      // One claim through the shared renderer: its `lines` is the rendered line, or empty when the
      // domain seam returned nothing for it.
      const [line] = operationRecord([claim], opts).lines;
      if (!line) continue;
      byEntity.set(keyFor([...byEntity.keys()], claim, line), line);
    }
  }
  const lines = [...byEntity.values()];
  return {
    lines,
    hasEntries: lines.length > 0,
    text: lines.length ? [SESSION_HEADING, ...lines].join('\n') : '',
  };
}
