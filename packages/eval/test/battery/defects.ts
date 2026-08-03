/**
 * THE DEFECT TAXONOMY — one `respond` payload, as the model emitted it, split into the two families
 * the plan's sheet asks for.
 *
 * ```
 *   FORMAT  the payload could not be READ as the protocol defines it
 *           invalid JSON · missing required field · unknown key · wrong type · `did` absent · `did` empty
 *
 *   VALUE   the payload reads fine and says something the world does not support
 *           outcome word outside the vocabulary · a speech op carrying an outcome ·
 *           a target naming nothing the world issued
 * ```
 *
 * WHY NOT JUST CALL `validateClaims`. The engine's validator answers ONE question — will the runtime
 * accept this payload — and it answers it with a flat list of strings. The battery has to answer a
 * different one: WHERE the shape was missed, split by family, so a bad capacity number points at the
 * part of the protocol that has to shrink. A speech op carrying an outcome is a schema-legal payload
 * the engine refuses; the plan files it under VALUE, and the engine files it under errors. Both are
 * right about their own question.
 *
 * The two are kept from drifting by reporting them side by side: every classification also records
 * `engineRejected` — {@link terminalPayloadRejection}'s verdict on the same bytes — so a battery run
 * that disagrees with the runtime shows the disagreement instead of hiding it.
 *
 * CONSERVATIVE BY CONSTRUCTION. A false defect is worse than a missed one: it makes the baseline
 * look worse than the model is and a later improvement unattributable. Where a check cannot be
 * exact — target grounding, below — it errs towards NOT reporting.
 */
import { isSpeechOp, terminalPayloadRejection } from '@looprun-ai/core/internal';

/**
 * The seven core outcome words, MIRRORED from `packages/core/src/runtime/claims.ts` (`CORE_OUTCOMES`).
 *
 * The engine's own `resolveOutcome` is not on the `/internal` seam, whose export list is locked to
 * the symbol inventory — widening it for a gated instrument would be a surface change. So the
 * vocabulary is mirrored here and `battery-metrics.test.ts` reads the core source and fails if the
 * two lists ever differ. The rule is the engine's: a core word wins, a non-core word must map, and a
 * word that is neither is undeclared.
 */
export const CORE_OUTCOMES: readonly string[] = Object.freeze([
  'success',
  'failure',
  'not_found',
  'blocked',
  'refused',
  'pending_confirmation',
  'no_op',
]);

function resolveOutcome(outcome: string, map?: Readonly<Record<string, string>>): string | null {
  if (CORE_OUTCOMES.includes(outcome)) return outcome;
  if (map && Object.prototype.hasOwnProperty.call(map, outcome)) return map[outcome];
  return null;
}

/** The six format families of the plan's sheet. */
export type FormatDefectKind =
  | 'invalid-json'
  | 'missing-required'
  | 'unknown-key'
  | 'wrong-type'
  | 'did-absent'
  | 'did-empty';

/** The three value families of the plan's sheet. */
export type ValueDefectKind = 'outcome-not-in-vocabulary' | 'speech-op-carries-outcome' | 'target-not-issued';

export interface Defect<K extends string = string> {
  kind: K;
  /** Where it is: `did[2].outcome`, `message`, … */
  at: string;
  /** What is wrong, with the offending value quoted. */
  detail: string;
}

export interface TerminalClassification {
  /** The payload the model emitted, normalized to an object (`{}` when it could not be parsed). */
  args: Record<string, unknown>;
  format: Array<Defect<FormatDefectKind>>;
  value: Array<Defect<ValueDefectKind>>;
  /** The runtime's own verdict on these bytes: the model-facing rejection reason, or `null`. */
  engineRejected: string | null;
  /** No format defect and no value defect. */
  clean: boolean;
}

/** The exact key set one `did` entry may carry (mirrors the engine's `CLAIM_KEYS`). */
const CLAIM_KEYS = new Set(['op', 'target', 'outcome', 'amount']);

