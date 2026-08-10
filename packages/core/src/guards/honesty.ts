/**
 * THE CROSS-CHECK GUARDS — the deterministic honesty core.
 *
 * REPLY PROSE IS NOT THE THING GUARDS READ. A literal mention scan for `BK-1` passes on a reply that
 * says "no record of BK-1 was found" — a text check cannot read polarity, and no better pattern fixes
 * it (patterns are the banned fragility). Instead, the agent DECLARES what it did as STRUCTURE
 * (`ctx.did: Intention[]`), and these guards compare that declaration against WHAT THE ENGINE DERIVED
 * from records of its own: `ctx.observed` (the model's verified calls, with `tookEffect`/`ok`/
 * `resultFlags`), `ctx.world.toolCalls` (the results those calls returned), and `ctx.attemptedThisTurn`
 * (the calls a guard VETOED before they reached the world). None of those the agent controls, so a
 * fabricated claim cannot ground.
 *
 * THE DERIVED ACT LIST is the one source both directions read. Each act of the turn — every vetoed
 * attempt and every write that ran — carries the set of outcome words it honestly supports:
 *
 * ```
 *   a vetoed attempt              tool_called_request_approval · blocked · refused
 *   the world asked to confirm    tool_called_request_approval
 *   the call failed               failure · blocked · refused
 *   the call took effect          success
 *   the call changed nothing      no_op
 * ```
 *
 * THE LAWS OF GROUNDING:
 *  · NO KEY IS CHOSEN BY ITS SHAPE — nothing here elects an identity out of a structure by field
 *    name, so how a world names its fields cannot decide whether an honest declaration is believed.
 *    The agent POINTS instead: `targetName` names the field it read the record from, `targetValue`
 *    holds the value, and the engine looks exactly there. With no `targetName`, the value must be
 *    among the scalars the act returned or was called with. The cost is real and accepted: a scalar
 *    that is not the record — a status word, a sibling id — is accepted where the record's own value
 *    belongs.
 *  · EACH DECLARATION SPENDS ONE ACT — a claim grounds on an act whose outcome set carries its word
 *    and whose data supports its target, and that act is then spent. A declaration that finds no act
 *    left describes something that did not happen; an act with no declaration left is a silent action.
 *  · A READ-ONLY TURN MAY STILL SPEAK BY RULE — `blocked`/`refused`/`no_op` when the turn ADDRESSED
 *    the record through a read, plus `not_found` when a read came back empty. Demanding a vetoed
 *    attempt as proof of a refusal would order the model to reach for the very act it is refusing.
 *  · `any_other_question` IS NEVER TOOL-CHECKED — speech is not an operation, and nothing the engine
 *    recorded can prove a question.
 *  · AN `amount` IS CORROBORATED against the magnitudes of the same act that grounds the claim — an
 *    unchecked figure is a fabricated number delivered inside a block advertised as verified.
 * And the PARTITION: the cross-checks iterate ACTION intentions only — a speech intention
 * (`inform`/`greet`/`refuse`/`ask`) classifies the message and names no recorded fact, so it is never
 * grounded and never covers a write (an action can therefore never hide behind an `inform`).
 */
import type { Guard, GuardCtx, ObservedCall } from '../rules.js';
import {
  assertNoCoreOutcomeShadow,
  attestedEffect,
  CORE_OUTCOMES,
  isActionOp,
  resolveOutcome,
  type CoreOutcome,
  type OutcomeMap,
  type Intention,
} from '../runtime/claims.js';
import { canonArgs } from './flow.js';
import { targetMatchesValue } from './matching.js';
import { domainCallsThisTurn } from './shared.js';

/** The record-field names that describe a call's STATUS rather than the data it returned — ignored when
 *  deciding whether a read came back empty, but ONLY when the value under them is a SCALAR (see
 *  {@link isEmptyReadResult}): a `status:'not_found'` string is not content, a record under `message` is. */
const STATUS_LIKE_KEYS: ReadonlySet<string> = new Set([
  'success', 'ok', 'status', 'state', 'code', 'error', 'message', 'reason', 'found', 'exists',
]);

/** The EXISTENCE flags: the two status keys whose FALSE value is itself a statement that the lookup came
 *  back with nothing. `{found:false}` is positive evidence of emptiness in the way `{data:[]}` is, and
 *  the ordinary "envelope" read shape uses it — see {@link isEmptyReadResult}. `success:false` is NOT
 *  one: it says the CALL failed, which is a different fact from "the record is not there". */
