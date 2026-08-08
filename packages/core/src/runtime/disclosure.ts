/**
 * @looprun-ai/core runtime — THE DISCLOSURE: what agreeing to a destructive act would do, in the
 * domain's own sentence, filled from the records THIS conversation read.
 *
 * The model is not in the path. It does not compose the sentence, it cannot soften it, and it cannot
 * omit it: the engine prints it above the consent question the same attempt raised.
 *
 * WHY A SLOT BINDS TO THE SUBJECT AND NOT TO THE LATEST CALL. One read tool commonly answers about
 * two different records in one turn — the record being acted on, and the person acting:
 *
 * ```
 *   the act is updateMemberRole(mem_1004 → owner)
 *
 *   getMember({memberId:'mem_1004'})  → Sam Whitfield, billing     the person being promoted
 *   getMember({})                     → Dana Okafor, owner         the acting user
 *
 *   latest call wins   "Promoting Dana Okafor to owner…"    the engine names the wrong person
 *                                                           in a privilege-escalation question
 *   subject-bound      "Promoting Sam Whitfield to owner…"  what the user is being asked
 * ```
 *
 * So a slot reads the latest SUCCESSFUL call of its read tool whose RESULT carries the approval's
 * subject as a whole string value. No such call — including an approval that names no record at all —
 * and the slot renders the placeholder.
 */
import type { DomainContract } from '../assembled-prompt.js';
import type { ObservedCall } from '../rules.js';
import type { ApprovalRequest } from './approval-request.js';
import type { TurnActionHistory } from './action-history.js';

/** `{` identifier (`.` identifier)* `}`. A brace pair of any other shape is not a slot: the engine
 *  renders it verbatim rather than guessing what an author meant. */
const SLOT = /\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\}/g;

/** The default marker for a slot that resolves to nothing. */
const MISSING = 'NA';

/** Does this result carry `needle` as a whole string value, at any depth? */
function namesSubject(v: unknown, needle: string): boolean {
  if (typeof v === 'string') return v === needle;
  if (Array.isArray(v)) return v.some((x) => namesSubject(x, needle));
  if (v !== null && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).some((x) => namesSubject(x, needle));
  }
  return false;
}

/** Walk a dot path over a result. A step off a non-object yields nothing. */
function walk(result: unknown, steps: readonly string[]): unknown {
  let current = result;
  for (const step of steps) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/**
 * The value ONE slot renders, or `undefined` when nothing grounds it.
 *
 * A record is not a value: a path landing on an object or an array yields nothing, because a sentence
 * carrying `[object Object]` states nothing the reader can act on.
 */
function slotValue(
  observed: readonly ObservedCall[],
  readTool: string,
  steps: readonly string[],
  subject: string | undefined,
): unknown {
  if (subject === undefined) return undefined;
  let bound: unknown;
  let found = false;
  for (const call of observed) {
    if (call.name !== readTool || !call.ok || !('result' in call)) continue;
    if (!namesSubject(call.result, subject)) continue;
    bound = call.result;
    found = true;
  }
  if (!found) return undefined;
  const value = walk(bound, steps);
  if (value === null || value === undefined) return undefined;
  return typeof value === 'object' ? undefined : value;
}

/**
 * The sentence printed above ONE approval's consent question, or `null` when the domain declares none
 * for that tool.
 *
 * PURE: no clock, no entropy, no I/O. Its whole input is the approval, the contract and the
 * conversation's observed calls — whose results are written by the same hook whether a world executed
 * the call or the tool executed itself, so both execution paths serve a slot identically.
 */
export function renderDisclosure(
  approval: ApprovalRequest,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
  actionHistory: TurnActionHistory,
): string | null {
  const template = contract?.disclose?.[approval.tool];
  if (!template) return null;
  const missing = contract?.discloseMissing ?? MISSING;
  return template.replace(SLOT, (_literal, path: string) => {
    const [readTool, ...steps] = path.split('.');
    const value = slotValue(actionHistory.observed, readTool, steps, approval.subject);
    return value === undefined ? missing : String(value);
  });
}
