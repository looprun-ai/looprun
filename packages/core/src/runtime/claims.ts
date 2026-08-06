/**
 * @looprun-ai/core runtime — the STRUCTURED TURN-CLAIM core (framework-free).
 *
 * PROSE IS NOT THE THING GUARDS READ: a literal mention scan for `BK-1` passes on a reply that says
 * BK-1 was NOT found, because a text check cannot read polarity. So the agent DECLARES what it did as
 * STRUCTURE (`did: Intention[]`), and the cross-check guards ground that declaration against the
 * world ledger — which the agent does not control. This module owns the domain-neutral vocabulary of
 * that structure: the core outcome set, the claim shape + its STRICT validation, the domain→core
 * outcome resolution, and the tolerant extraction of one `respond` call's payload.
 *
 * Type-only imports: this is the spine every later layer (ledger plumbing, cross-check guards, renderer,
 * and the agentspec domain extension) depends on, so it stays a pure leaf at RUNTIME — the single
 * `ObservedCall` import below is `import type` (erased by the compiler), so no runtime cycle forms even
 * though `rules.ts` names `Intention` from here.
 */
import type { ObservedCall } from '../rules.js';
import { resolveEngineText, type EngineText } from './engine-text.js';

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
 * The RESERVED, engine-core, domain-neutral SPEECH ops. An intention whose `op` is one of these
 * is a SPEECH act: it classifies the `message`'s speech act, is NOT backed by a tool, is NOT grounded
 * against the world ledger, and carries NO action `outcome`/`amount`. Every other op is an ACTION op —
 * domain-declared, backed by a write, and REQUIRED to carry an `outcome`. A domain may not redefine
 * these four names.
 */
export const SPEECH_OPS = ['inform', 'greet', 'refuse', 'ask'] as const;

/** One of the four reserved speech ops (see {@link SPEECH_OPS}). */
export type SpeechOp = (typeof SPEECH_OPS)[number];

const SPEECH_OP_SET: ReadonlySet<string> = new Set(SPEECH_OPS);

/** True when `op` is one of the four reserved SPEECH ops. The partition predicate. */
export function isSpeechOp(op: string): op is SpeechOp {
  return SPEECH_OP_SET.has(op);
}

/** True when `op` is an ACTION op — anything that is not a reserved speech op (= `!isSpeechOp`). */
export function isActionOp(op: string): boolean {
  return !isSpeechOp(op);
}

/**
 * One structured INTENTION the agent declares about ONE thing it did this turn.
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

/**
 * The COMPATIBILITY FOLD of an outcome-map key — what a human reviewing the domain vocabulary reads.
 *
 * `trim().toLowerCase()` alone is not the reader's notion: `'ＳＵＣＣＥＳＳ'` lowercases to FULLWIDTH
 * lowercase (never the ASCII core word) and `'PENDİNG_CONFIRMATION'` (Turkish dotted İ) lowercases to a
 * combining-dot form — both read as the core word on screen, so both would slip a plain-lowercase gate. NFKD is Unicode's own compatibility decomposition (fullwidth → ASCII, İ → `I` + combining dot);
 * stripping `\p{M}` drops the freed marks, and the invisible class is the same one the delivery floor owns.
 * Case folding comes LAST, after the marks are gone, so no locale-sensitive `i`/`İ` pair survives it.
 */
function foldOutcomeKey(k: string): string {
  return k
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(INVISIBLE_STRIP_RE, '')
    .trim()
    .toLowerCase();
}

/**
 * THE SHADOW LAW (m10) — throws on any {@link OutcomeMap} key that FOLDS to a core outcome word.
 *
 * {@link resolveOutcome} is case-sensitive: `'success'` is core and its map entry is ignored, but
 * `'Success'` is NOT core, so a map keyed by it would REDEFINE a core outcome by casing alone
 * (`resolveOutcome('Success', { Success: 'failure' })` → `'failure'`). A per-turn check would be the
 * wrong shape — the defect is in the authored vocabulary, so it fails at LOAD, before a turn ever runs. An
 * exact-core key is refused too: it is dead config that reads as if it redefined the word.
 *
 * EVERY DOOR, NOT ONE. A law about a VALUE has to be enforced where the value enters, so this runs in
 * EVERY guard factory that accepts an `OutcomeMap` and in the eval config loader as well — not only in
 * the spec constructor over `cfg.contract?.outcomes`. A map that does not ride on a contract still has to
 * be gated: `packages/eval`'s config path builds a contract-less spec and threads its `outcomes` block
 * straight into `mustAccountFor`, and the three cross-check factories are public exports a host can
 * bind directly. It is idempotent, load-time and O(keys).
 *
 * `where` names the door for the message (`AgentSpec "x"`, `claimIsGrounded`, …).
 */
