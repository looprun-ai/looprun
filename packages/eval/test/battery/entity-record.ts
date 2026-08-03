/**
 * EXPERIMENT 1 — WOULD A PER-ENTITY RECORD CONTRADICT THE PROSE LIE?
 *
 * THE RULE UNDER TEST, evaluated OFFLINE against the 70 recorded scenarios and nothing else — no engine
 * change, no model call, no re-run:
 *
 * > Every entity LABEL the world issued during the turn that also appears in the delivered message gets
 * > a line in the record. An entity the turn touched gets its real outcome; an entity merely named gets
 * > a line stating that nothing was done to it.
 *
 * WHAT THIS FILE IS. A computation over `measurements.json` — the recorded `ledger`, `emittedMessage`
 * and `scenario` of each run. It says what the rule WOULD have produced, so the rule can be judged on
 * the runs that already happened rather than on an intuition about them. It proposes nothing and
 * installs nothing.
 *
 * TWO MIRRORS, STATED RATHER THAN HIDDEN. The guard core's identity extraction and its boundary
 * predicate live in `packages/core/src/guards/honesty.ts` as MODULE-PRIVATE functions (`identityValues`,
 * `canonValue`, `targetMatchesValue` — only `targetMatchesValue` is exported from the module, and no
 * barrel re-exports it), so this file MIRRORS them rather than importing them:
 *
 * ```
 *   isIdentityKey    id · label · <entity>Id · <entity>_id            — key-scoped identity
 *   canonValue       trim · script-safe case fold · edge punctuation  — the canonical comparison form
 *   matchesValue     WHOLE-VALUE equality of the canonical forms      — never a substring
 * ```
 *
 * The mirror is proved against the same boundary cases the guard's own laws state (`BK-1` is not
 * `BK-10`, `"(BK-1)"` is `BK-1`, a lookalike fails closed) in `entity-record-metrics.test.ts`.
 *
 * ONE MEASUREMENT LIMIT, STATED UP FRONT. The recording keeps ONE ledger per RUN, not one per turn, so
 * "the entities the world issued during the TURN" is read here as "during the RUN". It differs only for
 * the `write-other-record` shape, whose two setup turns cancel EV-2 before the final turn; there the
 * entity set is GENEROUS to the rule, and every verdict that depends on it is flagged.
 */

// ── The mirrors ────────────────────────────────────────────────────────────────────────────────────

/** Mirror of `honesty.ts`'s `isIdentityKey`: the world names entities under these keys and nowhere else. */
function isIdentityKey(key: string): boolean {
  return key === 'id' || key === 'label' || key.endsWith('Id') || key.endsWith('_id');
}

const LEADING_PUNCT = /^[^\p{L}\p{N}\p{Cf}]+/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}\p{Cf}]+$/u;

function isAscii(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) < 128;
}

/** Mirror of `honesty.ts`'s `foldCase`: a fold that never crosses INTO ASCII, so a unicode lookalike
 *  (KELVIN SIGN → `k`) fails closed instead of matching the real ascii value. */
function foldCase(v: string): string {
  let out = '';
  for (const ch of v) {
    const lower = ch.toLowerCase();
    out += lower.length === 1 && isAscii(lower) && !isAscii(ch) ? ch : lower;
  }
  return out;
}

/** Mirror of `honesty.ts`'s `canonValue`: trimmed, case-folded, EDGE punctuation stripped. */
export function canonValue(v: string): string {
  return foldCase(v.trim()).replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/** Mirror of `honesty.ts`'s `targetMatchesValue`: WHOLE-VALUE equality of the canonical forms. */
export function matchesValue(target: string, value: string): boolean {
  const t = canonValue(target);
  if (!t) return false;
  return t === canonValue(value);
}

/** Mirror of `honesty.ts`'s `identityValues`: every scalar under an identity key, at any depth. */
export function identityValues(v: unknown, key?: string, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) identityValues(x, key, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) identityValues(val, k, out);
    return out;
  }
  if (key !== undefined && isIdentityKey(key)) out.push(String(v));
  return out;
}

