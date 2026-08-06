/**
 * CONFIRMATION guards — the consent family: the gate that reads the user's typed confirmation, and the
 * one-destructive-action-per-turn throttle that caps a turn which HAS been confirmed.
 */
import type { Guard, ObservedCall } from '../rules.js';
import { countOkCalls } from './flow.js';
import { approvalMatchesCall } from '../runtime/approval-request.js';

/**
 * ONE LAW: a destructive call that is not a schema-licensed simulation runs only on a turn whose
 * incoming message carried the engine's approval code for THIS record.
 *
 * ```
 *   deleteItem({id:'itm-1', simulate:true})   simulation → the world answers "here is what would
 *                                             happen — to confirm itm-1, reply: CONFIRM ITM-1"
 *   deleteItem({id:'itm-1'})                  act        → gated on the typed code
 * ```
 *
 * WHAT LICENSES is a PURE READ of `ctx.consent` — the approvals the runtime already matched against the
 * user's own words. The guard reads no text, keeps no state, and accepts no declaration: the acting call
 * carries no protocol field, so the agent has no channel through which to produce a consent — a consent
 * is a literal only the engine issued and only the user can type.
 *
 * THE DECLARED SCHEMA LICENSES THE BYPASS, never the call's own arguments. `ctx.simulatableTools` is the
 * set of destructive tools whose injected schema carries `simulate`; a `simulate: true` on any other tool
 * is an unknown argument the executor may silently drop while acting:
 *
 * ```
 *   unsubscribeCustomer({customerId:'c-1', simulate:true})   the schema has no simulate
 *     ctx.simulatableTools lacks the tool → the call is an act → gated
 *     (an MCP server ignores the unknown argument and unsubscribes — it never gets there)
 * ```
 *
 * A tool that cannot simulate is therefore gated on EVERY call, and the DENIAL is what raises the
 * question — attempting the act is what asks permission for it, and an agent that never attempts
 * never acts.
 *
 * `when` answers a SECOND question, on a second axis: WHICH CALLS of this tool are destructive at all.
 * It is a pure predicate over the acting call's own arguments, keyed by tool:
 *
 * ```
 *   placeHold({scope:'asset'})       when → false  → the world executes it; nothing is gated
 *   placeHold({scope:'workspace'})   when → true   → gated on the code, exactly as any destructive call
 * ```
 *
 * It licenses nothing. `ctx.consent` remains the only thing that allows an act.
 */
export function confirmFirst(opts?: {
  when?: Record<string, (args: Record<string, unknown>) => boolean>;
}): Guard {
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
      // A simulation changes nothing and is how the world raises the question — but only a tool whose
      // DECLARED schema carries the parameter can be simulating. The call's own args cannot license the
      // bypass: an executor ignores an unknown argument and acts.
      if (ctx.args.simulate === true && ctx.simulatableTools?.has(tool)) return null;
      const licensed = (ctx.consent ?? []).some((c) => approvalMatchesCall(c, tool, ctx.args));
      return licensed
        ? null
        : 'The user has not confirmed this action. Do not run it — reply to them, and run it only ' +
            'after their next message carries the confirmation code they were shown.';
    },
    prose: () =>
      'a destructive action: simulate it first where the tool offers `simulate: true` — the answer ' +
      'describes the act and gives the user their confirmation code — and run the acting call only ' +
      'after their next message carries that code; never on the strength of anything you say',
  };
}

/**
 * At most ONE destructive action that TOOK EFFECT per turn.
 *
 * SIMULATIONS DO NOT COUNT. A simulatable destructive tool is called twice in the legal same-turn
 * tail of an approved flow: first the SIMULATION (`simulate: true`), which returns
 * `requiresConfirmation` and lands in `observed` with **`ok:true`** — it succeeded at asking, it
 * just did not delete anything — then the approved bare execute. Counting the simulation would deny
 * that second call and make the approved same-turn tail impossible.
 *
 * EFFECT BEATS FLAGS: a call that `tookEffect` is an EFFECT, whatever flags it carries. Keying the
 * simulation test on `simulate: true` / `requiresConfirmation` without consulting `tookEffect` would
 * let a tool that mutates while claiming `simulate: true` (it ignores or drops the argument) produce
 * two real destructive effects that BOTH classify as simulations — the throttle would count zero
 * prior effects and the second call would slip the n:1 cap. The flags describe an INTENT to
 * simulate; `tookEffect` is the world's own record of what happened, so it is the authority.
 *
 * WHAT COUNTS AS A SIMULATION DEPENDS ON WHETHER THE CALL HAS RUN — because that decides what
 * evidence can exist at all:
 *   · an EXECUTED call (in `observed`) is a simulation when the world RECORDED that it changed
 *     nothing (`tookEffect === false`) AND its flags declare one. A call that ran and left NO record
 *     is unverifiable and counts (see below).
 *   · a same-step SIBLING (`siblingCallsThisStep`) has been admitted but has NOT run, so
 *     `tookEffect` is `undefined` by construction — only its own explicit `simulate: true` declares
 *     a simulation, and a BARE sibling counts as the effect it will be. The cap therefore holds from
 *     the first sibling, while a legitimate multi-simulation (two `simulate: true` siblings in one
 *     step) passes untouched.
 *
 * BUILT ON `maxCalls`' COUNTING MACHINERY: this is `maxCalls` with `n:1`, `scope:'turn'`, a
 * tool-SET match (minus simulations), and the same-step sibling candidates folded in — it shares
 * `countOkCalls`, the one place that decides what an "already-succeeded" call is.
 */