export function assertNoCoreOutcomeShadow(outcomes: OutcomeMap | undefined, where: string): void {
  if (!outcomes) return;
  const shadows = Object.keys(outcomes).filter((k) => isCoreOutcome(foldOutcomeKey(k)));
  if (!shadows.length) return;
  throw new Error(
    `${where}: the outcome map may not key a CORE outcome word (found: ${shadows.join(', ')}). ` +
      'A core outcome always means itself — an entry keyed by one (in any casing, width or accent form) ' +
      'either does nothing or redefines the word, and both make the domain vocabulary lie. Map only ' +
      'DOMAIN words to core outcomes.',
  );
}

/** A non-empty string after trimming — the field law for `op` / `target` / `outcome`. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const CLAIM_KEYS: ReadonlySet<string> = new Set(['op', 'target', 'outcome', 'amount']);

/**
 * The INVISIBLE characters, as a CHARACTER CLASS rather than a list.
 *
 * A LIST IS THE WRONG SHAPE — it needs extending every time Unicode names another invisible, and every
 * invisible it has not heard of gets through: U+2062–U+2064 (invisible times/separator/plus), U+180E
 * (Mongolian vowel separator), and the Hangul fillers U+3164/U+115F/U+1160/U+FFA0 all render as NOTHING
 * yet would read as content and ship as the user's answer.
 *
 * `\p{Cf}` is the FORMAT category (every zero-width joiner / separator / mark) and
 * `\p{Default_Ignorable_Code_Point}` is Unicode's own "renders as nothing" property, which covers the
 * Hangul fillers and the variation selectors `Cf` does not. Together they are the closed class.
 * Ordinary whitespace is left to `.trim()`, which already handles every space separator, tab, newline
 * and NBSP.
 *
 * ONE class, two compiled forms — the non-global for `.test` (a `/g` regex advances `lastIndex`, so a
 * shared instance alternates verdict between calls) and the global for stripping.
 */
const INVISIBLE_CLASS = '[\\p{Cf}\\p{Default_Ignorable_Code_Point}]';
/** Barred from a `target` because the target is the ONE claim field the renderer prints verbatim into
 *  user-facing text: an id decorated with U+202E still matched the plain id while the user was shown a
 *  bidi-reordered string. Same class the delivery blank-floor strips. */
const INVISIBLE_RE = new RegExp(INVISIBLE_CLASS, 'u');
const INVISIBLE_STRIP_RE = new RegExp(INVISIBLE_CLASS, 'gu');

/**
 * True when `text` carries nothing a user would read: empty after stripping invisible/format characters
 * and trimming. This is the runtime's OWN floor for "did the agent actually say anything" — it does not
 * depend on the `respond` terminal schema's `minLength`. That constraint is real — the mastra backend
 * carries it into its zod input schema and rejects a violating call before the terminal executes — but a
 * zero-width message SATISFIES it, so it can never be the floor.
 */
export function isBlankDelivery(text: string): boolean {
  return text.replace(INVISIBLE_STRIP_RE, '').trim().length === 0;
}