/**
 * The identity groups of one structure: the identity values that sit TOGETHER on the same object are one
 * entity under two names. `{id:'EV-1', label:'Dentista'}` is ONE entity the world named twice, and the
 * flat value list cannot say that — which matters here, because the rule's whole question is whether the
 * message names THE ENTITY, and a message may name it by either.
 */
function identityGroups(v: unknown, out: string[][] = []): string[][] {
  if (v === null || v === undefined || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const x of v) identityGroups(x, out);
    return out;
  }
  const here: string[] = [];
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== null && typeof val === 'object') identityGroups(val, out);
    else if (val !== null && val !== undefined && isIdentityKey(k)) here.push(String(val));
  }
  if (here.length) out.push(here);
  return out;
}

// ── Step 1 — what the world ISSUED ─────────────────────────────────────────────────────────────────

/** One ledger row as the recording keeps it. Structural copy of `prose-lie.ts`'s `LedgerCall`, so this
 *  module reads a recorded JSON file without depending on the runner that produced it. */
export interface RecordedCall {
  name: string;
  args: unknown;
  result: unknown;
  tookEffect: boolean;
}

/** One entity the world named this run, with every name it gave it (its id, its label, or both). */
export interface IssuedEntity {
  /** Every name the world issued for this entity, in the order it issued them. */
  names: string[];
  /** The name a record line would use: the `label` the world issued when there is one, else the id. */
  display: string;
}

/**
 * Every entity the world ISSUED — walked out of the RESULTS only, never the args. Args are the agent's
 * own text (the provenance law), so an entity that exists only because the model typed it into a call is
 * not an entity the world named.
 *
 * Groups that share a name are MERGED across the whole ledger: `cancelEvent` answering
 * `{cancelledEventId:'EV-2'}` is the same entity `listEvents` answered as `{id:'EV-2', label:'Almoço com
 * Marina'}`, so the cancel inherits the label the read issued and the record can name it in words.
 */
export function issuedEntities(ledger: readonly RecordedCall[]): IssuedEntity[] {
  const groups: string[][] = [];
  for (const call of ledger) {
    for (const group of identityGroups(call.result)) {
      const hit = groups.find((g) => g.some((v) => group.some((w) => matchesValue(v, w))));
      if (hit) {
        for (const v of group) if (!hit.some((w) => matchesValue(v, w))) hit.push(v);
      } else groups.push([...group]);
    }
  }
  return groups.map((names) => ({ names, display: displayName(ledger, names) }));
}

/** The label the world issued for this entity, when it issued one — the value that appeared under a
 *  `label` key. Otherwise the first name, which is the id. */
function displayName(ledger: readonly RecordedCall[], names: readonly string[]): string {
  for (const call of ledger) {
    for (const labelled of labelValues(call.result)) {
      if (names.some((n) => matchesValue(n, labelled))) return labelled;
    }
  }
  return names[0] ?? '';
}

/** Every scalar under a `label` key, at any depth. */
function labelValues(v: unknown, key?: string, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) labelValues(x, key, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) labelValues(val, k, out);
    return out;
  }
  if (key === 'label') out.push(String(v));
  return out;
}

// ── Step 2 — which of them the MESSAGE names ───────────────────────────────────────────────────────

/** The message split into whitespace tokens — the units a whole-value comparison is made against. */
function tokensOf(text: string): string[] {
  return text.split(/\s+/u).filter(Boolean);
}

/**
 * Does `text` NAME this value — the value is the whole of some token, or the whole of some run of
 * consecutive tokens as long as the value's own word count? Multi-word labels ("Almoço com Marina") need
 * the run; single-word ones ("Dentista", "EV-1") are the one-token case of it. Edge punctuation is
 * stripped by {@link canonValue}, so `"Dentista",` and `(EV-1)` both name their value, while `Dentistas`
 * and `EV-10` do not.
 */
export function textNames(text: string, value: string): boolean {
  const width = tokensOf(value).length;
  if (!width) return false;
  const tokens = tokensOf(text);
  for (let i = 0; i + width <= tokens.length; i += 1) {
    if (matchesValue(value, tokens.slice(i, i + width).join(' '))) return true;
  }
  return false;
}

// ── Step 3 — the record the rule would produce ─────────────────────────────────────────────────────

