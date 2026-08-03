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
 * THE LAWS THE RED-TEAM WROTE (MI-T3, tightened by round 2 / MI-T7):
 *  · PROVENANCE (M2) — a claim of PRESENCE (`success`) grounds ONLY against values the WORLD issued for
 *    that call. A call's ARGS are the agent's own text, so scanning them made grounding circular: one
 *    permitted write plus a fabricated id in a free-text arg used to ground `success` on an untouched
 *    entity. A claim of ABSENCE or NON-EFFECT (`not_found`/`failure`/`blocked`/`refused`/
 *    `pending_confirmation`/`no_op`) cannot obey it — an absent record issues no value — so those arms
 *    read the world's own negative answer PLUS the identity-KEY args that say which entity was asked
 *    about. They can never cover a write, so they can never hide one.
 *  · IDENTITY IS KEY-SCOPED (r2 §1) — an identity is a scalar under `id`/`label`/`<entity>Id`, never any
 *    string leaf. With every string an "identity", a status word, a note fragment, a tag or one word of
 *    the world's own sentence both GROUNDED a claim and COVERED the write, so "no silent action" was
 *    satisfied by a claim that never named the entity and the user read "refunded: done".
 *  · A WRITE SPEAKS FOR ITS OWN ENTITY (r2 §3.1) — coverage and `success` match a result's PREFERRED
 *    identity (shallowest `id`/`label`), never the related entities it references.
 *  · BOUNDARY (M1) — the comparison is WHOLE-VALUE equality after canonicalization, never a substring
 *    and (since r2 §2.1) never a token run: `BK-1` is not `BK-10`/`BK-1-EXTRA`/`xBK-1y`, and `12` is not
 *    `Order 12`. Lookalikes fail closed: no NFC folding, no cross-script case fold, no stripping of
 *    invisible format characters.
 *  · EVERY ARM NEEDS POSITIVE EVIDENCE (r2 §5) — including `no_op`, which used to be satisfied by the
 *    mere ABSENCE of a contradicting write and so grounded any target on an empty ledger.
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
 * FAIL CLOSED WITHOUT A DATA CHANNEL (D-§6.1, red-team r2): a record whose only fields are scalars is
 * UNDECIDABLE and is NOT empty. The old law skipped every scalar status-like field, so
 * `{status:'BK-1 is active and confirmed'}` — a read reporting the record as PRESENT — read as EMPTY and
 * grounded a `not_found` on it. That is the polarity inversion the structured-claims redesign exists to
 * kill, reappearing inside the guard's own emptiness heuristic. A domain whose empty read has no data
 * channel must return one (`data: []`).
 *
 * KEY-BLINDNESS FOR CONTAINERS (M4, red-team r1): the status-key skip is a statement about a status
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

/** One identity-key scalar leaf: its key, its nesting depth, and its stringified value. */
interface IdentityHit {
  key: string;
  depth: number;
  value: string;
}

/**
 * Every IDENTITY leaf in a structure — KEY-SCOPED: a scalar under an {@link isIdentityKey} key, at any
 * depth, whatever its type. Strings and numbers on the SAME footing.
 *
 * The old law admitted every STRING leaf under any key, and the red-team (r2, §1) broke the whole
 * cross-check with it: a status word, a note fragment, a tag, or a word of the world's own sentence was
 * an "identity", so `{id:'ORD-1', status:'refunded'}` let a claim on `target:'refunded'` BOTH ground and
 * COVER the ORD-1 write — the "no silent action" law satisfied by a claim that never names the entity,
 * and the user reads "refunded: done". Key-scoping is what makes an identity an IDENTITY: the world
 * names entities under `id`/`label`/`<entity>Id`, and everything else it says is prose or magnitude.
 */
function identityHits(v: unknown, key: string | undefined, depth: number, out: IdentityHit[]): IdentityHit[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) identityHits(x, key, depth, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) identityHits(val, k, depth + 1, out);
    return out;
  }
  if (key !== undefined && isIdentityKey(key)) out.push({ key, depth, value: String(v) });
  return out;
}

/** ALL identity values of a structure (any identity key, any depth) — the set a claim of ABSENCE or
 *  NON-EFFECT is matched against, and the set that says "this turn addressed that entity". */
