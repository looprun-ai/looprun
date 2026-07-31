/**
 * HONESTY guards — the reply must match what actually happened: no fabricated success, no destructive
 * claim without a destructive effect, no false failure claim, no claim about a tool this agent does not
 * hold, no ungrounded regulated figure, no competitor claim (risk families 3, 4 and 5).
 */
import type { Guard, GuardCtx, AgentWorld } from '../rules.js';
import {
  allMatches,
  domainCallsThisTurn,
  matches,
  norm,
  ranThisTurn,
  splitSentences,
  toolResultText,
} from './shared.js';

// ── BEHAVIOR (reply-checks) ──────────────────────────────────────────────────

/**
 * If `tool` did NOT succeed this turn, the reply must not claim/imply it did (existence-keyed). Every
 * seam is business-owned and injected — the runtime carries NO linguistic pattern of its own:
 *  - `labelRe` (which tokens are artifact labels) + `refExists` (does a cited label exist in the world?
 *    the injected existence predicate that replaced the former hardcoded media coupling — absent ⇒ only
 *    labels produced THIS turn are known) → the invented-LABEL branch (attempt-independent: citing a
 *    nonexistent artifact is always fabrication).
 *  - `claimRe` / `verbClaimRe` (the "created/generating an image" phrasing) → the claim-LANGUAGE branch,
 *    ATTEMPT-KEYED (the destructiveClaimRequiresSuccess precedent): with no attempt on `tool` this turn
 *    (executed or vetoed), production vocabulary is descriptive/status talk (a fixed-duration explainer, a
 *    quota explanation) — left alone. The measured false-positives (fixed-duration + zero-quota cells)
 *    rejected CORRECT informational replies and forced the exhaustion fallback.
 *  - `banRe` (optional) → the UNCONDITIONAL ban: a phrase the reply may never carry, denied regardless of
 *    attempts (absorbs the former replyNoProductionClaim kind). Given ONLY `banRe` the guard is a pure
 *    ban; the other seams are absent and silent.
 */
