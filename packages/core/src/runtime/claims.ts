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
 * The RESERVED, engine-core, domain-neutral SPEECH ops (MI-D2). An intention whose `op` is one of these
 * is a SPEECH act: it classifies the `message`'s speech act, is NOT backed by a tool, is NOT grounded
 * against the world ledger, and carries NO action `outcome`/`amount`. Every other op is an ACTION op —
 * domain-declared, backed by a write, and REQUIRED to carry an `outcome`. A domain may not redefine
 * these four names.
 */
export const SPEECH_OPS = ['inform', 'greet', 'refuse', 'ask'] as const;

/** One of the four reserved speech ops (see {@link SPEECH_OPS}). */
export type SpeechOp = (typeof SPEECH_OPS)[number];

const SPEECH_OP_SET: ReadonlySet<string> = new Set(SPEECH_OPS);

/** True when `op` is one of the four reserved SPEECH ops. Partition predicate for MI-D2. */
export function isSpeechOp(op: string): op is SpeechOp {
  return SPEECH_OP_SET.has(op);
}

/** True when `op` is an ACTION op — anything that is not a reserved speech op (= `!isSpeechOp`). */
export function isActionOp(op: string): boolean {
  return !isSpeechOp(op);
}

/**
 * One structured INTENTION the agent declares about ONE thing it did this turn (MI-D2).
 *
 * Two disjoint families keyed off `op` (see {@link SPEECH_OPS}): a SPEECH intention (`inform`/`greet`/
 * `refuse`/`ask`) classifies the `message`'s speech act and carries NO `outcome`/`amount`; an ACTION
 * intention (any other `op`) is backed by a write and MUST carry an `outcome`. `op` is an ADVISORY label —
 * the cross-check NEVER keys on its semantics; grounding is `target` + `outcome` against the ledger.
 * `outcome` (ACTION only) is a {@link CoreOutcome} or a domain word declared in the spec's {@link OutcomeMap};
 * `target` is the entity label/id acted on; `amount` an optional magnitude (ACTION only). `outcome` is
 * OPTIONAL at the type level (speech ops carry none); {@link validateClaims} enforces the partition rule.
 */
export interface Intention {
  op: string;
  target?: string;
  outcome?: string;
  amount?: number;
}

/**
 * @deprecated Transitional alias for {@link Intention} — the SCG name. Kept so the SCG-era importers
 * (rules/trunk/ledger/turn/honesty) and their tests compile without a rename churn; new code names
 * `Intention`. Removed once the last importer is migrated.
 */
export type TurnClaim = Intention;

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
 * STRUCTURAL validation of a raw `did` value — SHAPE + the speech/action PARTITION (MI-D1/D2), never
 * grounding against the ledger (that is the guards' job). Exhaustive typed checks, NOT `typeof`/`trim`
 * guesses (the red-team broke those):
 *   · `did` MUST be a NON-EMPTY array — an empty `did` is an error (MI-D1: every respond declares ≥1
 *     intention; there is no "honest empty" turn).
 *   · `op` must be a non-empty string; `target`, when present, a non-empty string; any unknown key is an error.
 *   · An ACTION op (`op ∉ SPEECH_OPS`) REQUIRES a non-empty string `outcome`, and `amount`, when present,
 *     a FINITE number.
 *   · A SPEECH op (`op ∈ SPEECH_OPS`) MUST NOT carry `outcome` or `amount` (a speech act is not grounded).
 * Returns the well-formed intentions plus one error string per defect.
 */
export function validateClaims(did: unknown): { claims: Intention[]; errors: string[] } {
  if (!Array.isArray(did)) {
    return { claims: [], errors: [`did must be an array, got ${did === null ? 'null' : typeof did}`] };
  }
  if (did.length === 0) {
    return { claims: [], errors: ['did must declare at least one intention (an empty did is not allowed)'] };
  }
  const claims: Intention[] = [];
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
    if ('target' in rec && !isNonEmptyString(rec.target)) local.push(`did[${i}].target must be a non-empty string when present`);
    // The outcome/amount rules depend on the op partition, so they apply only once `op` is a valid string.
    const opStr = isNonEmptyString(rec.op) ? rec.op : undefined;
    if (opStr !== undefined) {
      if (isSpeechOp(opStr)) {
        if ('outcome' in rec) local.push(`did[${i}] speech op "${opStr}" must not carry an outcome`);
        if ('amount' in rec) local.push(`did[${i}] speech op "${opStr}" must not carry an amount`);
      } else {
        if (!isNonEmptyString(rec.outcome)) local.push(`did[${i}].outcome must be a non-empty string for action op "${opStr}"`);
        if ('amount' in rec && !(typeof rec.amount === 'number' && Number.isFinite(rec.amount))) {
          local.push(`did[${i}].amount must be a finite number when present`);
        }
      }
    }
    if (local.length) {
      errors.push(...local);
      return;
    }
    const claim: Intention = { op: rec.op as string };
    if ('target' in rec) claim.target = rec.target as string;
    if ('outcome' in rec) claim.outcome = rec.outcome as string;
    if ('amount' in rec) claim.amount = rec.amount as number;
    claims.push(claim);
  });
  return { claims, errors };
}

/**
 * The payload one `respond` call carries: the non-operational user-facing prose and the structured
 * intentions of the turn. Asking is no longer a bare boolean (MI-D3) — a question is declared as an
 * `ask` speech-intention in `did` (see {@link hasAskIntent}), so `asked` is gone from the payload.
 */
export interface RespondPayload {
  message: string;
  did: Intention[];
}

/**
 * TOLERANT extraction of a `respond` call's args into a {@link RespondPayload} — never throws. A missing
 * or non-string `message` becomes `''`, and a missing/empty/ill-shaped `did` becomes `[]` (only the
 * well-formed intentions survive; the strict mandatory-non-empty rejection is {@link validateClaims}' job
 * at the ledger/guard boundary).
 */
export function respondPayload(args: Record<string, unknown>): RespondPayload {
  return {
    message: typeof args.message === 'string' ? args.message : '',
    did: validateClaims(args.did).claims,
  };
}

/** True when the turn's `did` carries an `ask` intention (MI-D3) — the structured replacement for the
 *  retired `asked` boolean. Every consent/ask gate reads "the turn posed a question" through this.
 *  Takes a READONLY array so a frozen `HistoryTurn.did` is read without copying. */
export function hasAskIntent(did: readonly Intention[]): boolean {
  return did.some((i) => i.op === 'ask');
}

/**
 * True when this observed call is the ASK event: the single `respond` terminal whose `did` carries an
 * `ask` intention (MI-D3). The bare `asked` boolean is retired — asking is now a declared `did`
 * intention like every other, extracted through {@link respondPayload}. Confirmation/consent guards key
 * on this instead of a tool name or a flag.
 */
export function isAskEvent(o: { name: string; args?: Record<string, unknown> }): boolean {
  return o.name === 'respond' && hasAskIntent(respondPayload(o.args ?? {}).did);
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
    // A speech intention carries no outcome (`undefined`) → resolves to null → renders no operation line
    // (MI-D5: the `message` is the speech surface). resolveOutcome takes a string, so coerce absent → ''.
    const core = resolveOutcome(claim.outcome ?? '', opts?.outcomes);
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