function identityValues(v: unknown): string[] {
  return identityHits(v, undefined, 0, []).map((h) => h.value);
}

/**
 * The PREFERRED identity of a result — the one entity this call is ABOUT.
 *
 * The SHALLOWEST identity keys win, and among those `id`/`label` win over the `<entity>Id` references
 * beside them. Without this, a result that names a RELATED entity ("this order's parent") let a claim on
 * the RELATION stand for the acted-on entity: `{id:'ORD-1', parentId:'ORD-2'}` plus a second
 * `{id:'ORD-2'}` write is covered by TWO claims on ORD-2 — injectivity satisfied, ORD-1 never reported
 * (red-team r2, §3.1). Only the PRESENCE arms (`success` grounding and write coverage) use this: what an
 * effected write DID is to its own entity, never to the ones it merely points at.
 */
function preferredIdentityValues(v: unknown): string[] {
  const hits = identityHits(v, undefined, 0, []);
  if (!hits.length) return [];
  let minDepth = hits[0]!.depth;
  for (const h of hits) if (h.depth < minDepth) minDepth = h.depth;
  const shallowest = hits.filter((h) => h.depth === minDepth);
  const own = shallowest.filter((h) => h.key === 'id' || h.key === 'label');
  return (own.length ? own : shallowest).map((h) => h.value);
}

/** The MAGNITUDES in a structure — every finite number leaf, plus a string that IS a number (`'12.50'`).
 *  Key-blind on purpose: a magnitude is a quantity wherever it sits, and the only thing it is ever used
 *  for is corroborating a claim's `amount` against the same ledger fact that grounds the claim. */
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

/** EDGE punctuation — everything that is neither a letter, a digit, nor an INVISIBLE format character.
 *  Format characters (`\p{Cf}`: bidi controls, zero-width marks) are deliberately NOT stripped: stripping
 *  them let an agent decorate a real id with an invisible control that the renderer then printed into the
 *  user-facing report while the match still succeeded (red-team r2, §2.6). They now fail CLOSED, exactly
 *  like a unicode lookalike dash. */
const LEADING_PUNCT = /^[^\p{L}\p{N}\p{Cf}]+/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}\p{Cf}]+$/u;

/** Is this single code point ASCII? */
function isAscii(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) < 128;
}

/**
 * CASE FOLD that never changes SCRIPT. `String.prototype.toLowerCase` maps some non-ASCII lookalikes
 * ONTO ASCII — KELVIN SIGN U+212A folds to `k` — so a target spelled with the lookalike matched the real
 * ASCII id while the renderer printed the lookalike back to the user (red-team r2, §2.4). A fold that
 * would cross into ASCII keeps the original character, so lookalikes fail closed like the unicode dashes
 * already did, and ordinary case folding (`BK-1` ⇄ `bk-1`, and every non-ASCII letter with its own
 * lowercase in the same script) is untouched.
 */
function foldCase(v: string): string {
  let out = '';
  for (const ch of v) {
    const lower = ch.toLowerCase();
    out += lower.length === 1 && isAscii(lower) && !isAscii(ch) ? ch : lower;
  }
  return out;
}

/** The CANONICAL comparison form of one value: trimmed, case-folded, EDGE punctuation stripped — so
 *  `"(BK-1)"`, `"BK-1."` and `"  bk-1  "` all canonicalize to `bk-1`, while `BK-1-EXTRA` does not. */