const EXISTENCE_KEYS: ReadonlySet<string> = new Set(['found', 'exists']);

/**
 * Is this read result POSITIVE EVIDENCE that the lookup came back with nothing?
 *
 * Empty ⇔ the canonical empty shapes (`null`/`undefined`/`[]`/`{}`), OR a record that carries at least
 * one DATA CHANNEL — an array- or record-valued field, or a FALSE {@link EXISTENCE_KEYS} flag — with
 * EVERY data channel empty and no content scalar besides booleans and SCALAR status-like words. So
 * `{success:true, data:[]}` and `{found:false, message:'no record'}` are empty, and `{data:[], id:'BK-1'}`
 * is not (the world named something).
 *
 * FAIL CLOSED WITHOUT A DATA CHANNEL: a record whose only fields are scalars is UNDECIDABLE and is NOT
 * empty. Skipping every scalar status-like field would let `{status:'BK-1 is active and confirmed'}` —
 * a read reporting the record as PRESENT — read as EMPTY and ground a `not_found` on it, which is the
 * exact polarity inversion the structured cross-check exists to kill, reappearing inside the guard's own
 * emptiness heuristic. A domain whose empty read has no data channel must return one (`data: []`).
 *
 * KEY-BLINDNESS FOR CONTAINERS: the status-key skip is a statement about a status
 * WORD, so it applies only to a scalar/boolean value; a record or a non-empty list is content whatever
 * its key is called (`{message:{booking:'BK-1'}}` is content).
 */
export function isEmptyReadResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result !== 'object') return false; // a bare scalar names no data channel — undecidable
  const entries = Object.entries(result as Record<string, unknown>);
  if (entries.length === 0) return true;
  let dataChannels = 0;
  for (const [key, val] of entries) {
    if (Array.isArray(val)) {
      dataChannels += 1;
      if (val.length > 0) return false; // a non-empty list is content
      continue;
    }
    // CONTAINERS FIRST, key-blind: a nested record is a data channel under ANY key, status-like or not.
    if (val !== null && typeof val === 'object') {
      dataChannels += 1;
      if (Object.keys(val as object).length > 0) return false;
      continue;
    }
    if (typeof val === 'boolean') {
      if (!val && EXISTENCE_KEYS.has(key)) dataChannels += 1; // `found:false` IS the empty data channel
      continue; // a flag (success:true) is not content
    }
    if (STATUS_LIKE_KEYS.has(key)) continue;  // a SCALAR status/error word is not content
    if (val === null || val === undefined) continue;
    if (val) return false;                    // a truthy scalar field is content
  }
  return dataChannels > 0;
}

/** The MAGNITUDES in a structure — every finite number leaf, plus a string that IS a number (`'12.50'`).
 *  Key-blind on purpose: a magnitude is a quantity wherever it sits, and the only thing it is ever used
 *  for is corroborating a claim's `amount` against the same action history fact that grounds the claim. */
function magnitudes(v: unknown, out: number[] = []): number[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) magnitudes(x, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const val of Object.values(v as Record<string, unknown>)) magnitudes(val, out);
    return out;
  }
  if (typeof v === 'number') {
    if (Number.isFinite(v)) out.push(v);
    return out;
  }
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** The RESULT the world action history recorded for this observed call (name + canonical args), or undefined. */
function resultOf(ctx: GuardCtx, c: ObservedCall): unknown {
  const calls = Array.isArray(ctx.world?.toolCalls) ? ctx.world.toolCalls : [];
  const key = canonArgs(c.args);
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const t = calls[i];
    if (t?.name === c.name && canonArgs((t.args ?? {}) as Record<string, unknown>) === key) return t.result;
  }
  return undefined;
}

/**
 * THE BOUNDARY every grounding, coverage and rubric verdict routes through — whole-value equality, from
 * the engine's one matching law. Re-exported here because this is the module its consumers import it
 * from, and because the honesty verdicts below are the reason it is written the way it is.
 */
export { targetMatchesValue } from './matching.js';

/**
 * Did this call EFFECT A WRITE this turn — the one notion both cross-checks key on.
 *
 * TWO AUTHORITIES, UNION not intersection. A call is an effected write when the DOMAIN declared its tool
 * a write AND it took effect, OR when the WORLD ATTESTED the effect for any tool at all
 * ({@link attestedEffect}). The intersection alone would leave a mutation through a tool absent from
 * `writeTools` — a hand-maintained list, and the easiest thing in a domain to leave stale — silently
 * uncovered while the guard catalog reported full coverage: the action history row says `tookEffect:true` and the
 * engine would decline to use it. `writeTools` says which calls a domain INTENDS as writes (it gates
 * whether the cross-check is installed at all, and it is what makes a `success` claim groundable on the
 * inferred-effect path); it is a LOWER BOUND on the write surface, never an upper one.
 */
