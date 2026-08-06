/**
 * CONFIRMATION guards — the consent family: the gate that reads the user's typed confirmation, and the
 * one-destructive-action-per-turn throttle that caps a turn which HAS been confirmed.
 */
import type { Guard, ObservedCall } from '../rules.js';
import { countOkCalls } from './flow.js';
import { challengeMatchesCall } from '../runtime/challenge.js';

/**
 * A destructive tool ACTS only on a turn whose incoming message carried the engine's consent token for
 * THIS record.
 *
 * ```
 *   open question    To confirm itm-1, reply: CONFIRM ITM-1
 *
 *   user types  "yes, CONFIRM itm-1"   → deleteItem({id:'itm-1',confirmed:true}) runs
 *   user types  "go ahead"             → denied, and the question is put back on the screen
 *   user types  "delete itm-12"        → denied; itm-12 is not itm-1
 * ```
 *
 * WHAT LICENSES is a PURE READ of `ctx.consent` — the challenges the runtime already matched against the
 * user's own words. The guard reads no text, keeps no state, and accepts no declaration: the agent has no
 * channel through which to produce a consent, because a consent is a literal only the engine issued and
 * only the user can type.
 *
 * WHAT IS GATED is decided by `flag`, and that is the whole of the configuration. A two-step tool
 * distinguishes its PREVIEW from its ACT by an argument, and the preview must run — it is how the world
 * raises the question in the first place:
 *
 * ```
 *   deleteItem({id:'itm-1'})                   preview → the world answers "I need confirmation on itm-1"
 *                                                      → the engine raises the question
 *   deleteItem({id:'itm-1', confirmed:true})   act     → gated on the token
 * ```
 *
 * `flag: false` is the one-step shape: the tool has no preview form, so EVERY call acts and every call is
 * gated. There the DENIAL is what raises the question, from the label the spec declared — attempting the
 * act is what asks permission for it, and an agent that never attempts never acts.
 *
 * `when` answers a SECOND question, on a second axis: WHICH CALLS of this tool are destructive at all.
 * It is a pure predicate over the acting call's own arguments, keyed by tool:
 *
 * ```
 *   placeHold({scope:'asset'})       when → false  → the world executes it; nothing is gated
 *   placeHold({scope:'workspace'})   when → true   → gated on the token, exactly as any destructive call
 * ```
 *
 * It licenses nothing. `ctx.consent` remains the only thing that allows an act.
 */
