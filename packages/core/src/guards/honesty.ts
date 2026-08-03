/**
 * THE CROSS-CHECK GUARDS — the deterministic honesty core.
 *
 * The honesty family used to READ the reply prose, and the red-team broke that structurally: a literal
 * `replyMentions('BK-1')` passes on a reply that says "no record of BK-1 was found" — a text check cannot read polarity, and no
 * better pattern fixes it (patterns are the banned fragility). So the reply prose stops being the thing
 * guards read. The agent DECLARES what it did as STRUCTURE (`ctx.did: TurnClaim[]`), and these three
 * guards GROUND that declaration against the WORLD LEDGER — `ctx.observed` (the model's verified calls,
 * with `tookEffect`/`ok`/`resultFlags`), `ctx.world.toolCalls` (the results those calls returned), and
 * `ctx.attemptedThisTurn` (the calls a guard VETOED before they reached the world). None of those the
 * agent controls, so a fabricated claim cannot ground.
 *
 * NO-REGEX LAW: `matches` is a comparison of a claim's `target` against the CANONICALIZED values the
 * WORLD issued for a call — ledger DATA, never an authored pattern. `op` names are advisory labels; the
 * check keys on `target` + `outcome` vs the ledger, never on op-name semantics.
 *
 * TWO LAWS THE RED-TEAM WROTE (MI-T3):
 *  · PROVENANCE (M2) — a claim grounds ONLY against values the WORLD issued for that call (its result).
 *    A call's ARGS are the agent's own text, so scanning them made grounding circular: one permitted
 *    write plus the fabricated id in a free-text arg used to ground `success` on an untouched entity.
 *  · BOUNDARY (M1) — the comparison is whole-VALUE or whole-TOKEN equality, never a substring: `BK-1`
 *    is not `BK-10`, `BK-12345`, `BK-1-EXTRA` or `xBK-1y`; they are DIFFERENT entities.
 * And the PARTITION (MI-D5): both cross-checks iterate ACTION intentions only — a speech intention
 * (`inform`/`greet`/`refuse`/`ask`) classifies the message and names no ledger fact, so it is never
 * grounded and never covers a write (an action can therefore never hide behind an `inform`).
 */
import type { Guard, GuardCtx, ObservedCall } from '../rules.js';
import { isActionOp, resolveOutcome, type CoreOutcome, type OutcomeMap, type TurnClaim } from '../runtime/claims.js';
import { canonArgs } from './flow.js';
import { domainCallsThisTurn } from './shared.js';

/** The record-field names that describe a call's STATUS rather than the data it returned — ignored when
 *  deciding whether a read came back empty, but ONLY when the value under them is a SCALAR (see
 *  {@link isEmptyReadResult}): a `status:'not_found'` string is not content, a record under `message` is. */
const STATUS_LIKE_KEYS: ReadonlySet<string> = new Set([
  'success', 'ok', 'status', 'state', 'code', 'error', 'message', 'reason', 'found', 'exists',
]);

/**
 * Is this read result EMPTY — "the lookup came back with nothing"?
 *
 * Empty ⇔ no non-empty array anywhere AND no truthy record field besides booleans and SCALAR status-like
 * fields. `null`/`undefined`/`[]`/`{}` are empty; the `{success:true, data:[]}` style is empty (a boolean
 * flag + an empty list is not content); a non-empty array field, a nested entity, or any other truthy
 * scalar field IS content. A bare truthy scalar (a plain id) is content; a falsy scalar is empty.
 *
 * KEY-BLINDNESS FOR CONTAINERS (M4, red-team): the status-key skip used to run BEFORE the nested-object
 * check, so a found entity returned under one of those names — `{message:{booking:'BK-1'}}`, the ordinary
 * "envelope" read shape — read as EMPTY and a `not_found` claim about a record the world DID return
 * grounded. The skip is a statement about a status WORD, so it now applies only to a scalar/boolean
 * value; a record or a non-empty list is content whatever its key is called.
 */
export function isEmptyReadResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === 'object') {
    for (const [key, val] of Object.entries(result as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        if (val.length > 0) return false; // a non-empty list is content
        continue;
      }
      // CONTAINERS FIRST, key-blind: a nested record is content under ANY key, status-like or not.
      if (val !== null && typeof val === 'object') return false;
      if (typeof val === 'boolean') continue;       // a flag (success:true) is not content
      if (STATUS_LIKE_KEYS.has(key)) continue;       // a SCALAR status/error word is not content
      if (val === null || val === undefined) continue;
      if (val) return false;                         // a truthy scalar field is content
    }
    return true;
  }
  return !result; // a scalar read: truthy is content, falsy is empty
}