export function noFabricatedSuccess(
  tool: string,
  opts: {
    reason: string;
    claimRe?: RegExp;
    labelRe?: RegExp;
    verbClaimRe?: RegExp;
    banRe?: RegExp;
    refExists?: (world: AgentWorld, label: string) => boolean;
    /**
     * DID THE ACTION ACTUALLY TAKE EFFECT this turn? Injected by the domain, because the runtime
     * cannot know (P8a: no business vocabulary here).
     *
     * THE TRAP THIS CLOSES (measured on a blind generation into a new domain). The default is
     * `ranThisTurn`, which reads `ObservedCall.ok` — and `ok` means "the call EXECUTED", never "the
     * action SUCCEEDED". A world that THROWS on refusal yields `ok:false` and the guard adjudicates
     * normally. A world that RETURNS its refusal — `{ reason: 'part_unavailable' }`, a perfectly
     * reasonable and arguably better design — yields `ok:true`, and the whole guard short-circuits
     * to `null`. Measured consequence: an agent announced order `OS-2023` right after the world
     * refused to open it, with every seam of this guard disarmed.
     *
     * So: if your world reports refusals as RESULTS rather than as failures, pass this predicate.
     * Absent, the default behaviour is byte-stable for every existing bundle.
     */
    succeeded?: (ctx: GuardCtx) => boolean;
    /** Override the DERIVED prose (prose≠reason law). `reason` stays the deny text. */
    prose?: string;
    /** The sentence that tells the model what `banRe` forbids. REQUIRED in spirit whenever `banRe` is
     *  used: the ban is the one seam whose rule cannot be derived (the pattern is a domain regex and the
     *  runtime may hold no language of its own, P8a). Without it the model is corrected for a rule it was
     *  never shown — see the prose note below. */
    banProse?: string;
  },
): Guard {
  return {
    kind: 'noFabricatedSuccess',
    dim: 'behavior',
    // WHICH SEAMS ARE ARMED, recorded on the guard itself. A seam whose forbidden thing is an
    // arbitrary domain regex has no derivable sentence, so arming it without its companion prose
    // corrects the model for a rule it was never given (the ARMED_SEAMS law). A lint can only check
    // that by READING the runtime — reconstructing it from the call site's source text is the
    // re-encoding this codebase refuses. Values are booleans, never the patterns themselves.
    meta: { armed: { banRe: opts.banRe != null, banProse: opts.banProse != null } },
    check(ctx) {
      const reply = ctx.reply ?? '';
      // Unconditional ban — checked BEFORE the attempt short-circuit so it fires regardless of attempts.
      if (opts.banRe && matches(opts.banRe, reply)) return opts.reason;
      // `ok` is "the call executed", not "the action succeeded" — a refusal-as-result world makes
      // every one of them true. The domain may say what success means; default is unchanged.
      if (opts.succeeded ? opts.succeeded(ctx) : ranThisTurn(ctx, tool)) return null;
      let labelsFound = 0;
      if (opts.labelRe) {
        // Collect ALL label tokens. Build the global variant locally so a shared /g regex (whose
        // lastIndex would persist across turns) is never required on opts.labelRe.
        const labelRe = opts.labelRe.global ? opts.labelRe : new RegExp(opts.labelRe.source, opts.labelRe.flags + 'g');
        const labels = reply.match(labelRe) ?? [];
        labelsFound = labels.length;
        const produced = ctx.producedThisTurn ?? [];
        const invented = labels.filter((l) => !produced.includes(l) && !(opts.refExists?.(ctx.world, l) ?? false));
        if (invented.length) return opts.reason;
      }
      const attempted = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.name === tool);
      const claims =
        (opts.claimRe ? matches(opts.claimRe, reply) : false) ||
        (opts.verbClaimRe ? matches(opts.verbClaimRe, reply) : false);
      // `labelsFound === 0` is a DELIBERATE narrowing: reaching this line with labelsFound > 0 means
      // the label branch
      // above already ran and cleared EVERY cited label (each was producedThisTurn or known to
      // refExists). A claim that names real, existing artifacts is grounded evidence, not fabrication —
      // firing on it would deny a correct reply that merely reuses production vocabulary while citing
      // valid labels. With no labels at all there is nothing to corroborate the claim, so the
      // attempt-keyed language branch stands.
      if (attempted && claims && labelsFound === 0) return opts.reason;
      return null;
    },
    /**
     * PROSE COVERS EVERY ARMED SEAM.
     *
     * The old derived prose stated ONE of the three branches ("only state that <tool> was done after
     * <tool> has actually succeeded this turn") and produced a MALFORMED sentence in the pure-ban shape
     * every certified bundle uses — `noFabricatedSuccess('', { banRe, reason })` rendered
     * "only state that  was done after  has actually succeeded this turn" into the trunk, naming nothing.
     * Two enforced rules were therefore invisible to the model:
     *   - the LABEL branch denies citing an identifier that was not produced this turn and does not exist
     *     (attempt-independent) — a model can honour the claim rule perfectly and still be denied;
     *   - the BAN branch denies a phrase unconditionally, even on a turn where the tool DID succeed.
     * Both are now rendered. The ban's sentence cannot be derived (its pattern is a domain regex and the
     * runtime carries no language, P8a), so it comes from `banProse`; when an author omits it the prose
     * falls back to a neutral warning that such a barred phrasing exists — strictly better than silence,
     * and the generator skill should supply the real sentence.
     */
    prose: () => {
      if (opts.prose) return opts.prose;
      const parts: string[] = [];
      if (tool) parts.push(`only state that ${tool} was done after ${tool} has actually succeeded this turn`);
      if (opts.labelRe) {
        parts.push('never cite an identifier for anything you did not produce this turn and that is not on record');
      }
      if (opts.banRe) {
        parts.push(
          opts.banProse ??
            'never use a wording that announces something this agent does not actually do — if you are unsure whether a phrase claims an action you did not perform, do not use it',
        );
      }
      return parts.join('; ');
    },
  };
}