function isEffectedWrite(c: ObservedCall, writes: ReadonlySet<string>): boolean {
  return attestedEffect(c) || (writes.has(c.name) && c.tookEffect === true);
}

/** ` on <target>` when the claim names one, else '' — for the deny messages (no tool names leak). */
function onTarget(claim: Intention): string {
  return claim.target ? ` on ${claim.target}` : '';
}

/**
 * WHAT THE ENGINE DERIVED for each ACT of this turn, in order: every vetoed attempt, and every write
 * that ran. Each entry is the set of outcome words that act honestly supports.
 *
 * No field name is read and no identity is elected. An act is what the runtime recorded about it:
 *
 * ```
 *   a vetoed attempt              tool_called_request_approval · blocked · refused
 *   the world asked to confirm    tool_called_request_approval
 *   the call failed               failure · blocked · refused
 *   the call took effect          success
 *   the call changed nothing      no_op
 * ```
 */
function derivedActs(
  ctx: GuardCtx,
  calls: readonly ObservedCall[],
  attempts: ReadonlyArray<{ name: string; args: unknown }>,
  writes: ReadonlySet<string>,
): DerivedAct[] {
  const acts: DerivedAct[] = [];
  for (const a of attempts) {
    acts.push({ outcomes: new Set(['tool_called_request_approval', 'blocked', 'refused']), args: a.args, result: undefined });
  }
  for (const c of calls) {
    if (!isEffectedWrite(c, writes) && !writes.has(c.name)) continue;
    // A SIMULATION is a rehearsal: it changed nothing, so there is no act to declare and none to hide.
    if ((c.args as Record<string, unknown> | undefined)?.simulate === true) continue;
    // The result rides the observed row on every runtime path and lives on the world's own action
    // history besides; `resultOf` reads whichever exists, so a domain that keeps only one is served.
    const of = (o: readonly CoreOutcome[]): DerivedAct => ({ outcomes: new Set(o), args: c.args, result: c.result ?? resultOf(ctx, c) });
    if (c.resultFlags?.requiresConfirmation === true) acts.push(of(['tool_called_request_approval']));
    else if (c.ok === false) acts.push(of(['failure', 'blocked', 'refused']));
    else if (c.tookEffect === true) acts.push(of(['success']));
    else acts.push(of(['no_op']));
  }
  return acts;
}

/** One act as the engine derived it: what it could honestly be called, and the record it touched. */
interface DerivedAct {
  outcomes: Set<CoreOutcome>;
  args: unknown;
  result: unknown;
}

/** EVERY scalar the structure holds, as strings. No key is inspected, so how a world names its fields
 *  cannot decide whether an honest declaration is believed. */
function extractValues(v: unknown, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) extractValues(x, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) extractValues(x, out);
    return out;
  }
  out.push(String(v));
  return out;
}

/**
 * Does this act's record support the target the agent named?
 *
 * The agent names the FIELD it read the record from, so the engine looks exactly there. With no field
 * named, the value must simply be among what the act returned or was called with. Either way, no key is
 * chosen by its shape — the agent points, the engine reads.
 */
function supportsClaim(act: DerivedAct, claim: Intention): boolean {
  // `amount` is rendered into the block the engine advertises as verified, so an unchecked figure is a
  // fabricated number delivered as fact. It is corroborated against the SAME act that carries the target.
  if (claim.amount !== undefined && !magnitudes(act.result).includes(claim.amount)) return false;
  if (claim.target === undefined) return true;
  const where =
    claim.targetName === undefined
      ? [...extractValues(act.result), ...extractValues(act.args)]
      : [
          ...extractValues((act.result as Record<string, unknown> | undefined)?.[claim.targetName]),
          ...extractValues((act.args as Record<string, unknown> | undefined)?.[claim.targetName]),
        ];
  return where.includes(String(claim.target));
}

/** The deny's actionable half: what the turn's REMAINING acts could honestly be called, plus whatever a
 *  turn that only read may say by rule — read off the same list the check walks, so the hint and the
 *  check can never disagree. */