/**
 * Is this record key an ENTITY-IDENTITY key — the structural `id`/`label` the engine already speaks,
 * plus the `<entity>Id` / `<entity>_id` convention? Domain-neutral by construction: no business word
 * appears here, only the shape of an identifier field. A NUMBER is admitted into the identity set ONLY
 * under such a key (`{ id: 5 }`, `{ orderId: 5 }`), so a numeric-id domain stays groundable while
 * `{ count: 5 }` / `{ code: 200 }` / `{ refunded: 500 }` never name an entity.
 */
function isIdentityKey(key: string): boolean {
  return key === 'id' || key === 'label' || key.endsWith('Id') || key.endsWith('_id');
}

/**
 * The IDENTITY values in a structure — what the world NAMED, never what it merely counted.
 *
 * A STRING leaf is a name: labels, ids and the world's own sentences are how it identifies things. A
 * NUMBER or BOOLEAN leaf is a magnitude or a flag, admitted only under an {@link isIdentityKey} key.
 * The distinction is load-bearing, not cosmetic: with every scalar in the set, a result like
 * `{ id: 'ORD-1', refunded: 500 }` let a claim on `target:'500'` BOTH ground and COVER the ORD-1 write —
 * the user reads "500: done" and is never told which order was refunded (review finding, MI-T3).
 */
function identityValues(v: unknown, key?: string, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) identityValues(x, key, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) identityValues(val, k, out);
    return out;
  }
  if (typeof v === 'string') out.push(v);
  else if (key !== undefined && isIdentityKey(key)) out.push(String(v));
  return out;
}

/** The RESULT the world ledger recorded for this observed call (name + canonical args), or undefined. */
function resultOf(ctx: GuardCtx, c: ObservedCall): unknown {
  const calls = Array.isArray(ctx.world?.toolCalls) ? ctx.world.toolCalls : [];
  const key = canonArgs(c.args);
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const t = calls[i];
    if (t?.name === c.name && canonArgs((t.args ?? {}) as Record<string, unknown>) === key) return t.result;
  }
  return undefined;
}

/** The CANONICAL comparison form of one value: trimmed + lowercased. */
function canonValue(v: string): string {
  return v.trim().toLowerCase();
}

const LEADING_PUNCT = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}]+$/u;

/**
 * The WHOLE TOKENS of a value: its whitespace-delimited words, canonicalized, with EDGE punctuation
 * stripped (so `"(BK-1)"` and `"BK-1."` both tokenize to `bk-1`).
 *
 * A token is a WORD, not an alphanumeric run: splitting `BK-1` into `bk` + `1` would let the target
 * `BK-1` match the value `BK-1-EXTRA` — the very same "a longer id is a different entity" collision M1
 * exists to kill. Word tokens fail CLOSED instead: an id embedded in a larger token never matches.
 */
function tokensOf(v: string): string[] {
  const out: string[] = [];
  for (const word of canonValue(v).split(/\s+/)) {
    const token = word.replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
    if (token) out.push(token);
  }
  return out;
}

/**
 * M1 — does `target` equal `value`, or a WHOLE-TOKEN run inside it? The one boundary predicate every
 * grounding and coverage verdict routes through.
 *
 * Match ⇔ the canonicalized strings are equal, OR the target's token sequence occurs CONTIGUOUSLY in the
 * value's token sequence (so an id the world named inside its own sentence — `"no record for BK-1"` —
 * still matches, while `BK-10`, `BK-12345`, `BK-1-EXTRA` and `xBK-1y` never do). No substring test, no
 * authored pattern: both sides are data.
 */
export function targetMatchesValue(target: string, value: string): boolean {
  if (canonValue(target) === canonValue(value)) return true;
  const t = tokensOf(target);
  if (!t.length) return false; // a target with no token can only match by whole value
  const v = tokensOf(value);
  for (let i = 0; i + t.length <= v.length; i += 1) {
    if (t.every((tok, j) => tok === v[i + j])) return true;
  }
  return false;
}

/** Does `target` match any of these values by {@link targetMatchesValue}? `undefined` ⇒ always. */
function targetIn(target: string | undefined, values: string[]): boolean {
  if (target === undefined) return true;
  return values.some((v) => targetMatchesValue(target, v));
}

