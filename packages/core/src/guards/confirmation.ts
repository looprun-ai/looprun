/**
 * CONFIRMATION guards — the ask-before-you-act family: the confirm gate itself, the same-turn
 * ask-then-act deny, the one-destructive-action-per-turn throttle, and the pending-probe relay.
 */
import type { Guard, ObservedCall } from '../rules.js';
import { canonArgs, countOkCalls } from './flow.js';

/**
 * A destructive tool needs the user's go-ahead before it runs — the ONE confirm-gate kind (it absorbed the
 * former structural `confirmedNeedsEarlierProbe`). What LICENSES the confirmed act is the `via` option:
 *  - `'probe'`: a `flag:false`/absent PROBE of the SAME tool that ran OK in an EARLIER turn AND matched
 *    this call's RECORD (its args, minus the confirm `flag`, are a subset of this call's) — the preview was
 *    of the SAME act, not a different one. This is the strict, record-bound license.
 *  - `'ask'`: a flag-LESS action (e.g. a zero-arg tool). It is legal ONLY when an `askUser` succeeded in an
 *    EARLIER turn — the model must ASK, wait for the user's answer, and act only in a LATER turn. Every call
 *    is gated (there is no confirm flag to key on). A same-turn `askUser` does NOT unlock it (that is
 *    `noActAfterAskSameTurn`'s edge — the two compose: `via:'ask'` = cross-turn REQUIRE,
 *    `noActAfterAskSameTurn` = same-turn DENY).
 *  - `'either'` (DEFAULT): the flag-gated form — `flag:true` is licensed by a matching earlier-turn probe OR
 *    an earlier-turn `askUser`. This is what the string overload and `AgentSpecBase`'s arg-flag tools install.
 *
 * RECENCY LAW (2026-08-02): a license is a LICENSING signal — a past event that UNLOCKS a new act — so it is
 * turn-bounded by `within` (default **1**, the immediately-preceding turn / the natural two-step shape):
 * the licensing event must satisfy `1 ≤ currentTurnIndex − eventTurnIndex ≤ within`. A probe 20 turns ago
 * must never license today's confirm; widen deliberately with `within` when the flow genuinely spans turns.
 *
 * Keys on observed / args only (a structural signal, not reply text) — so it stays model-independent.
 * Auto-installed by `AgentSpecBase` per destructive tool according to `cfg.confirmMechanism`.
 */
export function confirmFirst(
  opts?: string | { flag?: string; via?: 'probe' | 'ask' | 'either'; within?: number },
): Guard {
  // The string overload sets the confirm `flag`, NOT `via` — and `confirmFirst('probe'|'ask'|'either')` is
  // the plausible slip (it is literally a `via` value). It would build flag:'ask' (etc.) with via:'either',
  // a guard that can never fire in the flag-gated arm: no tool carries an arg called `ask`, so
  // `ctx.args['ask'] !== true` short-circuits to `null` on every call — a destructive tool left UNGATED
  // while the spec header reads as confirmed-covered. Rejected at construction (same fail-fast posture the
  // risk-family kinds take against inert configuration); the legitimate call is the object form.
  if (typeof opts === 'string' && (opts === 'probe' || opts === 'ask' || opts === 'either')) {
    throw new Error(
      `confirmFirst('${opts}'): the STRING overload sets the confirm FLAG, not \`via\` — this would build flag:'${opts}' with via:'either', a guard that can never fire (no tool has an argument named '${opts}'). Pass the object form: confirmFirst({ via: '${opts}' }).`,
    );
  }
  const o = typeof opts === 'string' ? { flag: opts } : (opts ?? {});
  const flag = o.flag ?? 'confirmed';
  const via = o.via ?? 'either';
  const within = o.within ?? 1;
  // RECENCY LAW: an earlier-turn event licenses only within `within` turns of the current turn.
  const recent = (obs: ObservedCall, cur: number): boolean =>
    cur - obs.turnIndex >= 1 && cur - obs.turnIndex <= within;
  const askedRecently = (ctx: { observed: ObservedCall[]; turnIndex: number }): boolean =>
    ctx.observed.some((obs) => obs.name === 'askUser' && obs.ok && recent(obs, ctx.turnIndex));
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      if (via === 'ask') {
        // Flag-less action: every call is gated on the action having been SURFACED to the user in an
        // earlier turn within recency — either a `askUser` OR a prior SUCCESSFUL call of the tool itself
        // (a flag-less tool has no probe shape, so its own prior OK run is the equivalent surfacing).
        // SUCCESS-KEYING (`obs.ok`) is deliberate — a vetoed turn-1 attempt (ok:false) must never unlock
        // the identical turn-2 call, or the guard defeats itself in exactly two turns.
        const surfacedRecently = ctx.observed.some(
          (obs) => obs.ok && (obs.name === 'askUser' || obs.name === ctx.tool) && recent(obs, ctx.turnIndex),
        );
        if (surfacedRecently) return null;
        const askedSameTurn = ctx.observed.some(
          (obs) => obs.name === 'askUser' && obs.ok && obs.turnIndex === ctx.turnIndex,
        );
        return askedSameTurn
          ? `You asked the user a question this turn — wait for their answer; run ${ctx.tool} only in a LATER turn.`
          : `Do NOT run ${ctx.tool} yet — first ask the user to confirm and STOP; run it only in a LATER turn after they agree.`;
      }
      // Flag-gated arms (`'probe'` / `'either'`): a probe (flag≠true) passes freely; only `flag:true` is gated.
      if (ctx.args[flag] !== true) return null;
      // A matching probe: the SAME tool, ran OK, carried flag≠true, and its non-`flag` args are a subset of
      // this call's (same RECORD) — the preview was of THIS act. (Absorbed from confirmedNeedsEarlierProbe.)
      const isMatchingProbe = (obs: ObservedCall): boolean =>
        obs.name === ctx.tool &&
        obs.ok &&
        obs.args?.[flag] !== true &&
        Object.keys(obs.args ?? {})
          .filter((k) => k !== flag)
          .every((k) => obs.args![k] === ctx.args[k]);
      const probeLicensed = ctx.observed.some((obs) => isMatchingProbe(obs) && recent(obs, ctx.turnIndex));
      // `'either'` also accepts a prior-turn `askUser` as the confirm surface (structural) — measured: the
      // probe-only form dead-locked legitimate later-turn confirmations relayed through a question.
      const askLicensed = via === 'either' && askedRecently(ctx);
      if (probeLicensed || askLicensed) return null;
      // Unlicensed — refine the message. A same-turn matching probe is the "you confirmed your own
      // same-turn preview" edge (the go-ahead must arrive in a LATER message).
      const sameTurnProbe = ctx.observed.some(
        (obs) => isMatchingProbe(obs) && obs.turnIndex === ctx.turnIndex,
      );
      return sameTurnProbe
        ? `You previewed and confirmed ${ctx.tool} in the SAME turn — the go-ahead must arrive in a LATER message; confirm only after the user has seen the preview and replied.`
        : `Do NOT pass ${flag}:true — first call ${ctx.tool} WITHOUT it, relay the confirmation question to the user, and only confirm in a LATER turn after the user agrees.`;
    },
    prose: () =>
      via === 'ask'
        ? 'this destructive action requires asking the user to confirm first and running it only in a LATER turn after they agree — never on the opening turn or in the same turn as the question'
        : `destructive actions need ${flag}:false first + the USER's explicit confirmation in a later turn`,
  };
}