/**
 * The outcome word the rule attaches to an entity. The first five are the engine's own core outcomes,
 * worded exactly as `defaultClaimLine` words them, so a computed line is comparable to a rendered one.
 * `untouched` is the rule's OWN addition — the line the rule invents for an entity the turn only named.
 */
export type EntityOutcome = 'done' | 'awaiting your confirmation' | 'could not be completed' | 'untouched';

export interface EntityLine {
  /** The name the line carries — the world's own label when it issued one, else the id. */
  entity: string;
  /** Every name the world issued for that entity. */
  names: string[];
  /** The name the MESSAGE used, which is why this entity got a line at all. */
  namedAs: string;
  outcome: EntityOutcome;
  /** The line as the record would carry it. */
  line: string;
}

const LINE_TEXT: Record<EntityOutcome, string> = {
  done: 'done',
  'awaiting your confirmation': 'awaiting your confirmation',
  'could not be completed': 'could not be completed',
  untouched: 'nothing was done to it',
};

/** Does this call's RESULT name any of the entity's names? */
function resultNames(call: RecordedCall, names: readonly string[]): boolean {
  const issued = identityValues(call.result);
  return names.some((n) => issued.some((v) => matchesValue(n, v)));
}

/**
 * The entity's REAL outcome, read off the ledger in the order the engine's own grounding table reads it:
 * an attested write outranks a pending confirmation, which outranks a failed call. An entity no call
 * touched in any of those ways was merely READ or merely NAMED, and gets the rule's `untouched` line.
 */
export function outcomeOf(ledger: readonly RecordedCall[], names: readonly string[]): EntityOutcome {
  const naming = ledger.filter((c) => resultNames(c, names));
  if (naming.some((c) => c.tookEffect)) return 'done';
  if (naming.some((c) => (c.result as { requiresConfirmation?: unknown } | null)?.requiresConfirmation === true)) {
    return 'awaiting your confirmation';
  }
  if (naming.some((c) => (c.result as { ok?: unknown } | null)?.ok === false)) return 'could not be completed';
  return 'untouched';
}

/** The record the rule would produce for one run: a line per issued entity the message names, by ANY of
 *  the names the world gave it, in the order the world issued them. */
export function computeEntityRecord(ledger: readonly RecordedCall[], message: string): EntityLine[] {
  const out: EntityLine[] = [];
  for (const entity of issuedEntities(ledger)) {
    const namedAs = entity.names.find((n) => textNames(message, n));
    if (namedAs === undefined) continue;
    const outcome = outcomeOf(ledger, entity.names);
    out.push({
      entity: entity.display,
      names: entity.names,
      namedAs,
      outcome,
      line: `${entity.display}: ${LINE_TEXT[outcome]}`,
    });
  }
  return out;
}

// ── Step 4 — does the record contradict the lie? ───────────────────────────────────────────────────

/** Why the rule did or did not produce a line for the entity the message lies about. */
export type ClosureReason =
  | 'closed'
  | 'world-issued-nothing'
  | 'message-does-not-name-it'
  | 'record-agrees-with-the-claim';

export interface Closure {
  /** The record carries a line for the claim target that says something OTHER than the claimed act. */
  closed: boolean;
  reason: ClosureReason;
  /** The line the rule produced for the claim target, when it produced one. */
  line: string | null;
  /** The spellings of the claim target the world itself issued this run. */
  issuedSpellings: string[];
}

/**
 * Is the LIE contradicted? The scenario's `claimTarget` is the entity the message lies about, and the
 * message asserts it was disposed of. The rule closes the lie when the record carries a line for that
 * entity whose outcome is anything other than `done`.
 *
 * MATCHING IS ON THE WORLD'S SPELLINGS, not on the scenario's. The rule keys on what the world ISSUED,
 * and this world issues Portuguese labels whatever language the conversation runs in — so an English
 * delivery that says "the Dentist" names nothing the world issued, and the difference is the finding
 * rather than a detail of the harness.
 */
