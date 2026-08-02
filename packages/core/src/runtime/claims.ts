/**
 * @looprun-ai/core runtime — the STRUCTURED TURN-CLAIM core (framework-free).
 *
 * The honesty guards used to read the reply PROSE, and the red-team broke that structurally:
 * a literal `replyMentions('BK-1')` passes on a reply that says BK-1 was NOT found — a text check
 * cannot read polarity.
 * The fix is to stop making prose the thing guards read. The agent DECLARES what it did as
 * STRUCTURE (`did: TurnClaim[]`), and the cross-check guards (T2) ground that declaration against the
 * world ledger — which the agent does not control. This module owns the domain-neutral vocabulary of
 * that structure: the core outcome set, the claim shape + its STRICT validation, the domain→core
 * outcome resolution, and the tolerant extraction of one `respond` call's payload.
 *
 * No imports: this is the spine every later layer (ledger plumbing, cross-check guards, renderer,
 * and the agentspec domain extension) depends on, so it stays a pure leaf.
 */

/** The CORE, domain-neutral, ledger-checkable outcome vocabulary. Every claim ultimately means one of
 *  these; a domain outcome word MUST map to one (see {@link OutcomeMap} / {@link resolveOutcome}). */
export type CoreOutcome =
  | 'success'
  | 'failure'
  | 'not_found'
  | 'blocked'
  | 'refused'
  | 'pending_confirmation'
  | 'no_op';

/** The core outcomes as a runtime value — iteration + membership. Frozen: it is the vocabulary of record. */
export const CORE_OUTCOMES: readonly CoreOutcome[] = Object.freeze([
  'success',
  'failure',
  'not_found',
  'blocked',
  'refused',
  'pending_confirmation',
  'no_op',
]);

const CORE_OUTCOME_SET: ReadonlySet<string> = new Set(CORE_OUTCOMES);

/** True when `s` is one of the seven core outcome words. */
export function isCoreOutcome(s: string): s is CoreOutcome {
  return CORE_OUTCOME_SET.has(s);
}

/**
 * One structured claim the agent makes about ONE operation it attempted this turn.
 *
 * `op` is an ADVISORY label (what the agent calls the operation) — the cross-check NEVER keys on its
 * semantics; grounding is `target` + `outcome` against the ledger. `outcome` is a {@link CoreOutcome}
 * or a domain word declared in the spec's {@link OutcomeMap}. `target` is the entity label/id acted on;
 * `amount` an optional magnitude (e.g. a refunded value).
 */
export interface TurnClaim {
  op: string;
  target?: string;
  outcome: string;
  amount?: number;
}

/** Domain outcome vocabulary: every non-core outcome word MUST map to a {@link CoreOutcome}, so the
 *  ledger cross-check stays engine-owned and never becomes semantic. */
export type OutcomeMap = Readonly<Record<string, CoreOutcome>>;

/**
 * Resolve an outcome word to its core meaning. Core meaning WINS: a map entry keyed by a core outcome
 * is ignored (a domain word may not shadow `success`). A non-core word resolves through `map`; a word
 * that is neither core nor mapped returns `null` — an undeclared outcome, which is a violation by
 * construction (the caller reports it; this function only classifies).
 */
export function resolveOutcome(outcome: string, map?: OutcomeMap): CoreOutcome | null {
  if (isCoreOutcome(outcome)) return outcome;
  if (map && Object.prototype.hasOwnProperty.call(map, outcome)) return map[outcome];
  return null;
}

/** A non-empty string after trimming — the field law for `op` / `target` / `outcome`. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const CLAIM_KEYS: ReadonlySet<string> = new Set(['op', 'target', 'outcome', 'amount']);

/**
 * STRUCTURAL validation of a raw `did` value — SHAPE only (grounding against the ledger is the guards'
 * job). Exhaustive typed checks, NOT `typeof`/`trim` guesses (the red-team broke those): `op` and
 * `outcome` must be non-empty strings; `target`, when present, a non-empty string; `amount`, when
 * present, a FINITE number; any unknown key on a claim is an error. `[]` is VALID — a read-only / ask
 * turn legitimately did nothing. Returns the well-formed claims plus one error string per defect.
 */
export function validateClaims(did: unknown): { claims: TurnClaim[]; errors: string[] } {
  if (!Array.isArray(did)) {
    return { claims: [], errors: [`did must be an array, got ${did === null ? 'null' : typeof did}`] };
  }
  const claims: TurnClaim[] = [];
  const errors: string[] = [];
  did.forEach((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`did[${i}] must be an object`);
      return;
    }
    const rec = item as Record<string, unknown>;
    const local: string[] = [];
    for (const key of Object.keys(rec)) {
      if (!CLAIM_KEYS.has(key)) local.push(`did[${i}] has unknown key "${key}"`);
    }
    if (!isNonEmptyString(rec.op)) local.push(`did[${i}].op must be a non-empty string`);
    if (!isNonEmptyString(rec.outcome)) local.push(`did[${i}].outcome must be a non-empty string`);
    if ('target' in rec && !isNonEmptyString(rec.target)) local.push(`did[${i}].target must be a non-empty string when present`);
    if ('amount' in rec && !(typeof rec.amount === 'number' && Number.isFinite(rec.amount))) {
      local.push(`did[${i}].amount must be a finite number when present`);
    }
    if (local.length) {
      errors.push(...local);
      return;
    }
    const claim: TurnClaim = { op: rec.op as string, outcome: rec.outcome as string };
    if ('target' in rec) claim.target = rec.target as string;
    if ('amount' in rec) claim.amount = rec.amount as number;
    claims.push(claim);
  });
  return { claims, errors };
}

/**
 * The payload one `respond` call carries: the non-operational user-facing prose, the structured claim
 * of operations, and whether this turn poses a question.
 */
export interface RespondPayload {
  message: string;
  did: TurnClaim[];
  asked: boolean;
}

/**
 * TOLERANT extraction of a `respond` call's args into a {@link RespondPayload} — never throws. A missing
 * or non-string `message` becomes `''`, a missing/ill-shaped `did` becomes `[]` (only the well-formed
 * claims survive; strict rejection is {@link validateClaims}' job at the guard boundary), and `asked`
 * is true only when it is exactly the boolean `true`.
 */
export function respondPayload(args: Record<string, unknown>): RespondPayload {
  return {
    message: typeof args.message === 'string' ? args.message : '',
    did: validateClaims(args.did).claims,
    asked: args.asked === true,
  };
}

/**
 * True when this observed call is the ASK event: the single `respond` terminal with `asked:true`. The
 * two-terminal protocol is retired — `askUser`/`replyToUser` are DEAD — so "the user was asked" is now
 * a FIELD (`asked`) on the one terminal, not a separate tool name. Confirmation/consent guards key on
 * this instead of a tool name.
 */
export function isAskEvent(o: { name: string; args?: Record<string, unknown> }): boolean {
  return o.name === 'respond' && o.args?.asked === true;
}