/** Deny `tools` when an `askUser` call already succeeded THIS turn — ask, wait, act only in a LATER
 *  turn; a model must never confirm-and-execute in the same turn as its own question (a multi-tool
 *  step can call askUser and a destructive tool back-to-back, which reads as "asked" to a human but
 *  never gave the user a chance to answer). Keys on observed/turnIndex only — a structural signal. */
export function noActAfterAskSameTurn(tools: string[]): Guard {
  const set = new Set(tools);
  return {
    kind: 'noActAfterAskSameTurn',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      const askedThisTurn = ctx.observed.some(
        (o) => o.name === 'askUser' && o.ok && o.turnIndex === ctx.turnIndex,
      );
      return askedThisTurn
        ? 'You already asked the user a question this turn — wait for their answer; do not execute this action in the same turn as the question.'
        : null;
    },
    // PROSE — no RAW TERMINAL NAME. It used to read "in the same turn as an
    // askUser question": `askUser` is a runtime-owned terminal, an internal name in a sentence the model
    // reads as behavioural instruction. The rule is about the ACT of asking, which the model can follow
    // whatever the channel is called, so the prose now states the act.
    prose: () =>
      `never call ${tools.join(', ')} in the same turn in which you ask the user a question — wait for their answer and act only in a LATER turn`,
  };
}

/**
 * At most ONE destructive action that TOOK EFFECT per turn.
 *
 * PROBES DO NOT COUNT. A two-step destructive tool is called twice in the
 * legal same-turn tail of an approved flow: first the PROBE (no confirm flag / `confirmed:false`), which
 * returns `requiresConfirmation` and lands in `observed` with **`ok:true`** — it succeeded at asking,
 * it just did not delete anything — then the approved `confirmed:true` execute. Counting the probe made
 * this throttle deny that second call, which in turn made `pendingConfirmMustAsk`'s explicitly-documented
 * "probe→approved-execute in the SAME turn" exemption DEAD CODE: the flow it exempts could never occur.
 * The two kinds now agree on what "already acted" means.
 *
 * A prior call is a PROBE (not an effect) when it returned `requiresConfirmation`, or when it carries
 * `confirmArg:false` explicitly. Everything else that ran OK is an effect. `confirmArg` (default
 * `confirmed`) matches the sibling kinds' parameterisation (`confirmFirst`'s `argFlag`,
 * `pendingConfirmMustAsk`'s `confirmArg`) — a flag-less `'prior-ask'` tool has no probe shape of its own,
 * so every OK call of it counts as an effect, exactly as before.
 *
 * BUILT ON `maxCalls`' COUNTING MACHINERY (2026-08-02): this is `maxCalls` with `n:1`, `scope:'turn'`, a
 * tool-SET match (minus probes), and the same-step sibling candidates folded in — it shares
 * `countOkCalls`, the one place that decides what an "already-succeeded" call is. No API or behaviour
 * change; the existing throttle proofs pass unchanged (that IS the acceptance).
 */