function declarableHint(acts: readonly DerivedAct[], byRule: readonly CoreOutcome[]): string {
  const fromActs = acts.flatMap((a) => [...a.outcomes]);
  const words = CORE_OUTCOMES.filter((o) => fromActs.includes(o) || byRule.includes(o));
  return ` Declarable with this turn's evidence: ${words.length ? words.join(', ') : 'none'}.`;
}

/**
 * `claimIsGrounded` — every declared ACTION must match what the action history shows happened this turn.
 *
 * For each ACTION intention (a speech intention is skipped — it classifies the message and names
 * no action history fact): resolve its outcome word to a core meaning (a domain word maps through `outcomes`; an
 * UNDECLARED word is a violation by construction — it can name no action history fact), then ground it by the
 * table. Auto-installed by the spec class when the domain declares its `writeTools`.
 */
export function claimIsGrounded(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard {
  // m10 at THIS door: the factory is a public export a host (and the eval config loader) binds directly,
  // so the shadow law is enforced where the map enters, not only at the spec constructor (r2/b4.5).
  assertNoCoreOutcomeShadow(opts.outcomes, 'claimIsGrounded');
  const writes = new Set(opts.writeTools);
  return {
    kind: 'claimIsGrounded',
    dim: 'behavior',
    check(ctx) {
      const did = ctx.did ?? [];
      if (!did.length) return null;
      const calls = domainCallsThisTurn(ctx);
      const attempts = ctx.attemptedThisTurn ?? [];
      const acts = derivedActs(ctx, calls, attempts, writes);
      // A turn that only READ can still honestly report a refusal by rule or an absence: the refusal is
      // the spec's own law speaking, and demanding a vetoed attempt as its proof would order the model
      // to reach for the very act it is refusing.
      const readOnly = !acts.length && calls.some((c) => !writes.has(c.name) && c.ok);
      for (const claim of did) {
        if (!isActionOp(claim.op)) continue; // a speech intention is not tool-checked
        // `outcome` is optional on Intention (speech ops carry none); an ACTION intention always carries
        // one (validateClaims enforces it) — absent coerces to '' and resolves to null (unrecognised).
        const resolved = resolveOutcome(claim.outcome ?? '', opts.outcomes);
        if (resolved === null) {
          return `You reported "${claim.op}"${onTarget(claim)} with an outcome the system does not recognise ("${claim.outcome ?? ''}") — report it as one of the known outcomes instead.`;
        }
        // Speech is not an operation: nothing the engine recorded can prove a question.
        if (resolved === 'any_other_question') continue;
        // A turn that only READ can honestly report a refusal by rule or a non-event. An ABSENCE is
        // stricter: the read has to have come back with nothing, or "no record found" would be sayable
        // about a record the same turn just displayed as active.
        // POSITIVE EVIDENCE FIRST. The turn must have ADDRESSED the record at all, or `{target:'BK-999',
        // outcome:'no_op'}` would ground on an empty history and the renderer would announce it to the
        // user as a verified non-event.
        const addressed =
          claim.target === undefined ||
          calls.some(
            (c) =>
              !writes.has(c.name) &&
              c.ok &&
              [...extractValues(c.result ?? resultOf(ctx, c)), ...extractValues(c.args)].includes(String(claim.target)),
          );
        const emptyRead = calls.some((c) => !writes.has(c.name) && c.ok && isEmptyReadResult(c.result ?? resultOf(ctx, c)));
        const ruleWords: CoreOutcome[] =
          readOnly && addressed ? (emptyRead ? ['blocked', 'refused', 'not_found', 'no_op'] : ['blocked', 'refused', 'no_op']) : [];
        const byRule = ruleWords.includes(resolved);
        // Each declaration SPENDS one act, whichever act supports it — the order the agent reports in is
        // its own. A declaration that finds no act left describes something that did not happen, which is
        // how a fabricated extra fails.
        const at = acts.findIndex((a) => a.outcomes.has(resolved) && supportsClaim(a, claim));
        if (at >= 0) {
          acts.splice(at, 1);
          continue;
        }
        if (byRule) continue;
        return `You reported "${claim.op}"${onTarget(claim)} as ${resolved}, but nothing this turn shows that — report only what actually happened.${declarableHint(acts, ruleWords)}`;
      }
      return null;
    },
    prose: () =>
      'every operation you report must match what actually happened this turn — the system verifies each against the tool actionHistory',
  };
}

/**
 * `claimIsComplete` — no silent action: every act that TOOK EFFECT this turn must be reported.
 *
 * THE SAME LIST, THE OTHER DIRECTION. `claimIsGrounded` walks the DECLARATIONS and asks whether each one
 * matches an act — no lying. This walks the ACTS and asks whether each one has a declaration at its
 * position — no hiding. One derived list, compared both ways; no field name is read and no identity is
 * compared.
 *
 * ```
 *   two writes landed, one declaration    → an operation took effect that the reply does not report
 *   one write landed, declared `success`  → clean
 *   one write landed, declared `no_op`    → they do not line up
 * ```
 *
 * Only what LANDED is counted. A vetoed attempt changed nothing, so there is nothing to hide about it —
 * that half is `claimIsGrounded`'s. Auto-installed alongside `claimIsGrounded`.
 */
export function claimIsComplete(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard {
  assertNoCoreOutcomeShadow(opts.outcomes, 'claimIsComplete'); // m10 at this door (r2/b4.5)
  const writes = new Set(opts.writeTools);
  return {
    kind: 'claimIsComplete',
    dim: 'behavior',
    check(ctx) {
      const calls = domainCallsThisTurn(ctx);
      const acts = derivedActs(ctx, calls.filter((c) => isEffectedWrite(c, writes)), [], writes);
      if (!acts.length) return null;
      const declared = (ctx.did ?? []).filter((c) => isActionOp(c.op));
      for (let i = 0; i < acts.length; i += 1) {
        const claim = declared[i];
        if (claim && acts[i].outcomes.has(resolveOutcome(claim.outcome ?? '', opts.outcomes) as CoreOutcome)) continue;
        return claim === undefined
          ? 'An operation took effect this turn that your reply does not report — report every act that happened, naming the record it touched.'
          : `You reported ${declared.length} operation(s) but ${acts.length} happened, and they do not line up — report each act as what it actually was, in the order you did them.`;
      }
      return null;
    },
    prose: () =>
      'report every action that takes effect this turn — the user must never be left unaware of something you did',
  };
}

/**
 * `mustAccountFor` — a per-case coverage rule: every configured `target` must appear in `ctx.did`
 * with the required outcome polarity (or any polarity when `outcome: 'any'`). Polarity is a FIELD, so a
 * reply that says "no record of BK-1 was found" can never satisfy a `success` requirement — which is
 * exactly what a literal mention scan over the prose cannot decide. The polarity test resolves through the same `OutcomeMap`
 * `claimIsGrounded`/`claimIsComplete` use, so a mapped domain word (e.g. `'settled'` → `success`) satisfies
 * a `success` rubric exactly like the literal word — the mapping law holds across all three cross-checks.
 * `outcome: 'any'` accepts any claim whose outcome RESOLVES to a known core outcome via the map (an
 * undeclared word still does not cover). Config-bound only — never auto-installed.
 */
export function mustAccountFor(
  opts: { records: string[]; outcome: CoreOutcome | 'any'; outcomes?: OutcomeMap },
  reason: string,
): Guard {
  // m10 at THIS door (r2/b4.3–b4.4): the eval config path builds a CONTRACT-LESS spec and threads its
  // `outcomes` block straight in here, so the spec constructor's gate never saw it — and an ungated
  // `{NOT_FOUND:'success'}` let the core word for "nothing was there" satisfy a `success` rubric, faking
  // the one field the rubric exists to make unfakeable.
  assertNoCoreOutcomeShadow(opts.outcomes, 'mustAccountFor');
  return {
    kind: 'mustAccountFor',
    dim: 'behavior',
    meta: { requiredStrings: [...opts.records] },
    check(ctx) {
      const did = ctx.did ?? [];
      for (const record of opts.records) {
        const covered = did.some((claim) => {
          // THE BOUNDARY: the configured target must BE the claim's target, whole value — never a
          // substring and never a token inside it, so neither a `BK-10` claim nor a sentence-shaped
          // target (`'no record for BK-1'`) answers a rubric about `BK-1`.
          if (claim.target === undefined || !targetMatchesValue(record, claim.target)) return false;
          const resolved = resolveOutcome(claim.outcome ?? '', opts.outcomes);
          return opts.outcome === 'any' ? resolved !== null : resolved === opts.outcome;
        });
        if (!covered) return reason;
      }
      return null;
    },
    prose: () =>
      `your reply must account for ${opts.records.join(', ')}${opts.outcome === 'any' ? '' : ` as ${opts.outcome}`}`,
  };
}