/**
 * STRUCTURAL validation of a raw `did` value — SHAPE + the speech/action PARTITION, never grounding
 * against the ledger (that is the guards' job). Exhaustive typed checks, NOT `typeof`/`trim` guesses,
 * which a hostile shape walks straight through:
 *   · `did` MUST be a NON-EMPTY array — an empty `did` is an error: every respond declares ≥1
 *     intention, and there is no "honest empty" turn.
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
    if ('target' in rec) {
      if (!isNonEmptyString(rec.target)) local.push(`did[${i}].target must be a non-empty string when present`);
      else if (INVISIBLE_RE.test(rec.target)) local.push(`did[${i}].target must not contain invisible formatting characters`);
    }
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
 * intentions of the turn. Asking is not a bare boolean: a question is declared as an `ask`
 * speech-intention in `did` (see {@link hasAskIntent}), like every other intention.
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

/**
 * ── The ONE notion of a terminal payload the runtime will ACCEPT ──────────────────────────────────
 *
 * Returns the model-facing reason the payload is REFUSED, or `null` when the runtime will deliver it.
 *
 * The `respond` schema requires a `message` (`minLength:1`) and a `did` (`minItems:1`), and the mastra
 * backend carries both into zod — so a violating call is rejected BEFORE the terminal executes. That
 * rejection must stay VISIBLE to governance in two places, because in both an invisible rejection is a
 * consent defect:
 *  · the guard hook records the terminal at HOOK time, which runs OUTSIDE the tool's own input
 *    validation — so a call the runtime REFUSED still landed in `observed` with `ok:true`, and a
 *    refused `respond` whose `did` carried an `ask` read as a question the user answered;
 *  · {@link supersededTerminalCalls} computed "the delivered one" as the last terminal with a non-empty
 *    message, which for a step whose LAST terminal is refused pruned the entry the user actually got.
 *
 * Both now ask this one function, so the ledger's notion of "delivered" cannot drift from the
 * runtime's notion of "accepted". The message floor is {@link isBlankDelivery} — STRICTER than the
 * schema's `minLength`, deliberately: a zero-width message satisfies `minLength` and renders as
 * nothing.
 *
 * The reason is MODEL-facing (it rides the governance-veto envelope): it names the protocol's own
 * argument names, never the terminal tool, and never reaches the user.
 */
export function terminalPayloadRejection(args: Record<string, unknown>): string | null {
  const message = typeof args.message === 'string' ? args.message : '';
  if (isBlankDelivery(message)) {
    return 'Your reply carried no readable text for the user — put the COMPLETE user-facing message in `message` and send it again.';
  }
  if (!Array.isArray(args.did) || args.did.length === 0) {
    return 'Your reply declared nothing in `did` — declare AT LEAST ONE intention (every operation you attempted with its honest outcome, or a speech intention) and send it again.';
  }
  // WELL-FORMEDNESS, not merely arity. The schema's `minItems:1` cannot express the speech/action
  // PARTITION — `outcome` is just an optional property, so `{op:'inform', outcome:'success'}` is
  // schema-legal — and {@link respondPayload} keeps only the well-formed subset and DISCARDS the errors.
  // Without this check a `did` whose every entry is malformed would collapse to `[]` INSIDE the engine:
  // `claimIsGrounded` short-circuits on an empty declaration, the operation report renders '', and the
  // raw prose would ship alone with zero intentions and zero violations — the empty-`did` state this
  // module forbids, reached by the single most likely `did` mistake a weak model makes.
  // A declaration the system could not read is not a declaration, so the runtime REFUSES the payload and
  // tells the model what was wrong, rather than silently pruning it.
  const { errors } = validateClaims(args.did);
  if (errors.length) {
    return (
      `Your \`did\` could not be read as declared intentions (${errors.join('; ')}) — ` +
      'an operation intention carries an `outcome`, a speech intention (inform/greet/refuse/ask) carries ' +
      'none; fix every entry and send the reply again.'
    );
  }
  return null;
}

/**
 * THE ATTESTED EFFECT — the world's own statement that this call MUTATED it.
 *
 * `tookEffect` and `writeTools` come from different authorities: the flag is the WORLD's per-call record,
 * the list is the DOMAIN's hand-maintained vocabulary. Reading an effect only through their INTERSECTION
 * made a mutation the author forgot to list invisible to the cross-check while the guards read as fully
 * installed — the engine held the evidence and declined to use it. So an attested effect now counts on its
 * own, whatever the tool is called: `writeTools` says which calls a domain INTENDS as writes; the world
 * says which ones actually changed something, and only the second can be wrong in the unsafe direction.
 *
 * An INFERRED effect (`effectInferred`, the native-tools path) does NOT attest: the runtime guessed it from
 * `ok && !requiresConfirmation`, which every successful READ satisfies, so widening on it would demand a
 * `success` claim for every lookup. There the intersection with `writeTools` remains the rule.
 */
export function attestedEffect(c: { tookEffect?: boolean; effectInferred?: boolean }): boolean {
  return c.tookEffect === true && c.effectInferred !== true;
}