/**
 * The reply claims a deletion/removal, but no destructive tool SUCCEEDED this turn. ATTEMPT-KEYED (the
 * P1-FP fix): the check may fire ONLY when a listed destructive tool was actually ATTEMPTED this turn (an
 * observed call, executed OR vetoed). With NO attempt, a destructive verb in the reply is read-backed
 * STATUS talk (relaying prior world state), never an action claim — so it is left alone, killing the false
 * positive where a status readback tripped the claim regex. Once an attempt exists, the legal cases are
 * exempted in order: the action truly took effect (a `confirmed:true` success this turn); a probe ran and
 * the reply seeks confirmation (`askRe`); an honest failure/negation report (`exemptRe`). What remains is
 * caught SENTENCE-SCOPED: a `claimRe` match fires only when its OWN sentence is neither a question nor an
 * offer/conditional (`offerRe`), so an offer earlier in the reply can never mask a genuine declarative
 * claim later. Every linguistic pattern — the destructive-claim regex, the confirm-seeking `askRe`, the
 * offer/conditional `offerRe`, and the optional `exemptRe` — is injected by the domain bundle; the runtime
 * supplies only the attempt-keying + sentence mechanisms and the English prose.
 */
export function destructiveClaimRequiresSuccess(
  destructiveTools: string[],
  opts: {
    claimRe: RegExp;
    askRe: RegExp;
    offerRe: RegExp;
    exemptRe?: RegExp;
    confirmArg?: string | null;
    /**
     * DID A DESTRUCTIVE ACTION ACTUALLY TAKE EFFECT this turn? The `succeeded` escape hatch, mirroring
     * `noFabricatedSuccess`. The default `tookEffect` reads `ObservedCall.ok` — and `ok`
     * means "the call EXECUTED", never "the action SUCCEEDED". A world that RETURNS its refusal
     * (`{ voided:false, reason }`) rather than throwing yields `ok:true`, so a BLOCKED deletion reads
     * as "took effect" and this guard wrongly stays quiet — the refusal-as-result trap the sibling
     * documents. A domain whose world cannot be made to report refusals as `ok:false` passes
     * `succeeded` to say what "took effect" means. Absent ⇒ byte-identical to every existing bundle,
     * AND the W1 world-contract gate (lint-world-test) keeps `o.ok` honest for generated worlds, so
     * the default is already sound there — the hatch is the fallback for a world the gate cannot fix.
     */
    succeeded?: (ctx: GuardCtx) => boolean;
  },
): Guard {
  const { claimRe: re, askRe, offerRe, exemptRe } = opts;
  const set = new Set(destructiveTools);
  // The confirm FLAG arrives as a param, matching the sibling kinds
  // (`confirmFirst`'s `argFlag`, `pendingConfirmMustAsk`'s `confirmArg`). `'confirmed'` is the default,
  // so every certified bundle is byte-unchanged. `null` = the tool has NO confirm flag (the
  // `'prior-ask'` mechanism: a zero-arg destructive action).
  //
  // WHY THIS MATTERED: `confirmed === true` was HARDCODED, so for a flag-less destructive tool
  // `tookEffect` could never be true and `probedThisTurn` was always true. A LEGITIMATE deletion —
  // askUser in turn 1, the action actually succeeding in turn 2 — therefore hit a guard that considered
  // nothing to have taken effect, and the honest "it is deleted" report was vetoed into a redrive.
  const confirmArg = opts.confirmArg === undefined ? 'confirmed' : opts.confirmArg;
  return {
    kind: 'destructiveClaimRequiresSuccess',
    dim: 'behavior',
    check(ctx) {
      // ATTEMPT-KEYING: no listed destructive tool touched this turn ⇒ any destructive verb is read-backed
      // status, not an action claim — do not fire.
      const attempts = ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex && set.has(o.name));
      if (!attempts.length) return null;
      // DID A DESTRUCTIVE ACTION TAKE EFFECT THIS TURN? Prefer the WORLD's own mutation signal —
      // `ObservedCall.tookEffect`, threaded by the backend — over the
      // confirm-flag heuristic. the heuristic (`o.ok && confirmArg:true`)
      // DISAGREES with the world whenever the world one-steps a below-threshold two-step tool (it ignores
      // `confirmed`, so a committed call has `confirmed:false` and read as "not took effect") or on a
      // flag-less one-step tool — so an HONEST "I issued it" reply over a real mutation was vetoed into an
      // exhaustion stub (case 13: voucher committed, guard demanded `confirmed:true`). Keying on the
      // world's `tookEffect` is the same discrimination B1 gave `noFalseFailureClaim`, one guard over, and
      // it also closes the mixed success+refusal turn (only a mutation that took effect counts). FALLBACK:
      // a hand-crafted ctx that sets no `tookEffect` (proof fixtures) keeps the original confirm-flag
      // heuristic byte-for-byte, so no existing proof changes; real runs (backend-populated) use the world.
      const tookEffect = opts.succeeded
        ? opts.succeeded(ctx)
        : attempts.some((o) =>
            o.tookEffect !== undefined
              ? o.tookEffect === true
              : o.ok && (confirmArg === null || o.args?.[confirmArg] === true),
          );
      if (tookEffect) return null;
      const reply = ctx.reply ?? '';
      // a destructive tool ATTEMPTED with
      // confirmed!==true is a probe whether it succeeded or was policy-REJECTED — tookEffect===false already holds here, so counting a failed
      // probe only restores the askRe whole-reply exemption for the honest cap-explanation
      // (measured: the strict form discarded correct cap replies into exhaustion stubs).
      // For a FLAG-LESS tool the probe shape is "an attempt that did not take effect" — i.e. a failed or
      // vetoed call (a successful one would have returned above via tookEffect). For a flagged tool it
      // is any attempt without `confirmArg:true`.
      const probedThisTurn = attempts.some((o) => (confirmArg === null ? !o.ok : o.args?.[confirmArg] !== true));
      if (probedThisTurn && matches(askRe, reply)) return null;
      if (exemptRe && matches(exemptRe, reply)) return null;
      const declarativeClaim = splitSentences(reply).some(
        (sentence) => matches(re, sentence) && !sentence.endsWith('?') && !matches(offerRe, sentence),
      );
      return declarativeClaim
        ? 'Nothing destructive took effect this turn — do not claim the action happened. Report the actual state (what succeeded, what was refused and why).'
        : null;
    },
    // verb-NEUTRAL. The prose was fixed to "deleted/removed", which names
    // the wrong action for a domain whose destructive verbs are refund/rebook/charge/issue — the model read
    // a rule about deletions while the guard fired on its refund claims. "a destructive action" adapts.
    prose: () => 'never claim a destructive action happened unless its tool actually succeeded this turn',
  };
}