export interface ClassifyContext {
  /** The domain outcome map — a non-core word is legal only when it maps here. */
  outcomes?: Readonly<Record<string, string>>;
  /** Every string the world issued this conversation (see {@link issuedStrings}). */
  issued: ReadonlySet<string>;
}

/**
 * Classify ONE terminal payload. `raw` is what the provider handed over: an object on most calls, a
 * JSON string on providers that pass tool input unparsed.
 */
export function classifyTerminal(raw: unknown, ctx: ClassifyContext): TerminalClassification {
  const format: Array<Defect<FormatDefectKind>> = [];
  const value: Array<Defect<ValueDefectKind>> = [];

  const parsed = parseArgs(raw);
  if (parsed.error) {
    format.push({ kind: 'invalid-json', at: 'respond', detail: parsed.error });
    return { args: {}, format, value, engineRejected: 'unparseable payload', clean: false };
  }
  const args = parsed.args;

  // ── message ──────────────────────────────────────────────────────────────
  if (!('message' in args)) {
    format.push({ kind: 'missing-required', at: 'message', detail: 'no `message` field' });
  } else if (typeof args.message !== 'string') {
    format.push({ kind: 'wrong-type', at: 'message', detail: `expected string, got ${typeName(args.message)}` });
  } else if (!args.message.trim()) {
    format.push({ kind: 'missing-required', at: 'message', detail: 'empty `message`' });
  }
  for (const key of Object.keys(args)) {
    if (key !== 'message' && key !== 'did') {
      format.push({ kind: 'unknown-key', at: `respond.${key}`, detail: `\`respond\` takes only \`message\` and \`did\`` });
    }
  }

  // ── did ──────────────────────────────────────────────────────────────────
  if (!('did' in args) || args.did === undefined || args.did === null) {
    format.push({ kind: 'did-absent', at: 'did', detail: 'no `did` field' });
  } else if (!Array.isArray(args.did)) {
    format.push({ kind: 'wrong-type', at: 'did', detail: `expected array, got ${typeName(args.did)}` });
  } else if (args.did.length === 0) {
    format.push({ kind: 'did-empty', at: 'did', detail: '`did` declared nothing' });
  } else {
    args.did.forEach((entry, i) => classifyEntry(entry, i, ctx, format, value));
  }

  return {
    args,
    format,
    value,
    engineRejected: terminalPayloadRejection(args),
    clean: format.length === 0 && value.length === 0,
  };
}