/** True when the turn's `did` carries an `ask` intention. Every consent/ask gate reads "the turn posed a
 *  question" through this, never through a flag.
 *  Takes a READONLY array so a frozen `HistoryTurn.did` is read without copying. */
export function hasAskIntent(did: readonly Intention[]): boolean {
  return did.some((i) => i.op === 'ask');
}

/**
 * True when this observed call is the ASK event: the single `respond` terminal whose `did` carries an
 * `ask` intention. Asking is a declared `did` intention like every other, extracted through
 * {@link respondPayload}, so confirmation/consent guards key on this rather than on a tool name or a
 * flag.
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
  renderClaim?: (c: RenderedClaim, core: CoreOutcome) => string;
  outcomes?: OutcomeMap;
  /** The engine's OWN sentences — the record closures. Absent ⇒ the engine's English defaults. */
  text?: EngineText;
}

/**
 * What the DOMAIN render seam is allowed to see: the fields of an intention that the cross-check guards
 * VERIFIED — the `target` the world named, the `outcome` word (already resolved through the domain map,
 * so it is declared vocabulary), and the `amount` (corroborated against the same ledger fact that
 * grounded the claim). The advisory `op` is NOT among them.
 *
 * `op` is free, agent-authored text. The engine default line never renders it, and `renderOperationReport`
 * documented that as "a leak is impossible by construction" — but the seam received the WHOLE claim, and
 * the seam's output IS delivered to the user, so the construction argument was false for exactly the one
 * path that matters. Typing `op` as `undefined` here makes the law hold by
 * construction for real: a domain that reads `c.op` does not compile, and at runtime there is nothing there.
 */
export type RenderedClaim = Omit<Intention, 'op'> & { op?: undefined };

/**
 * The ENGINE default one-liner for a verified claim, keyed on its CORE outcome.
 *
 * It renders the claim's `target` (the entity label/id the world itself named) and NOTHING ELSE — never
 * the advisory `op` (model-authored text that could carry a tool name or internal token), never a tool
 * name, never the word `respond`. When no `target` is present the line is a neutral generic sentence (the
 * "one action completed" shape the exhaustion closure calls for), so a leak is impossible by construction.
 */