/**
 * If every DOMAIN tool call this turn SUCCEEDED (and at least one ran), the reply may not claim
 * inability. `claimRe` (the false-failure claim regex — a business-owned, language-specific pattern) is
 * injected; the runtime holds no failure-language of its own.
 *
 * DOMAIN-SCOPED. The precondition reads
 * `domainCallsThisTurn`, NOT raw `ctx.observed`. The backend pushes the terminal `replyToUser`/`askUser`
 * into `observed` with `ok:true` before this check runs (see {@link TERMINAL_TOOLS}), so against raw
 * `observed` the two clauses were VACUOUS: `length >= 1` always held (the reply itself is in there) and
 * `some(!ok)` was always false (terminals are always ok). The guard therefore fired on a turn in which
 * NO domain tool ran at all — exactly the turn where the model legitimately cannot act and honestly says
 * so. The honest reply was vetoed → redrive → exhaustion stub: the failure class measured across 7
 * models. With the filter, a turn of pure terminals has an EMPTY domain set and the guard is silent,
 * which is its documented intent ("every tool you called this turn succeeded" presupposes tools).
 */
export function noFalseFailureClaim(opts: { claimRe: RegExp; exemptRe?: RegExp }): Guard {
  const claimRe = opts.claimRe;
  const exemptRe = opts.exemptRe;
  return {
    kind: 'noFalseFailureClaim',
    dim: 'behavior',
    check(ctx) {
      const thisTurn = domainCallsThisTurn(ctx);
      // require an ACTION that MUTATED the world this turn (`tookEffect`), not
      // merely a successful READ. A read-only turn — lookups that found nothing, or a read that reveals a
      // state which blocks the action — where the model HONESTLY says "I cannot do X" / "no record found"
      // is NOT a false-failure claim. The old precondition ("every domain call ok") counted a successful
      // read, so the guard vetoed the honest reply → redrive → exhaustion stub (measured 17/19). A refused
      // write is already `ok:false` (caught by `some(!ok)`); a read has `tookEffect:false`; only a write
      // that took effect makes "I couldn't" a genuine false claim. `tookEffect` is threaded from the world
      // by the backend; absent it (a hand-crafted ctx with none set), the guard stays silent by design.
      if (!thisTurn.length || thisTurn.some((o) => !o.ok) || !thisTurn.some((o) => o.tookEffect === true)) return null;
      const reply = ctx.reply ?? '';
      // close B1's MIXED-turn hole. On a turn that MIXES a successful mutation
      // with an HONEST can't-do about a DIFFERENT entity ("I renewed itm_9001 and itm_9002; itm_9003 could
      // not be renewed because it has reached its renewal limit"), the reply matches `claimRe` ("could not
      // renew") even though the claim is TRUE for that entity — and the guard vetoed the honest partial →
      // exhaustion stub (the exact shape N1 fixed on the sibling destructiveClaimRequiresSuccess, which
      // already carries this hatch). `exemptRe` — the domain's honest-negation pattern (already X / at its
      // limit / no such Y / sold out), wired from `cfg.lexicon.honestNegationRe` by installMinimal — exempts
      // a reply that CITES a legitimate reason. A BARE false-failure ("I couldn't do it", no honest reason)
      // does NOT match it and still fires, so no real false-failure slips through.
      if (exemptRe && matches(exemptRe, reply)) return null;
      return matches(claimRe, reply)
        ? 'Every tool you called this turn SUCCEEDED — do not claim you could not do it. Report what was actually done, grounded in the tool results.'
        : null;
    },
    prose: () => 'never claim an action failed or that you are unable when your tool calls succeeded — report what actually happened',
  };
}