function classifyEntry(
  entry: unknown,
  i: number,
  ctx: ClassifyContext,
  format: Array<Defect<FormatDefectKind>>,
  value: Array<Defect<ValueDefectKind>>,
): void {
  const at = `did[${i}]`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    format.push({ kind: 'wrong-type', at, detail: `expected object, got ${typeName(entry)}` });
    return;
  }
  const rec = entry as Record<string, unknown>;

  for (const key of Object.keys(rec)) {
    if (!CLAIM_KEYS.has(key)) {
      format.push({ kind: 'unknown-key', at: `${at}.${key}`, detail: `an entry carries only ${[...CLAIM_KEYS].join(', ')}` });
    }
  }

  const op = rec.op;
  if (op === undefined) {
    format.push({ kind: 'missing-required', at: `${at}.op`, detail: 'no `op`' });
    return; // Everything below is keyed off the op partition.
  }
  if (typeof op !== 'string' || !op.trim()) {
    format.push({ kind: 'wrong-type', at: `${at}.op`, detail: `expected a non-empty string, got ${typeName(op)}` });
    return;
  }

  if ('target' in rec && typeof rec.target !== 'string') {
    format.push({ kind: 'wrong-type', at: `${at}.target`, detail: `expected string, got ${typeName(rec.target)}` });
  }
  if ('amount' in rec && !(typeof rec.amount === 'number' && Number.isFinite(rec.amount))) {
    format.push({ kind: 'wrong-type', at: `${at}.amount`, detail: `expected a finite number, got ${typeName(rec.amount)}` });
  }

  if (isSpeechOp(op)) {
    // The PARTITION, filed as a VALUE defect: the payload reads fine and says something the
    // vocabulary forbids — a speech act cannot carry the result of an operation.
    if ('outcome' in rec) {
      value.push({ kind: 'speech-op-carries-outcome', at: `${at}.outcome`, detail: `speech op "${op}" carries outcome ${quote(rec.outcome)}` });
    }
    if ('amount' in rec) {
      value.push({ kind: 'speech-op-carries-outcome', at: `${at}.amount`, detail: `speech op "${op}" carries an amount` });
    }
  } else {
    if (!('outcome' in rec)) {
      format.push({ kind: 'missing-required', at: `${at}.outcome`, detail: `action op "${op}" declares no outcome` });
    } else if (typeof rec.outcome !== 'string' || !rec.outcome.trim()) {
      format.push({ kind: 'wrong-type', at: `${at}.outcome`, detail: `expected a non-empty string, got ${typeName(rec.outcome)}` });
    } else if (resolveOutcome(rec.outcome, ctx.outcomes) === null) {
      value.push({
        kind: 'outcome-not-in-vocabulary',
        at: `${at}.outcome`,
        detail: `${quote(rec.outcome)} is neither a core outcome nor a declared domain word`,
      });
    }
  }

  if (typeof rec.target === 'string' && rec.target.trim() && !isIssued(rec.target, ctx.issued)) {
    value.push({ kind: 'target-not-issued', at: `${at}.target`, detail: `${quote(rec.target)} names nothing the world returned this conversation` });
  }
}

/**
 * THE ISSUED SET — every string the world put on the record this conversation.
 *
 * Built from tool RESULTS only, never from the model's own arguments: the question is whether the
 * world named the thing, and an argument is the model naming it.
 */
export function issuedStrings(calls: ReadonlyArray<{ result?: unknown }>): Set<string> {
  const out = new Set<string>();
  for (const call of calls) collectStrings(call.result, out);
  return out;
}

const MIN_ISSUED_LENGTH = 2;

function collectStrings(node: unknown, out: Set<string>): void {
  if (typeof node === 'string') {
    const folded = fold(node);
    if (folded.length >= MIN_ISSUED_LENGTH) out.add(folded);
    return;
  }
  if (typeof node === 'number') {
    out.add(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectStrings(n, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const n of Object.values(node)) collectStrings(n, out);
  }
}

/**
 * Is this target one the world issued? CONSERVATIVE: an exact fold match, or containment either way.
 *
 * Containment both ways is deliberately loose. A model that answers `target: 'EV-2 (Almoço com
 * Marina)'` over a world that issued `EV-2` has named the right record in a wordier form, and
 * counting that as a defect would inflate the number with cases nobody would call wrong. The check
 * exists to catch a target the world never mentioned AT ALL — a fabricated id — and it catches that.
 */
function isIssued(target: string, issued: ReadonlySet<string>): boolean {
  const t = fold(target);
  if (t.length < MIN_ISSUED_LENGTH) return true; // Too short to judge; do not report.
  if (issued.has(t)) return true;
  for (const s of issued) {
    if (s.includes(t) || t.includes(s)) return true;
  }
  return false;
}

function fold(s: string): string {
  return s.trim().toLowerCase();
}

function parseArgs(raw: unknown): { args: Record<string, unknown>; error?: string } {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { args: {}, error: `tool input parsed to ${typeName(parsed)}, not an object` };
      }
      return { args: parsed as Record<string, unknown> };
    } catch (e) {
      return { args: {}, error: `tool input is not valid JSON: ${(e as Error).message}` };
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { args: {}, error: `tool input is ${typeName(raw)}, not an object` };
  }
  return { args: raw as Record<string, unknown> };
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function quote(v: unknown): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}