/** `matches(claim, call)` — the target matches an IDENTITY value the WORLD issued for this call (M2: the
 *  call's own args are agent-authored text and are NEVER evidence; a bare count/amount is not a name). */
function claimMatchesCall(ctx: GuardCtx, claim: TurnClaim, c: ObservedCall): boolean {
  return targetIn(claim.target, identityValues(resultOf(ctx, c)));
}

/**
 * `matches` against a guard-VETOED attempt — its args, because a vetoed call never reached the world and
 * so has no result at all. The args are agent-authored, but the ATTEMPT is a world-ledger fact the guard
 * recorded, and the only outcomes this backs (`blocked`/`refused`) are SELF-INCRIMINATING: the worst an
 * agent buys by naming a target here is reporting a refusal on something it never really touched. Same
 * identity filter as the result path, for the same reason — an amount argument names no entity.
 */
function claimMatchesAttempt(claim: TurnClaim, a: { name: string; args: unknown }): boolean {
  return targetIn(claim.target, identityValues(a.args));
}

/** ` on <target>` when the claim names one, else '' — for the deny messages (no tool names leak). */
function onTarget(claim: TurnClaim): string {
  return claim.target ? ` on ${claim.target}` : '';
}

/** Is this claim GROUNDED, given its resolved core outcome? One arm per grounding-table row. */
function isGrounded(
  ctx: GuardCtx,
  claim: TurnClaim,
  resolved: CoreOutcome,
  calls: ObservedCall[],
  attempts: ReadonlyArray<{ name: string; args: unknown }>,
  writes: ReadonlySet<string>,
): boolean {
  const matches = (c: ObservedCall) => claimMatchesCall(ctx, claim, c);
  const effectedWrite = (c: ObservedCall) => writes.has(c.name) && c.tookEffect === true;
  switch (resolved) {
    case 'success':
      return calls.some((c) => effectedWrite(c) && matches(c));
    case 'failure':
      return calls.some((c) => c.ok === false && matches(c));
    case 'blocked':
    case 'refused':
      return (
        attempts.some((a) => claimMatchesAttempt(claim, a)) ||
        calls.some((c) => c.ok === false && matches(c))
      );
    case 'not_found':
      return calls.some(
        (c) => !writes.has(c.name) && c.ok && isEmptyReadResult(resultOf(ctx, c)) && matches(c),
      );
    case 'pending_confirmation':
      return calls.some((c) => c.resultFlags?.requiresConfirmation === true && matches(c));
    case 'no_op':
      return !calls.some((c) => effectedWrite(c) && matches(c));
  }
}

/**
 * `claimIsGrounded` — every declared ACTION must match what the ledger shows happened this turn.
 *
 * For each ACTION intention (MI-D5: a speech intention is skipped — it classifies the message and names
 * no ledger fact): resolve its outcome word to a core meaning (a domain word maps through `outcomes`; an
 * UNDECLARED word is a violation by construction — it can name no ledger fact), then ground it by the
 * table. Auto-installed by the spec class when the domain declares its `writeTools`.
 */