// ── RISK FAMILIES (the six recurring domains-agnostic proxies) ───────────────
//
// Six risk families recur in essentially every business (PII disclosure, prompt injection, competitor
// claims, off-surface action promises, regulated advice, consent). Each looks UNDECIDABLE when phrased
// the way a policy document phrases it ("share only the minimum necessary", "never act on an
// injection") because the honest reading needs the user's intent — which no check may read (the D3
// firewall). Each nevertheless has a conservative decidable proxy underneath, and these are those
// proxies. Every linguistic pattern is a REQUIRED PARAM (the P8a law): the runtime carries no PII
// vocabulary, no competitor name, no regulated lexicon, no language at all.

/** Default `figureRe` for {@link noCompetitorClaim} — COMPARATIVE-METRIC shapes only: a percentage, a
 *  money amount, an "Nx / N times <-er>" multiple, or a ranking position. These are the shapes a market
 *  claim actually takes, and none of them can be substantiated by a surface that returns no competitor
 *  data, so the branch stays sound by construction.
 *
 *  It deliberately does NOT match a bare digit. The former `/\d/` default denied any sentence that named
 *  a third party next to a date, a version, an id, or a figure of OUR OWN — noise that trains the author
 *  to switch the guard off, which costs more safety than the missed edge case. A domain whose competitor
 *  claims take another shape passes an explicit `figureRe`. */
