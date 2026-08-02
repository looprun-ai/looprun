/**
 * CONFIRMATION guards — the ask-before-you-act family: the confirm gate itself, the same-turn
 * ask-then-act deny, the one-destructive-action-per-turn throttle, and the pending-probe relay.
 */
import type { Guard, ObservedCall } from '../rules.js';
import { canonArgs } from './flow.js';

/**
 * A destructive tool needs the user's go-ahead before it runs — via one of two MECHANISMS (the
 * `mechanism` option, default `'arg'`):
 *  - `'arg'`: the tool carries a confirm FLAG (`argFlag`, default `confirmed`). `confirmed:true` is legal
 *    ONLY when a `confirmed:false`/absent PROBE of the SAME tool ran OK in an EARLIER turn — never confirm
 *    your own same-turn probe, never skip it.
 *  - `'prior-ask'`: the tool has NO confirm flag (e.g. a zero-arg action). It is legal ONLY when an
 *    `askUser` succeeded in an EARLIER turn — the model must ASK, wait for the user's answer, and act only
 *    in a LATER turn. A same-turn `askUser` does NOT unlock it (that is `noActAfterAskSameTurn`'s edge —
 *    the two compose: prior-ask = cross-turn REQUIRE, noActAfterAskSameTurn = same-turn DENY).
 * Reads observed / args only — never the user text (magnet-safe). Auto-installed by `AgentSpecBase` per
 * destructive tool according to `cfg.confirmMechanism`.
 */
export function confirmFirst(opts?: string | { argFlag?: string; mechanism?: 'arg' | 'prior-ask' }): Guard {
  // The string overload sets `argFlag`, NOT `mechanism` — and `confirmFirst('prior-ask')` is the
  // plausible slip (it is literally the mechanism's name). It used to build argFlag:'prior-ask' +
  // mechanism:'arg', a guard that can never fire: no tool carries an arg called `prior-ask`, so
  // `ctx.args['prior-ask'] !== true` short-circuits to `null` on every call — a destructive tool left
  // UNGATED while the spec header reads as confirmed-covered. Rejected at construction — the same
  // fail-fast posture the risk-family kinds already take against
  // inert configuration.
  //
  // WHY REJECT RATHER THAN RETIRE THE OVERLOAD: the string form is the shipping call shape across every
  // generated bundle (`confirmFirst('confirmed')`) and is mirrored into looprun; retiring it is a
  // breaking change to specs that are byte-certified. A targeted throw on the two mechanism NAMES costs
  // nothing legitimate — an arg genuinely named `arg`/`prior-ask` is not a thing — and turns a silent
  // no-op into a build failure.
  if (typeof opts === 'string' && (opts === 'prior-ask' || opts === 'arg')) {
    throw new Error(
      `confirmFirst('${opts}'): the STRING overload sets the confirm ARG FLAG, not the mechanism — this would build argFlag:'${opts}' with mechanism:'arg', a guard that can never fire (no tool has an argument named '${opts}'). Pass the object form: confirmFirst({ mechanism: '${opts}' }).`,
    );
  }
  const o = typeof opts === 'string' ? { argFlag: opts } : (opts ?? {});
  const argFlag = o.argFlag ?? 'confirmed';
  const mechanism = o.mechanism ?? 'arg';
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      if (mechanism === 'prior-ask') {
        // The unlock is an earlier-turn SURFACING of the action to the user, in one of three shapes —
        // and every shape is SUCCESS-KEYED (`obs.ok`), the same discipline `noInstructionFromData`
        // documents on both of its arms.
        //
        // SUCCESS-KEYING: the same-tool disjunct accepts only a SUCCESSFUL earlier attempt. Vetoed
        // attempts land in observed with `ok:false`; accepting those would let a turn-1 call denied BY
        // THIS VERY GUARD unlock the identical turn-2 call, and the destructive
        // action ran without the user ever being asked. The guard defeated itself in exactly two turns.
        // This is the hole already closed in the sibling `noInstructionFromData` ("counting it would let
        // a first poisoned attempt unlock the second"); the two now read the same.
        //
        // The unlock is STRUCTURAL: a prior-turn OK call of the SAME tool (the probe) or a prior-turn OK
        // `askUser` (the explicit question terminal). The former replyToUser-text disjunct — a prior
        // reply whose TEXT matched an injected confirm-question regex — is retired with the no-regex law
        // (2026-08-02): a model that relays confirmation through prose instead of `askUser` is judged by
        // an `llmCheck` rubric, not by a closure-held pattern here.
        const probedEarlier = ctx.observed.some(
          (obs) =>
            obs.turnIndex < ctx.turnIndex &&
            obs.ok &&
            (obs.name === ctx.tool || obs.name === 'askUser'),
        );
        return probedEarlier
          ? null
          : `Do NOT run ${ctx.tool} yet — first ask the user to confirm and STOP; run it only in a LATER turn after they agree.`;
      }
      if (ctx.args[argFlag] !== true) return null;
      const probe = ctx.observed.find(
        (obs) => obs.name === ctx.tool && obs.ok && obs.args?.[argFlag] !== true && obs.turnIndex < ctx.turnIndex,
      );
      // accept a prior-turn `askUser` as the probe surface too (structural) — measured: the
      // tool-probe-only form dead-locked legitimate later-turn confirmations. The former replyToUser-text
      // disjunct is retired with the no-regex law (2026-08-02): prose relay is `llmCheck`'s job, not a
      // closure-held pattern. Same-turn confirmed:true stays vetoed (every disjunct requires
      // turnIndex < current).
      const askProbe =
        !probe &&
        ctx.observed.some((obs) => obs.turnIndex < ctx.turnIndex && obs.name === 'askUser' && obs.ok);
      return probe || askProbe
        ? null
        : `Do NOT pass ${argFlag}:true — first call ${ctx.tool} WITHOUT it, relay the confirmation question to the user, and only confirm in a LATER turn after the user agrees.`;
    },
    prose: () =>
      mechanism === 'prior-ask'
        ? 'this destructive action requires asking the user to confirm first and running it only in a LATER turn after they agree — never on the opening turn or in the same turn as the question'
        : `destructive actions need ${argFlag}:false first + the USER's explicit confirmation in a later turn`,
  };
}

/** Deny `tools` when an `askUser` call already succeeded THIS turn — ask, wait, act only in a LATER
 *  turn; a model must never confirm-and-execute in the same turn as its own question (a multi-tool
 *  step can call askUser and a destructive tool back-to-back, which reads as "asked" to a human but
 *  never gave the user a chance to answer). Reads observed/turnIndex only; magnet-safe. */
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
 */
export function destructiveThrottle(destructiveTools: string[], opts?: { confirmArg?: string }): Guard {
  const set = new Set(destructiveTools);
  const confirmArg = opts?.confirmArg ?? 'confirmed';
  const isProbe = (o: ObservedCall): boolean =>
    o.resultFlags?.requiresConfirmation === true || o.args?.[confirmArg] === false;
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
      const prior = candidates.find(
        (o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name) && !isProbe(o),
      );
      return prior
        ? `A destructive action (${prior.name}) already ran this turn — do NOT chain another destructive call. Reply to the user first.`
        : null;
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