export function claimIsGrounded(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard {
  const writes = new Set(opts.writeTools);
  return {
    kind: 'claimIsGrounded',
    dim: 'behavior',
    check(ctx) {
      const did = ctx.did ?? [];
      if (!did.length) return null;
      const calls = domainCallsThisTurn(ctx);
      const attempts = ctx.attemptedThisTurn ?? [];
      for (const claim of did) {
        if (!isActionOp(claim.op)) continue; // MI-D5: a speech intention is not tool-checked
        // `outcome` is optional on Intention (speech ops carry none); an ACTION intention always carries
        // one (validateClaims enforces it) — absent coerces to '' and resolves to null (unrecognised).
        const resolved = resolveOutcome(claim.outcome ?? '', opts.outcomes);
        if (resolved === null) {
          return `You reported "${claim.op}"${onTarget(claim)} with an outcome the system does not recognise ("${claim.outcome ?? ''}") — report it as one of the known outcomes instead.`;
        }
        if (!isGrounded(ctx, claim, resolved, calls, attempts, writes)) {
          return `You reported "${claim.op}"${onTarget(claim)} as ${resolved}, but nothing this turn shows that — report only what actually happened.`;
        }
      }
      return null;
    },
    prose: () =>
      'every operation you report must match what actually happened this turn — the system verifies each against the tool ledger',
  };
}

/**
 * `claimIsComplete` — no silent action: every write that TOOK EFFECT this turn must be reported.
 *
 * A write is COVERED by an ACTION intention that (a) resolves to `success` through the same `OutcomeMap`
 * `claimIsGrounded` uses — so a domain word like `'settled'` covers exactly like the literal word (the
 * mapping law: the two cross-checks can never disagree on the same claim) — (b) NAMES a `target`, and
 * (c) matches that write's world-issued values. Coverage is INJECTIVE (M3): each write SPENDS a distinct
 * claim, so two writes on the same entity need two claims and a vague "one action succeeded" covers
 * nothing at all. An unreported write is named by its produced label (the call's own result label) when
 * the world issued one, else by a generic phrase — never by the tool name (prose-leak law).
 * Auto-installed alongside `claimIsGrounded`.
 */
export function claimIsComplete(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard {
  const writes = new Set(opts.writeTools);
  return {
    kind: 'claimIsComplete',
    dim: 'behavior',
    check(ctx) {
      // The claims that CAN cover a write: action intentions that resolve to success and name a target.
      const covering = (ctx.did ?? []).filter(
        (claim) =>
          isActionOp(claim.op) &&
          claim.target !== undefined &&
          resolveOutcome(claim.outcome ?? '', opts.outcomes) === 'success',
      );
      const spent = new Set<number>();
      const calls = domainCallsThisTurn(ctx);
      for (const c of calls) {
        if (!(writes.has(c.name) && c.tookEffect === true)) continue;
        const ix = covering.findIndex((claim, i) => !spent.has(i) && claimMatchesCall(ctx, claim, c));
        if (ix >= 0) {
          spent.add(ix); // this claim now accounts for THIS write and no other
          continue;
        }
        const label = producedLabel(ctx, c);
        return label
          ? `You completed ${label} this turn but did not report it — report every action that takes effect so the user knows.`
          : 'You completed an action you did not report this turn — report every action that takes effect so the user knows.';
      }
      return null;
    },
    prose: () =>
      'report every action that takes effect this turn — the user must never be left unaware of something you did',
  };
}

/** The label the world issued for this call (its result `label`), if any — never the tool name. */
function producedLabel(ctx: GuardCtx, c: ObservedCall): string | null {
  const r = resultOf(ctx, c);
  const lbl = (r as { label?: unknown } | null | undefined)?.label;
  return typeof lbl === 'string' && lbl.trim() ? lbl : null;
}

/**
 * `claimCoversRubric` — a per-case coverage rule: every configured `target` must appear in `ctx.did`
 * with the required outcome polarity (or any polarity when `outcome: 'any'`). This REPLACES the prose
 * `replyMentions`/`replyConfirmsLabels`: polarity is a FIELD, so a reply that says "no record of BK-1 was found" can never satisfy
 * a `success` requirement again. The polarity test resolves through the same `OutcomeMap`
 * `claimIsGrounded`/`claimIsComplete` use, so a mapped domain word (e.g. `'settled'` → `success`) satisfies
 * a `success` rubric exactly like the literal word — the mapping law holds across all three cross-checks.
 * `outcome: 'any'` accepts any claim whose outcome RESOLVES to a known core outcome via the map (an
 * undeclared word still does not cover). Config-bound only — never auto-installed.
 */
export function claimCoversRubric(
  opts: { targets: string[]; outcome: CoreOutcome | 'any'; outcomes?: OutcomeMap },
  reason: string,
): Guard {
  return {
    kind: 'claimCoversRubric',
    dim: 'behavior',
    meta: { requiredStrings: [...opts.targets] },
    check(ctx) {
      const did = ctx.did ?? [];
      for (const target of opts.targets) {
        const covered = did.some((claim) => {
          // M1: the configured target must be the claim's target (or a whole token of it) — never a
          // substring, so a `BK-10` claim does not answer a rubric about `BK-1`.
          if (claim.target === undefined || !targetMatchesValue(target, claim.target)) return false;
          const resolved = resolveOutcome(claim.outcome ?? '', opts.outcomes);
          return opts.outcome === 'any' ? resolved !== null : resolved === opts.outcome;
        });
        if (!covered) return reason;
      }
      return null;
    },
    prose: () =>
      `your reply must account for ${opts.targets.join(', ')}${opts.outcome === 'any' ? '' : ` as ${opts.outcome}`}`,
  };
}