export function closesLie(
  ledger: readonly RecordedCall[],
  message: string,
  claim: { claimTarget: string; claimTargetId: string },
): Closure {
  // The claim target is ONE entity; the world may have named it by id, by label, or by both. Its group
  // is the one carrying either spelling, and the spellings are that group's names.
  const group = issuedEntities(ledger).find((e) =>
    e.names.some((n) => matchesValue(claim.claimTarget, n) || matchesValue(claim.claimTargetId, n)),
  );
  const spellings = group?.names ?? [];
  if (!spellings.length) {
    return { closed: false, reason: 'world-issued-nothing', line: null, issuedSpellings: [] };
  }
  const record = computeEntityRecord(ledger, message);
  const mine = record.filter((l) => spellings.some((s) => l.names.some((n) => matchesValue(s, n))));
  if (!mine.length) {
    return { closed: false, reason: 'message-does-not-name-it', line: null, issuedSpellings: spellings };
  }
  const contradicting = mine.find((l) => l.outcome !== 'done');
  if (!contradicting) {
    return { closed: false, reason: 'record-agrees-with-the-claim', line: mine[0]!.line, issuedSpellings: spellings };
  }
  return { closed: true, reason: 'closed', line: contradicting.line, issuedSpellings: spellings };
}

// ── The survey over the whole recorded set ─────────────────────────────────────────────────────────

/** The shape this module reads out of `measurements.json` — the fields of a recorded prose-lie run it
 *  needs, and no more. */
export interface RecordedRun {
  scenario: { id: string; shape: string; turnShape: string; language: string; pressure: string; claimTarget: string; claimTargetId: string };
  emittedMessage: string;
  delivered: string;
  ledger: RecordedCall[];
  recordLine: string;
  recordLineRendered: boolean;
  mechanicalUnsafe: boolean;
}

export interface SurveyRow {
  id: string;
  shape: string;
  turnShape: string;
  language: string;
  pressure: string;
  /** The record the rule computes for this run. */
  record: EntityLine[];
  /** The lines the rule ADDS beyond the operation report the engine already rendered. */
  addedLines: string[];
  closure: Closure;
  /** The contradicting line is one the delivery does NOT already carry — the rule adds it. */
  claimLineIsNew: boolean;
  /** The engine's own rendered record line, for the comparison. */
  renderedLine: string;
  recordLineRendered: boolean;
  mechanicalUnsafe: boolean;
}

/** The rule's verdict for one recorded run, with the lines it would add on top of what shipped. */
export function surveyRun(run: RecordedRun): SurveyRow {
  const record = computeEntityRecord(run.ledger, run.emittedMessage);
  const already = run.recordLineRendered
    ? run.recordLine.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const closure = closesLie(run.ledger, run.emittedMessage, run.scenario);
  return {
    id: run.scenario.id,
    shape: run.scenario.shape,
    turnShape: run.scenario.turnShape,
    language: run.scenario.language,
    pressure: run.scenario.pressure,
    record,
    // A line is ADDED when the delivery carries no line for that entity yet — the engine's rendered
    // lines are `<target>: <outcome>`, so the entity is the part before the colon.
    addedLines: record.filter((l) => !already.some((a) => a.split(':')[0]?.trim() === l.entity)).map((l) => l.line),
    closure,
    claimLineIsNew:
      closure.closed && !already.some((a) => closure.issuedSpellings.some((s) => matchesValue(s, a.split(':')[0]?.trim() ?? ''))),
    renderedLine: run.recordLine,
    recordLineRendered: run.recordLineRendered,
    mechanicalUnsafe: run.mechanicalUnsafe,
  };
}

export interface SurveyTotals {
  runs: number;
  /** Runs where the rule produces a line for the claim target that contradicts the assertion. */
  closed: number;
  /** Why the rest do not close. */
  byReason: Record<string, number>;
  /** Runs where the rule adds at least one line to the delivery. */
  runsWithAddedLines: number;
  /** How many lines the rule adds in total. */
  addedLines: number;
}

export function surveyTotals(rows: readonly SurveyRow[]): SurveyTotals {
  const byReason: Record<string, number> = {};
  for (const r of rows) byReason[r.closure.reason] = (byReason[r.closure.reason] ?? 0) + 1;
  return {
    runs: rows.length,
    closed: rows.filter((r) => r.closure.closed).length,
    byReason,
    runsWithAddedLines: rows.filter((r) => r.addedLines.length > 0).length,
    addedLines: rows.reduce((n, r) => n + r.addedLines.length, 0),
  };
}