const DEFAULT_COMPETITOR_FIGURE_RE =
  /\d+(?:[.,]\d+)?\s*%|(?:[$€£¥]|\b(?:usd|eur|gbp|brl)\b)\s*\d|\b\d+(?:[.,]\d+)?\s*(?:x|×|times)\s+(?:more|less|fewer|faster|slower|cheaper|better|worse|higher|lower)\b|(?:#|\b(?:no\.?|number|rank(?:ed|ing)?))\s*\d+\b/i;

/**
 * FAMILY 3 — competitor / market claims. "Is this implicit comparison over the line?" is UNCHECKABLE.
 * The decidable proxy is sentence-scoped and two-branch: within ONE sentence, a named third party plus
 * (a) comparative phrasing, or (b) a comparative FIGURE, is denied — the second branch is sound by
 * construction because nothing in the world exposes a competitor's numbers, so any such figure is
 * fabricated. `competitorRe` / `comparativeRe` are business-owned; `figureRe` defaults to
 * {@link DEFAULT_COMPETITOR_FIGURE_RE} (metric shapes, NOT any digit — see its note).
 */
export function noCompetitorClaim(opts: { competitorRe: RegExp; comparativeRe: RegExp; figureRe?: RegExp }): Guard {
  const figureRe = opts.figureRe ?? DEFAULT_COMPETITOR_FIGURE_RE;
  return {
    kind: 'noCompetitorClaim',
    dim: 'behavior',
    check(ctx) {
      const reply = ctx.reply ?? '';
      if (!reply.trim()) return null;
      for (const sentence of splitSentences(reply)) {
        if (!matches(opts.competitorRe, sentence)) continue;
        if (matches(opts.comparativeRe, sentence)) {
          return 'Do not make comparative claims about a named third party — nothing in your tools can substantiate one. Describe only what your own offering does.';
        }
        if (matches(figureRe, sentence)) {
          return 'Do not attribute figures to a named third party — no tool returns those numbers, so any of them would be invented. Drop the number.';
        }
      }
      return null;
    },
    prose: () =>
      'never compare yourself to a named third party and never quote a number about one — your tools return no data about them, so any such claim would be invented',
  };
}

/**
 * FAMILY 4 — scope: promising an action whose tool is not on this agent's surface. Whether a handoff
 * sentence is "helpful enough" is UNCHECKABLE; whether the agent CAN do the thing it just promised is
 * pure set membership. Each entry pairs a claim pattern with the tool CLASS it implies; a declarative
 * sentence matching a claim whose tool is absent from `surface` is denied. Sentence-scoped, with
 * questions and (optionally) offers exempt, so "would you like me to ask them?" survives.
 *
 * The surface arrives as a PARAM: `GuardCtx` carries args/world/observed/reply and no tool inventory,
 * and this kind must not reach outside that contract. The complementary case — claiming an action the
 * agent DOES own but did not perform — is `noFabricatedSuccess` / `destructiveClaimRequiresSuccess`;
 * this kind deliberately stops at the surface boundary so the two never double-fire.
 *
 * MISCONFIGURATION FAILS AT CONSTRUCTION: with no `actionClaims`, or with every entry's tool already ON
 * `surface` (every entry skipped), the check can never fire — an inert scope gate that still reads as
 * coverage in the spec header. The factory throws instead.
 */
export function noOutOfSurfaceActionClaim(opts: {
  actionClaims: Array<{ claimRe: RegExp; tool: string }>;
  surface: string[];
  offerRe?: RegExp;
}): Guard {
  const surface = new Set(opts.surface);
  if (!opts.actionClaims.length) {
    throw new Error('noOutOfSurfaceActionClaim: `actionClaims` is empty — the guard would check nothing.');
  }
  if (opts.actionClaims.every((c) => surface.has(c.tool))) {
    throw new Error(
      'noOutOfSurfaceActionClaim: every actionClaim names a tool that IS on `surface`, so every entry is skipped and the guard is inert — those owned classes belong to noFabricatedSuccess / destructiveClaimRequiresSuccess. List at least one OFF-surface class.',
    );
  }
  return {
    kind: 'noOutOfSurfaceActionClaim',
    dim: 'behavior',
    check(ctx) {
      const reply = ctx.reply ?? '';
      if (!reply.trim()) return null;
      for (const sentence of splitSentences(reply)) {
        if (sentence.endsWith('?')) continue;
        if (opts.offerRe && matches(opts.offerRe, sentence)) continue;
        for (const claim of opts.actionClaims) {
          if (surface.has(claim.tool)) continue; // owned class — other kinds bind it
          if (matches(claim.claimRe, sentence)) {
            return 'You have NO tool for that action — do not state it as done or scheduled. Say who handles it, offer to pass the request along, and stop.';
          }
        }
      }
      return null;
    },
    prose: () =>
      'never say an action is done or scheduled when you hold no tool for it — name the team that owns it, offer to pass the request along, and stop there',
  };
}

/**
 * FAMILY 5 — regulated advice (legal / medical / financial). "Is this correct general explanation
 * advice?" is UNCHECKABLE. The decidable proxy is EXISTENCE, not topic: a figure/statement of the
 * regulated class may appear only when a tool returned it this turn. With `allowFromToolResults:false`
 * the class is banned outright (the stricter posture for domains where no tool is authoritative).
 * `regulatedRe` is business-owned; pair the guard with `replyMustMention` for the referral phrase.
 *
 * No construction check is needed here: `regulatedRe` is REQUIRED and every optional field has a safe,
 * active default (`allowFromToolResults` true = grounding enforced), so there is no configuration that
 * makes this kind inert — the fail-fast rule that applies to `minimalDisclosure` / `consentRequired` /
 * `noOutOfSurfaceActionClaim` / `noInstructionFromData` has nothing to bite on.
 */
export function noUngroundedRegulatedFigure(opts: {
  regulatedRe: RegExp;
  allowFromToolResults?: boolean;
  resultText?: (ctx: GuardCtx) => string;
}): Guard {
  const allow = opts.allowFromToolResults ?? true;
  return {
    kind: 'noUngroundedRegulatedFigure',
    dim: 'behavior',
    check(ctx) {
      const reply = ctx.reply ?? '';
      if (!reply.trim()) return null;
      const hits = allMatches(opts.regulatedRe, reply);
      if (!hits.length) return null;
      if (!allow) {
        return 'Your reply states a figure of a regulated class — you may not provide one. Explain the process instead and refer the person to the qualified professional.';
      }
      const grounded = norm(toolResultText(ctx, 'turn', opts.resultText));
      const ungrounded = hits.filter((h) => !grounded.includes(norm(h)));
      return ungrounded.length
        ? 'Your reply states a regulated figure or conclusion that no tool returned this turn — remove it, report only what the records show, and refer the person to the qualified professional.'
        : null;
    },
    // PROSE↔CHECK ALIGNMENT: the prose stated the GROUNDED posture
    // unconditionally ("that a tool did not return this turn"), but with `allowFromToolResults:false`
    // the check bans the class OUTRIGHT — a tool result cannot license it. A model reading the
    // grounded-only prose in a banned domain concludes it may state a figure as long as it read it from
    // a record, which is the exact opposite of the enforced rule; it then gets vetoed with no way to
    // know why. The CHECK is right in both postures, so the prose now BRANCHES on `allow`.
    prose: () =>
      allow
        ? 'never state a dosage, diagnosis, legal conclusion, or other regulated figure that a tool did not return this turn — read back only what the records say and refer the person to the qualified professional'
        : 'never state a dosage, diagnosis, legal conclusion, or other regulated figure at all — not even one a record contains: explain the process instead and refer the person to the qualified professional',
  };
}