export function confirmFirst(opts?: {
  flag?: string | false;
  when?: Record<string, (args: Record<string, unknown>) => boolean>;
}): Guard {
  const flag = opts?.flag === undefined ? 'confirmed' : opts.flag;
  const when = opts?.when;
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      const tool = ctx.tool;
      if (!tool) return null;
      // WHEN a call is destructive is a pure question about its own arguments, and it is asked FIRST:
      // the protective branch of a listed tool is an act the world carries out with no question raised,
      // so a gate on it denies a call no consent can ever license. A tool with no entry here is
      // destructive on every call, which is what a bare list means.
      if (when?.[tool] && !when[tool](ctx.args)) return null;
      // A preview changes nothing and is how the question gets asked; only the acting call is gated.
      if (flag !== false && ctx.args[flag] !== true) return null;
      const licensed = (ctx.consent ?? []).some((c) => challengeMatchesCall(c, tool, ctx.args));
      return licensed
        ? null
        : 'The user has not confirmed this action. Do not run it — reply to them, and run it only after ' +
            'their next message carries the confirmation they were asked for.';
    },
    prose: () =>
      'a destructive action runs only after the user has typed back the confirmation they were shown — ' +
      'never on the strength of anything you say or declare',
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
 * EFFECT BEATS FLAGS: a call that `tookEffect` is an EFFECT, whatever flags it carries. Keying the probe
 * test on `confirmed:false` / `requiresConfirmation` without consulting `tookEffect` would let a tool that
 * mutates while carrying `confirmed:false` (it ignores or omits the flag's semantics) produce two real
 * destructive effects that BOTH classify as probes — the throttle would count zero prior effects and the
 * second call would slip the n:1 cap. The flags describe an INTENT to preview; `tookEffect` is the world's
 * own record of what happened, so it is the authority.
 *
 * WHAT COUNTS AS A PROBE DEPENDS ON WHETHER THE CALL HAS RUN — because that decides what evidence can
 * exist at all:
 *   · an EXECUTED call (in `observed`) is a probe when the world RECORDED that it changed nothing
 *     (`tookEffect === false`) AND its flags declare a preview. A call that ran and left NO record is
 *     unverifiable and counts (see below).
 *   · a same-step SIBLING (`siblingCallsThisStep`) has been admitted but has NOT run, so `tookEffect` is
 *     `undefined` by construction and its declared flags are the only evidence there is.
 * `confirmArg` (default `confirmed`) matches the sibling kinds' parameterisation (`confirmFirst`'s
 * `argFlag`, `pendingConfirmMustAsk`'s `confirmArg`). `flagless` names the destructive tools that run the
 * `'prior-ask'` mechanism instead: they carry no confirm flag at all, so they have no preview shape of
 * their own and EVERY call of them counts as an effect. `AgentSpecBase` passes the mechanism split it
 * already computes; a hand-installed throttle that omits `flagless` treats every listed tool as
 * flag-gated.
 *
 * BUILT ON `maxCalls`' COUNTING MACHINERY (2026-08-02): this is `maxCalls` with `n:1`, `scope:'turn'`, a
 * tool-SET match (minus probes), and the same-step sibling candidates folded in — it shares
 * `countOkCalls`, the one place that decides what an "already-succeeded" call is. No API or behaviour
 * change; the existing throttle proofs pass unchanged (that IS the acceptance).
 */
export function destructiveThrottle(
  destructiveTools: string[],
  opts?: {
    confirmArg?: string;
    flagless?: readonly string[];
    when?: Record<string, (args: Record<string, unknown>) => boolean>;
  },
): Guard {
  const set = new Set(destructiveTools);
  const confirmArg = opts?.confirmArg ?? 'confirmed';
  const when = opts?.when;
  // The blast radius is measured in DESTRUCTIVE acts. A call the predicate declines is one the world
  // carries out freely, so it neither consumes the turn's single act nor is stopped by one: three
  // protective holds in a turn are three legitimate calls, and the cap still stops the second freeze.
  const isDestructive = (name: string, args: Record<string, unknown> | undefined): boolean =>
    !when?.[name] || when[name](args ?? {});
  // The `'prior-ask'` tools: no confirm flag exists on them, so nothing they can put in their args
  // declares a preview and every call is an act.
  const flagless = new Set(opts?.flagless ?? []);
  // The caller's DECLARED intent to preview. A flag is not evidence of what happened — it is what the
  // model said it was about to do.
  const flagsDeclarePreview = (o: ObservedCall): boolean =>
    o.resultFlags?.requiresConfirmation === true || o.args?.[confirmArg] === false;
  // An EXECUTED call is a probe only when the world POSITIVELY recorded that it changed nothing.
  //
  // UNKNOWN EFFECT IS NOT A PROBE. Reading `tookEffect !== true` would treat "the world has no record of
  // this call" exactly like "the world says it changed nothing" — and in native-tools/MCP mode NOTHING
  // writes the world ledger, so every call would read as not-effected and the EFFECT-BEATS-FLAGS rule
  // above would be permanently INERT: a third-party tool that mutates while carrying `confirmed:false`
  // would classify as a probe and slip the n:1 cap. A call that RAN and left no record of its effect is
  // unverifiable, so it counts.
  const executedIsProbe = (o: ObservedCall): boolean => o.tookEffect === false && flagsDeclarePreview(o);
  // A same-step SIBLING has been admitted but has NOT executed, so it has no world record BY
  // CONSTRUCTION — `tookEffect` is `undefined` for every one of them, always. Applying the executed rule
  // here would count every admitted destructive sibling, which denies a legitimate MULTI-PREVIEW: an
  // agent asked to preview cancelling two bookings emits two `cancel({confirmed:false})` in ONE step,
  // and the second would be vetoed for an effect neither call has had yet. For a call
  // that has not run, its declared flags are the only evidence that exists, so they decide.
  //
  // NOT-CONFIRMED IS THE PREVIEW SHAPE, exactly as `confirmFirst` reads it. Keying the sibling test on
  // `confirmed === false` alone would miss a preview that simply OMITS the flag — the shape
  // `confirmFirst`'s `'probe'` variant explicitly licenses ("a `flag:false`/absent PROBE") and the shape it
  // lets through untouched (it returns null on `args[flag] !== true`). The two kinds must agree on the
  // very case the throttle's own doc claims they agree on: a model previewing two cancellations without
  // spelling `confirmed:false` had its second preview vetoed for an effect neither call had had. A
  // sibling declares a preview when it is NOT CONFIRMED.
  //
  // RESIDUAL, stated rather than hidden: a flag-gated tool that MUTATES without `confirmed:true` and is
  // emitted N times in ONE step is not capped — the cap is per-step-effect and there is no counter here,
  // so it is UNBOUNDED N, not merely two. Nothing observable distinguishes those calls from an honest
  // multi-preview at admission time. What DOES bound the shape: the cross-step form is capped (by then
  // the first call's effect is on record), `flagless` tools are capped from the first sibling, and the
  // world's own two-step protocol never mutates on an unconfirmed call.
  const pendingIsProbe = (o: ObservedCall): boolean =>
    !flagless.has(o.name) && o.args?.[confirmArg] !== true;
  // An EFFECT = a listed destructive tool that ran OK and is not a probe. (The `ok` + turn-window part is
  // applied by `countOkCalls`; this predicate carries only the set-membership + not-a-probe test.)
  const isEffectAmong = (pending: readonly ObservedCall[]) => (o: ObservedCall): boolean =>
    set.has(o.name) && isDestructive(o.name, o.args) && !(pending.includes(o) ? pendingIsProbe(o) : executedIsProbe(o));
  return {
    kind: 'destructiveThrottle',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      if (!isDestructive(ctx.tool, ctx.args)) return null;
      // `observed` catches a prior EFFECT from an EARLIER step; `siblingCallsThisStep` catches a
      // destructive sibling emitted earlier in the SAME step that the backend admitted but has not yet
      // pushed to `observed` (a same-step concurrency gap — two `Promise.all`-dispatched calls are both
      // gated before either lands). A sibling admitted by its preTool guards WILL take effect, so it
      // counts exactly like an observed effect — unless its own args declare it a preview, which is the
      // only evidence a call that has not run can offer (see `pendingIsProbe`).
      const pending = ctx.siblingCallsThisStep ?? [];
      const candidates = ctx.siblingCallsThisStep ? [...ctx.observed, ...pending] : ctx.observed;
      const isEffect = isEffectAmong(pending);
      // The `maxCalls` core: at most ONE prior effect this turn (n:1, scope:'turn').
      if (countOkCalls(candidates, isEffect, { scope: 'turn', turnIndex: ctx.turnIndex }) < 1) return null;
      // Name the prior effect for the deny (the counter returns a tally, not the call).
      const prior = candidates.find((o) => o.turnIndex === ctx.turnIndex && o.ok && isEffect(o))!;
      return `A destructive action (${prior.name}) already ran this turn — do NOT chain another destructive call. Reply to the user first.`;
    },
    prose: () => 'at most one destructive action per turn (a confirmation probe that changed nothing does not count)',
  };
}