export function destructiveThrottle(
  destructiveTools: string[],
  opts?: {
    when?: Record<string, (args: Record<string, unknown>) => boolean>;
  },
): Guard {
  const set = new Set(destructiveTools);
  const when = opts?.when;
  // The blast radius is measured in DESTRUCTIVE acts. A call the predicate declines is one the world
  // carries out freely, so it neither consumes the turn's single act nor is stopped by one: three
  // protective holds in a turn are three legitimate calls, and the cap still stops the second freeze.
  const isDestructive = (name: string, args: Record<string, unknown> | undefined): boolean =>
    !when?.[name] || when[name](args ?? {});
  // The caller's DECLARED intent to simulate. A flag is not evidence of what happened — it is what
  // the model said it was about to do.
  const flagsDeclareSimulation = (o: ObservedCall): boolean =>
    o.resultFlags?.requiresConfirmation === true || o.args?.simulate === true;
  // An EXECUTED call is a simulation only when the world POSITIVELY recorded that it changed nothing.
  //
  // UNKNOWN EFFECT IS NOT A SIMULATION. Reading `tookEffect !== true` would treat "the world has no
  // record of this call" exactly like "the world says it changed nothing" — and in native-tools/MCP
  // mode NOTHING writes the world action history, so every call would read as not-effected and the
  // EFFECT-BEATS-FLAGS rule above would be permanently INERT: a third-party tool that mutates while
  // claiming `simulate: true` would classify as a simulation and slip the n:1 cap. A call that RAN
  // and left no record of its effect is unverifiable, so it counts.
  const executedIsSimulate = (o: ObservedCall): boolean => o.tookEffect === false && flagsDeclareSimulation(o);
  // A same-step SIBLING has been admitted but has NOT executed, so it has no world record BY
  // CONSTRUCTION — `tookEffect` is `undefined` for every one of them, always. Its own explicit
  // `simulate: true` is the only evidence a call that has not run can offer: it declares the
  // side-effect-free ask, so a multi-simulation (two `simulate: true` siblings in one step) passes.
  // A BARE sibling is the act it will be and counts from the first one.
  const pendingIsSimulate = (o: ObservedCall): boolean => o.args?.simulate === true;
  // An EFFECT = a listed destructive tool that ran OK and is not a simulate. (The `ok` + turn-window part is
  // applied by `countOkCalls`; this predicate carries only the set-membership + not-a-simulate test.)
  const isEffectAmong = (pending: readonly ObservedCall[]) => (o: ObservedCall): boolean =>
    set.has(o.name) && isDestructive(o.name, o.args) && !(pending.includes(o) ? pendingIsSimulate(o) : executedIsSimulate(o));
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
      // counts exactly like an observed effect — unless its own args declare it a simulation, which is the
      // only evidence a call that has not run can offer (see `pendingIsSimulate`).
      const pending = ctx.siblingCallsThisStep ?? [];
      const candidates = ctx.siblingCallsThisStep ? [...ctx.observed, ...pending] : ctx.observed;
      const isEffect = isEffectAmong(pending);
      // The `maxCalls` core: at most ONE prior effect this turn (n:1, scope:'turn').
      if (countOkCalls(candidates, isEffect, { scope: 'turn', turnIndex: ctx.turnIndex }) < 1) return null;
      // Name the prior effect for the deny (the counter returns a tally, not the call).
      const prior = candidates.find((o) => o.turnIndex === ctx.turnIndex && o.ok && isEffect(o))!;
      return `A destructive action (${prior.name}) already ran this turn — do NOT chain another destructive call. Reply to the user first.`;
    },
    prose: () => 'at most one destructive action per turn (a simulation that changed nothing does not count)',
  };
}
