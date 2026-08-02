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
 * Type-only imports: this is the spine every later layer (ledger plumbing, cross-check guards, renderer,
 * and the agentspec domain extension) depends on, so it stays a pure leaf at RUNTIME — the single
 * `ObservedCall` import below is `import type` (erased by the compiler), so no runtime cycle forms even
 * though `rules.ts` names `TurnClaim` from here.
 */
import type { ObservedCall } from '../rules.js';

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

// ── The did → operation-report RENDERER (engine-owned) ──────────────────────────────────────────────

/**
 * Options for {@link renderOperationReport}. `renderClaim` is the DOMAIN language seam: given a verified
 * claim and its resolved core outcome, it returns the one-liner the user reads for that operation (domain
 * wording + language). Absent ⇒ the engine's neutral English default. `outcomes` is the domain outcome map
 * (a domain word like `'settled'` → `'success'`) so the renderer resolves a claim's core meaning the same
 * way the cross-check guards do.
 */
export interface RenderOpts {
  renderClaim?: (c: TurnClaim, core: CoreOutcome) => string;
  outcomes?: OutcomeMap;
}

/**
 * The ENGINE default one-liner for a verified claim, keyed on its CORE outcome.
 *
 * It renders the claim's `target` (the entity label/id the world itself named) and NOTHING ELSE — never
 * the advisory `op` (model-authored text that could carry a tool name or internal token), never a tool
 * name, never the word `respond`. When no `target` is present the line is a neutral generic sentence (the
 * "one action completed" shape the exhaustion closure calls for), so a leak is impossible by construction.
 */
function defaultClaimLine(claim: TurnClaim, core: CoreOutcome): string {
  const t = claim.target;
  switch (core) {
    case 'success':
      return t ? `${t}: done` : 'One action completed.';
    case 'not_found':
      return t ? `${t}: no record found` : 'No matching record was found.';
    case 'pending_confirmation':
      return t ? `${t}: awaiting your confirmation` : 'Awaiting your confirmation.';
    case 'failure':
      return t ? `${t}: could not be completed` : 'An action could not be completed.';
    case 'blocked':
      return t ? `${t}: not permitted` : 'An action was not permitted.';
    case 'refused':
      return t ? `${t}: declined` : 'An action was declined.';
    case 'no_op':
      return t ? `${t}: nothing needed changing` : 'Nothing needed changing.';
  }
}

/**
 * Render the user-facing OPERATION REPORT from a VERIFIED `did` — the operational sentences the user reads
 * come from ledger-grounded structure, never from the agent's free prose, so a fabricated claim cannot
 * reach the user. One line per claim; a claim whose outcome does not resolve to a core meaning names no
 * ledger fact and is skipped (it never survives the cross-check guards, so this is defensive only). A
 * domain overrides the wording per-claim via {@link RenderOpts.renderClaim}. Empty `did` ⇒ `''`.
 */
export function renderOperationReport(did: TurnClaim[], opts?: RenderOpts): string {
  const lines: string[] = [];
  for (const claim of did) {
    const core = resolveOutcome(claim.outcome, opts?.outcomes);
    if (core === null) continue;
    const line = opts?.renderClaim ? opts.renderClaim(claim, core) : defaultClaimLine(claim, core);
    if (line && line.trim()) lines.push(line.trim());
  }
  return lines.join('\n');
}

/**
 * Derive the TRUE claims from the world ledger — the engine's own honest account of what this turn did,
 * used when the redrive loop exhausts (the model never produced a groundable declaration, so the engine
 * builds one it CAN stand behind). For each of THIS turn's observed calls:
 *   · a WRITE that took effect  → `success` (its produced label as `target`, when the world issued one)
 *   · a WRITE with a pending-confirmation result flag → `pending_confirmation`
 *   · a WRITE that ran but returned `ok:false` → `failure`
 *   · a WRITE that ran ok yet took NO effect (a probe) → contributes NOTHING (it changed nothing)
 *   · a READ (any non-write, incl. the runtime terminal) → contributes NOTHING
 * Produced labels are consumed positionally across the effected writes; a write with no label available
 * yields a claim with no `target`, which {@link renderOperationReport} renders as a generic completed-action
 * line — so this NEVER leaks a tool name (it names produced labels or nothing). `op` is a neutral advisory
 * label; the renderer default ignores it, so it is safe.
 */
export function deriveClaimsFromLedger(
  observed: ObservedCall[],
  turnIndex: number,
  writeTools: readonly string[],
  produced: string[],
): TurnClaim[] {
  const writes = new Set(writeTools);
  const claims: TurnClaim[] = [];
  let labelIx = 0;
  for (const o of observed) {
    if (o.turnIndex !== turnIndex) continue;
    if (!writes.has(o.name)) continue; // reads / terminals contribute nothing
    if (o.resultFlags?.requiresConfirmation === true) {
      claims.push({ op: 'operation', outcome: 'pending_confirmation' });
      continue;
    }
    if (o.tookEffect === true) {
      const label = produced[labelIx++];
      claims.push(label ? { op: label, target: label, outcome: 'success' } : { op: 'operation', outcome: 'success' });
      continue;
    }
    if (o.ok === false) {
      claims.push({ op: 'operation', outcome: 'failure' });
      continue;
    }
    // a write that ran ok but took no effect (a probe) changed nothing → no claim.
  }
  return claims;
}