export function destructiveThrottle(destructiveTools: string[], opts?: { confirmArg?: string }): Guard {
  const set = new Set(destructiveTools);
  const confirmArg = opts?.confirmArg ?? 'confirmed';
  const isProbe = (o: ObservedCall): boolean =>
    o.resultFlags?.requiresConfirmation === true || o.args?.[confirmArg] === false;
  // An EFFECT = a listed destructive tool that ran OK and is not a probe. (The `ok` + turn-window part is
  // applied by `countOkCalls`; this predicate carries only the set-membership + not-a-probe test.)
  const isEffect = (o: ObservedCall): boolean => set.has(o.name) && !isProbe(o);
  return {
    kind: 'destructiveThrottle',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      // `observed` catches a prior EFFECT from an EARLIER step; `siblingCallsThisStep` catches a
      // destructive sibling emitted earlier in the SAME step that the backend admitted but has not yet
      // pushed to `observed` (a same-step concurrency gap — two `Promise.all`-dispatched calls are both
      // gated before either lands). A sibling admitted by its preTool guards WILL take effect, so it
      // counts exactly like an observed effect. Probes (confirmed:false) are excluded by `isProbe`.
      const candidates = ctx.siblingCallsThisStep ? [...ctx.observed, ...ctx.siblingCallsThisStep] : ctx.observed;
      // The `maxCalls` core: at most ONE prior effect this turn (n:1, scope:'turn').
      if (countOkCalls(candidates, isEffect, { scope: 'turn', turnIndex: ctx.turnIndex }) < 1) return null;
      // Name the prior effect for the deny (the counter returns a tally, not the call).
      const prior = candidates.find((o) => o.turnIndex === ctx.turnIndex && o.ok && isEffect(o))!;
      return `A destructive action (${prior.name}) already ran this turn — do NOT chain another destructive call. Reply to the user first.`;
    },
    prose: () => 'at most one destructive action per turn (a confirmation probe that changed nothing does not count)',
  };
}

/**
 * A destructive PROBE returned requiresConfirmation this turn — the turn MUST relay the question via an
 * `askUser` call, UNLESS that pending confirmation was already RESOLVED this turn: the SAME tool ran OK
 * with the confirm flag set on the SAME record (its args minus the confirm flag) later in the turn — a
 * legal probe→approved-execute tail of a two-step flow, where the reply correctly reports the DONE action
 * instead of re-asking. Keys only the UNRESOLVED probes: if every requiresConfirmation was resolved, the
 * guard is silent.
 *
 * STRUCTURAL RELAY (no-regex law, 2026-08-02): the relay is satisfied by an `askUser` call succeeding this
 * turn — the question terminal — NOT by regex-matching the reply text. The former `askRe` param (a
 * business-owned "does this reply seek confirmation?" pattern) is retired; a domain that relays
 * confirmation through prose instead of `askUser` judges that with an `llmCheck` rubric. `confirmArg`
 * (default `confirmed`) is the confirm flag a resolving call carries. Reads observed only.
 */
export function pendingConfirmMustAsk(opts?: { confirmArg?: string }): Guard {
  const confirmArg = opts?.confirmArg ?? 'confirmed';
  // The "record" a call acts on = its canonical args with the confirm flag stripped (a probe and its
  // approved re-run differ ONLY in that flag, so matching the rest pins them to the same record).
  const record = (args: Record<string, unknown> | undefined): string => {
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args ?? {})) if (k !== confirmArg) rest[k] = v;
    return canonArgs(rest);
  };
  return {
    kind: 'pendingConfirmMustAsk',
    dim: 'behavior',
    check(ctx) {
      const thisTurn = ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex);
      const unresolved = thisTurn
        .filter((o) => o.resultFlags?.requiresConfirmation)
        .filter((probe) => !thisTurn.some(
          (o) => o.name === probe.name && o.ok && o.args?.[confirmArg] === true && record(o.args) === record(probe.args),
        ));
      if (!unresolved.length) return null;
      // STRUCTURAL relay: an `askUser` succeeded this turn ⇒ the question was put to the user.
      const askedThisTurn = thisTurn.some((o) => o.name === 'askUser' && o.ok);
      return askedThisTurn
        ? null
        : 'A confirmation is PENDING — relay the confirmation question to the user with askUser, and do not summarize the action as done.';
    },
    prose: () => 'when a tool asks for confirmation, ask the user to confirm before anything else',
  };
}