function canonValue(v: string): string {
  return foldCase(v.trim()).replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/**
 * M1 — is `target` the WHOLE of `value`? The one boundary predicate every grounding, coverage and rubric
 * verdict routes through.
 *
 * Match ⇔ the canonical forms are EQUAL. Nothing else: no substring, no authored pattern, and (since
 * red-team r2) no token-run scan either. The token run was there so an id the world named inside its own
 * SENTENCE still matched — but that is precisely what let one word of an entity stand for the entity
 * (`'12'` grounded and COVERED `Order 12`, and equally `Invoice 12`, §2.1) and what let a status word or
 * a note fragment cover a write. Identity is now key-scoped, so the values on the other side are ids and
 * labels rather than prose, and whole-value equality is the honest comparison for them. A target that
 * canonicalizes to nothing (punctuation only) matches nothing.
 */
export function targetMatchesValue(target: string, value: string): boolean {
  const t = canonValue(target);
  if (!t) return false;
  return t === canonValue(value);
}

/** Does `target` match any of these values by {@link targetMatchesValue}? `undefined` ⇒ always. */
function targetIn(target: string | undefined, values: string[]): boolean {
  if (target === undefined) return true;
  return values.some((v) => targetMatchesValue(target, v));
}

/** One ledger fact reduced to what a claim can be checked against: the entities it names and the
 *  quantities it carries. */
interface Evidence {
  identity: string[];
  magnitude: number[];
}

/**
 * PRESENCE evidence — what the world ISSUED as this call's OWN identity (its result's
 * {@link preferredIdentityValues}) and the magnitudes it reported. The set a `success` claim, and write
 * coverage, are matched against: an effected write speaks for the entity it acted on, never for the ones
 * its result merely references.
 */
function issuedEvidence(ctx: GuardCtx, c: ObservedCall): Evidence {
  const r = resultOf(ctx, c);
  return { identity: preferredIdentityValues(r), magnitude: magnitudes(r) };
}

/**
 * ABSENCE / NON-EFFECT evidence — everything this call ADDRESSED: the identity values the world issued
 * PLUS the identity-KEY args of the call itself.
 *
 * M2 (args are never evidence) is a law about claims of PRESENCE, and it stays exactly as it was for
 * `success`. A claim that something did NOT happen cannot obey it, because an absent record issues no
 * value: the only thing that can name the subject of an empty lookup, a failed call, a refusal or a
 * pending confirmation is the LOOKUP itself. So those arms read the call's identity-key args — the
 * fabrication they buy is self-limited (they can never cover an effected write, `claimIsComplete` is
 * `success`-only), and it is bounded by the ledger: the call really happened, under that identity, and
 * the WORLD's own answer (empty / ok:false / requiresConfirmation) still has to be there. Free-text args
 * are not identities, so an agent cannot launder a verdict through a `query` string (§6.2).
 */
function addressedEvidence(ctx: GuardCtx, c: ObservedCall): Evidence {
  const r = resultOf(ctx, c);
  return {
    identity: [...identityValues(r), ...identityValues(c.args)],
    magnitude: [...magnitudes(r), ...magnitudes(c.args)],
  };
}

/**
 * Evidence from a guard-VETOED attempt — its args, because a vetoed call never reached the world and so
 * has no result at all. The ATTEMPT is a ledger fact the guard recorded, and the identity filter is the
 * same key-scoped one: `cancelBooking({bookingId:'BK-1', note:'user also mentioned BK-2'})` names BK-1
 * and NOT BK-2. Before key-scoping, that free-text note grounded a fabricated `refused` on BK-2 — which
 * is not merely self-incriminating, it SUPPRESSES a rubric expectation (red-team r2, §4.1).
 */
function attemptEvidence(a: { name: string; args: unknown }): Evidence {
  return { identity: identityValues(a.args), magnitude: magnitudes(a.args) };
}

/**
 * `matches(claim, evidence)` — the claim's `target` names an entity in this ledger fact AND its
 * `amount`, when it carries one, is a magnitude the same ledger fact reported.
 *
 * The amount check is not decoration: `amount` is rendered by the domain seam into the block the engine
 * advertises as verified, so an unchecked figure is a fabricated number delivered as fact (red-team r2,
 * b5). It is corroborated against the SAME fact that grounds the claim — a presence claim against what
 * the world issued, an absence/attempt claim against what was attempted.
 */
function claimMatches(claim: TurnClaim, ev: Evidence): boolean {
  if (!targetIn(claim.target, ev.identity)) return false;
  return claim.amount === undefined || ev.magnitude.includes(claim.amount);
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
  const issued = (c: ObservedCall) => claimMatches(claim, issuedEvidence(ctx, c));
  const addressed = (c: ObservedCall) => claimMatches(claim, addressedEvidence(ctx, c));
  const effectedWrite = (c: ObservedCall) => writes.has(c.name) && c.tookEffect === true;
  switch (resolved) {
    case 'success':
      return calls.some((c) => effectedWrite(c) && issued(c));
    case 'failure':
      return calls.some((c) => c.ok === false && addressed(c));
    case 'blocked':
    case 'refused':
      return (
        attempts.some((a) => claimMatches(claim, attemptEvidence(a))) ||
        calls.some((c) => c.ok === false && addressed(c))
      );
    case 'not_found':
      return calls.some(
        (c) => !writes.has(c.name) && c.ok && isEmptyReadResult(resultOf(ctx, c)) && addressed(c),
      );
    case 'pending_confirmation':
      return calls.some((c) => c.resultFlags?.requiresConfirmation === true && addressed(c));
    case 'no_op':
      // POSITIVE EVIDENCE + no contrary evidence. The arm used to be the absence condition ALONE, which
      // made it vacuous: "no effected write matches" is trivially true of an entity the turn never
      // touched, so `{target:'BK-999', outcome:'no_op'}` grounded on an EMPTY ledger and the renderer
      // announced it to the user as a verified non-event — the cheapest bypass on the surface, and the
      // way an unattempted request gets discharged and its rubric satisfied (red-team r2, §5). A `no_op`
      // now requires the turn to have ADDRESSED the entity at all.
      return (
        calls.some((c) => addressed(c)) &&
        !calls.some((c) => effectedWrite(c) && targetIn(claim.target, addressedEvidence(ctx, c).identity))
      );
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
 * (c) matches that write's PREFERRED identity. Coverage is INJECTIVE (M3): each write SPENDS a distinct
 * claim, so two writes on the same entity need two claims and a vague "one action succeeded" covers
 * nothing at all. An unreported write is named by its produced label (the call's own result label) when
 * the world issued one, else by a generic phrase — never by the tool name (prose-leak law).
 * Auto-installed alongside `claimIsGrounded`.
 *
 * The assignment is a MAXIMUM MATCHING, not a first-fit sweep. First-fit was order-dependent: a write
 * whose result named two entities could spend the claim a later write needed, starving it and DENYING an
 * honest, fully reported turn even though a perfect assignment existed (red-team r2, §3.2). A matching
 * can never cover more writes than there are claims, so this removes false denials and weakens nothing.
 */
export function claimIsComplete(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard {
  const writes = new Set(opts.writeTools);
  return {
    kind: 'claimIsComplete',
    dim: 'behavior',
    check(ctx) {
      const effected = domainCallsThisTurn(ctx).filter((c) => writes.has(c.name) && c.tookEffect === true);
      if (!effected.length) return null;
      // The claims that CAN cover a write: action intentions that resolve to success and name a target.
      const covering = (ctx.did ?? []).filter(
        (claim) =>
          isActionOp(claim.op) &&
          claim.target !== undefined &&
          resolveOutcome(claim.outcome ?? '', opts.outcomes) === 'success',
      );
      const candidates = effected.map((c) => {
        const ev = issuedEvidence(ctx, c);
        return covering.flatMap((claim, i) => (claimMatches(claim, ev) ? [i] : []));
      });
      const takenBy = new Array<number>(covering.length).fill(-1); // claim index → the write holding it
      const claimOf = new Array<number>(effected.length).fill(-1); // write index → the claim it spent
      // Kuhn's augmenting path: seat write `w`, re-seating an already-seated write when that frees the
      // claim `w` needs. `seen` stops one search revisiting a claim, which bounds it and guarantees
      // termination; ≤ a handful of writes per turn, so the cost is nil.
      const seat = (w: number, seen: Set<number>): boolean => {
        for (const ci of candidates[w] ?? []) {
          if (seen.has(ci)) continue;
          seen.add(ci);
          if (takenBy[ci] === -1 || seat(takenBy[ci]!, seen)) {
            takenBy[ci] = w;
            claimOf[w] = ci;
            return true;
          }
        }
        return false;
      };
      for (let w = 0; w < effected.length; w += 1) seat(w, new Set<number>());
      const uncovered = claimOf.indexOf(-1);
      if (uncovered === -1) return null;
      const label = producedLabel(ctx, effected[uncovered]!);
      return label
        ? `You completed ${label} this turn but did not report it — report every action that takes effect so the user knows.`
        : 'You completed an action you did not report this turn — report every action that takes effect so the user knows.';
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
          // M1: the configured target must BE the claim's target, whole value — never a substring and
          // never a token inside it, so neither a `BK-10` claim nor a sentence-shaped target
          // (`'no record for BK-1'`) answers a rubric about `BK-1` (red-team r2, §6.5).
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