function defaultClaimLine(claim: Intention, core: CoreOutcome): string {
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
 * The turn's OPERATION RECORD — the engine's own account of what this turn did, as the user receives it.
 * Deterministic: its only inputs are the VERIFIED `did` and the domain's wording seam, so the same turn
 * renders the same record whatever the prose beside it says.
 */
export interface OperationRecord {
  /** One rendered line per ACTION intention, in declaration order. */
  lines: string[];
  /** The record names at least one operation. Also the reply pipeline's CHECK-ELIGIBILITY answer: a turn
   *  on which no action was carried out is the only turn whose prose is checked for a lie. */
  hasOperations: boolean;
  /** The delivered text: the lines, then the closure the line count selects. NEVER empty. */
  text: string;
}

/**
 * Build the user-facing OPERATION RECORD from a VERIFIED `did` — the operational sentences the user reads
 * come from ledger-grounded structure, never from the agent's free prose, so a fabricated claim cannot
 * reach the user. One line per claim; a claim whose outcome does not resolve to a core meaning names no
 * ledger fact and is skipped (it never survives the cross-check guards, so this is defensive only). A
 * domain overrides the wording per-claim via {@link RenderOpts.renderClaim}.
 *
 * The record ALWAYS closes with a sentence, and the two sentences are not interchangeable — see
 * {@link EngineText.recordClosureNone}. A turn that declared only speech therefore renders the empty-case closure,
 * never nothing at all: a claim with no record beside it has nothing standing against it.
 */
export function operationRecord(did: Intention[], opts?: RenderOpts): OperationRecord {
  const lines: string[] = [];
  for (const claim of did) {
    // A speech intention carries no outcome (`undefined`) → resolves to null → renders no operation line
    // (the `message` is the speech surface). resolveOutcome takes a string, so coerce absent → ''.
    const core = resolveOutcome(claim.outcome ?? '', opts?.outcomes);
    if (core === null) continue;
    // The seam is handed a NARROWED claim — never the advisory, agent-authored `op` (see RenderedClaim).
    const line = opts?.renderClaim
      ? opts.renderClaim({ target: claim.target, outcome: claim.outcome, amount: claim.amount }, core)
      : defaultClaimLine(claim, core);
    if (line && line.trim()) lines.push(line.trim());
  }
  const hasOperations = lines.length > 0;
  const sentences = resolveEngineText(opts?.text);
  return {
    lines,
    hasOperations,
    text: [...lines, hasOperations ? sentences.recordClosureSome : sentences.recordClosureNone].join('\n'),
  };
}

/** The {@link OperationRecord}'s delivered TEXT — the shape every caller that only needs the sentences uses. */
export function renderOperationReport(did: Intention[], opts?: RenderOpts): string {
  return operationRecord(did, opts).text;
}

/**
 * Derive the TRUE claims from the world ledger — the engine's own honest account of what this turn did,
 * used when the redrive loop exhausts (the model never produced a groundable declaration, so the engine
 * builds one it CAN stand behind). For each of THIS turn's observed calls:
 *   · a WRITE that TOOK EFFECT → `success` (its OWN produced label as `target`, when it issued one)
 *   · a WRITE that did NOT take effect but carries a pending-confirmation result flag → `pending_confirmation`
 *   · a WRITE that ran but returned `ok:false` → `failure`
 *   · a WRITE that ran ok yet took NO effect (a simulate) → contributes NOTHING (it changed nothing)
 *   · a READ (any non-write, incl. the runtime terminal) → contributes NOTHING
 *
 * EFFECT WINS OVER FLAGS: `tookEffect` is tested FIRST, so a write that BOTH landed and carried
 * `requiresConfirmation` never renders as "awaiting your confirmation" — that would tell the user an
 * action is still pending their OK when the world had already made the change. `pending_confirmation` is
 * honest only for a write that did not take effect.
 *
 * LABELS ARE PER CALL: each claim reads `o.producedLabel` — the label THAT call's own result issued. The
 * turn-wide `producedThisTurn` stream includes READ labels, so consuming it positionally across the
 * effected writes would shift a read's label onto a write's target and the engine's own honest closure
 * would name the wrong entity. A write with no label of its own yields a claim with no `target`, which
 * {@link renderOperationReport} renders as a generic completed-action line — so this NEVER leaks a tool
 * name (it names world-issued labels or nothing).
 *
 * A DERIVED CLAIM IS ALWAYS AN ACTION CLAIM. `op` stopped being purely advisory when the speech/action
 * partition started keying on it: `inform`/`greet`/`refuse`/`ask` are SPEECH ops, and an `ask` sealed
 * into history is read as consent by {@link askedInDeliveredTurn} on the next turn. A world is free to
 * issue a label that collides with one of those four words, so passing the label straight through as `op`
 * let the engine's OWN exhaustion closure seal an ask intention the agent never made. The label is
 * world-issued evidence of WHICH ENTITY was touched, so it stays as `target`; a colliding `op` falls back
 * to the neutral `'operation'`, which is what a labelless write already uses.
 */
export function deriveClaimsFromLedger(
  observed: ObservedCall[],
  turnIndex: number,
  writeTools: readonly string[],
): Intention[] {
  const writes = new Set(writeTools);
  const claims: Intention[] = [];
  for (const o of observed) {
    if (o.turnIndex !== turnIndex) continue;
    // A declared write tool, OR any call whose effect the WORLD attested — the engine's own honest account
    // has to name a mutation the domain forgot to list, exactly as the cross-check now demands one
    // ({@link attestedEffect}). Reads / terminals contribute nothing.
    if (!writes.has(o.name) && !attestedEffect(o)) continue;
    if (o.tookEffect === true) {
      const label = o.producedLabel;
      // A label that collides with a reserved SPEECH op is kept as the `target` (it is what the world
      // named) but never becomes the `op` — see the partition note above.
      claims.push(
        label
          ? { op: isSpeechOp(label) ? 'operation' : label, target: label, outcome: 'success' }
          : { op: 'operation', outcome: 'success' },
      );
      continue;
    }
    if (o.resultFlags?.requiresConfirmation === true) {
      claims.push({ op: 'operation', outcome: 'pending_confirmation' });
      continue;
    }
    if (o.ok === false) {
      claims.push({ op: 'operation', outcome: 'failure' });
      continue;
    }
    // a write that ran ok but took no effect (a simulate) changed nothing → no claim.
  }
  return claims;
}
