/**
 * @looprun-ai/core runtime — THE DISCLOSURE: what an act does, in the domain's own sentence, filled
 * from the records this conversation read and from what the act itself returned.
 *
 * The model is not in the path. It does not compose the sentence, it cannot soften it, and it cannot
 * omit it: the engine prints it.
 *
 * THE SENTENCE SPEAKS IN THREE TENSES, and a domain authors whichever ones its act needs.
 *
 * ```
 *   before   above the consent question, from the READS      "…leaves €270 to charge."
 *   after    at the act, from the ACT'S OWN result           "€270 charged: €900 is now held."
 *   later    in the operation record, from an EARLIER turn   "bk_1001 already holds €900…"
 * ```
 *
 * WHY `before` BINDS TO THE RECORDS THE QUESTION IS ABOUT. One read tool commonly answers about two
 * different records in one turn — the record being acted on, and the person acting:
 *
 * ```
 *   the act is updateMemberRole({memberId:'mem_1004', role:'owner'})
 *
 *   getMember({memberId:'mem_1004'})  → Sam Whitfield, billing     the person being promoted
 *   getMember({})                     → Dana Okafor, owner         the acting user
 *
 *   latest call wins   "Promoting Dana Okafor to owner…"    the engine names the wrong person
 *                                                           in a privilege-escalation question
 *   call-bound         "Promoting Sam Whitfield to owner…"  what the user is being asked
 * ```
 *
 * So a `before` slot reads the latest SUCCESSFUL call of its read tool whose RESULT carries one of the
 * values the licensed call carries. When no read names one — a read that answers about a related
 * entity, such as a technician's schedule for a booking — a SINGLE call of that tool is unambiguous and
 * stands on its own. Several calls and no name match is genuinely ambiguous, and the marker says so.
 */
import type { DomainContract } from '../assembled-prompt.js';
import type { ObservedCall } from '../rules.js';
import type { ApprovalRequest } from './approval-request.js';
import type { TurnActionHistory } from './action-history.js';

/** `{` identifier (`.` step)* `}`, where a step may be an INDEX: `holds.0.id` reaches the first row of
 *  a list. A brace pair of any other shape is not a slot: the engine renders it verbatim rather than
 *  guessing what an author meant. */
const SLOT = /\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*)\}/g;

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

/** Every scalar the licensed call carries — the records the question is about, without inspecting a
 *  single key name. */
function approvalValues(approval: ApprovalRequest): string[] {
  const out: string[] = [];
  const walkAll = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) return void v.forEach(walkAll);
    if (typeof v === 'object') return void Object.values(v as Record<string, unknown>).forEach(walkAll);
    out.push(String(v));
  };
  walkAll(approval.args);
  return out;
}

/** Walk a dot path over a result. A step off a non-object yields nothing. */
function walk(result: unknown, steps: readonly string[]): unknown {
  let current: unknown = result;
  for (const step of steps) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/**
 * The value ONE `before` slot renders, or `undefined` when nothing grounds it.
 *
 * A record is not a value: a path landing on an object or an array yields nothing, because a sentence
 * carrying `[object Object]` states nothing the reader can act on.
 */
function slotValue(
  observed: readonly ObservedCall[],
  readTool: string,
  steps: readonly string[],
  subjects: readonly string[],
): unknown {
  const ofTool = observed.filter((c) => c.name === readTool && c.ok && 'result' in c);
  if (!ofTool.length) return undefined;
  const named = ofTool.filter((c) => subjects.some((x) => namesSubject(c.result, x)));
  const bound = named.length ? named[named.length - 1] : ofTool.length === 1 ? ofTool[0] : undefined;
  if (!bound) return undefined;
  const value = walk(bound.result, steps);
  if (value === null || value === undefined) return undefined;
  return typeof value === 'object' ? undefined : value;
}

/**
 * The sentence printed above ONE approval's consent question, or `null` when the domain declares no
 * `before` for that tool.
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
  const template = contract?.disclose?.[approval.tool]?.before;
  if (!template) return null;
  const missing = contract?.discloseMissing ?? MISSING;
  const subjects = approvalValues(approval);
  return template.replace(SLOT, (_literal, path: string) => {
    const [readTool, ...steps] = path.split('.');
    const value = slotValue(actionHistory.observed, readTool, steps, subjects);
    return value === undefined ? missing : String(value);
  });
}

/** Fill a sentence from ONE result: every slot's first step names the source and is dropped. */
function fillFrom(sentence: string, result: unknown, missing: string): string {
  return sentence.replace(SLOT, (_literal, path: string) => {
    const v = walk(result, path.split('.').slice(1));
    return v === null || v === undefined || typeof v === 'object' ? missing : String(v);
  });
}

/** Does this result carry a value for EVERY slot the sentence names? */
function fillsEverySlot(sentence: string, result: unknown): boolean {
  for (const m of sentence.matchAll(SLOT)) {
    const v = walk(result, m[1].split('.').slice(1));
    if (v === null || v === undefined || typeof v === 'object') return false;
  }
  return true;
}

/**
 * `after` — what THIS call did, from its own result.
 *
 * THE RESULT DECIDES, NOT THE CALL. A sentence is printed when the result carries a value for every
 * slot it names, and is silent otherwise — so what the engine states is always a fact:
 *
 * ```
 *   payInvoice returned the payment      "2930 recorded against inv_7001: it is now paid…"
 *   payInvoice was refused               (silent — the result holds no payment to describe)
 *   getPlanUsage returned the usage      "…using 6 of 15 seats and 2 of 40 bookings."
 * ```
 *
 * A READ is served by the same rule: a domain that authors a sentence for one gets it printed on the
 * turn that read it, which is the only place the engine can speak when the turn refuses and no act
 * ever runs.
 */
export function renderAfterAct(
  tool: string,
  result: unknown,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
): string {
  const template = contract?.disclose?.[tool]?.after;
  if (!template || !fillsEverySlot(template, result)) return '';
  return fillFrom(template, result, contract?.discloseMissing ?? MISSING);
}

/** `later` — what an act of an EARLIER turn left standing, from the most recent one that took effect.
 *  It rides the operation record, where the engine already speaks about acts. */
export function renderLater(
  actionHistory: TurnActionHistory,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
): string {
  const missing = contract?.discloseMissing ?? MISSING;
  const out: string[] = [];
  for (const [tool, entry] of Object.entries(contract?.disclose ?? {})) {
    if (!entry?.later) continue;
    const prior = [...(actionHistory?.observed ?? [])]
      .reverse()
      .find((c) => c.name === tool && c.tookEffect === true && 'result' in c && c.turnIndex < actionHistory.turnIndex);
    if (prior) out.push(fillFrom(entry.later, prior.result, missing));
  }
  return out.join('\n');
}
