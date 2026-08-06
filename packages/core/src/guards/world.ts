/**
 * WORLD guards — the kinds that read the host's world state: an execution precondition, a post-execution
 * result invariant, and the consent gate (risk family 6).
 */
import type { Guard, AgentWorld } from '../rules.js';

/** Generic state precondition: the call is allowed only while `ok(world)` holds. `prose` states the
 *  CONDITION (always-rendered), separate from the deny `reason` (fires only when the condition is false).
 *
 *  The `prose ?? reason` fallback is the ONE knowingly-retained prose≠reason residue. `ok` is an opaque closure, so unlike `consentRequired` (which has a tool list) there is no
 *  parameter to derive a rule from, and a neutral default would be so generic it would tell the model
 *  nothing about WHICH condition gates the call — strictly worse than the author's own `reason`.
 *  GUARDS.md puts 2-arg `precondition` on notice under the law: write `reason` as a followable rule, or
 *  pass `prose`. */
export function precondition<W extends AgentWorld = AgentWorld>(ok: (world: W) => boolean, reason: string, prose?: string): Guard {
  return {
    kind: 'precondition',
    dim: 'run',
    check: (ctx) => (ok(ctx.world as W) ? null : reason),
    prose: () => prose ?? reason,
  };
}

// ── OUTPUT (postTool result invariant) ───────────────────────────────────────

/**
 * Post-execution result invariant: the tool ALREADY ran; if `pred(result, world)` is false the violation
 * joins the onReply redrive set (it never rewrites the result).
 *
 * PROSE≠REASON: this kind returned `reason` verbatim as its prose, so a deny
 * text written post-hoc ("the report came back empty — you cannot summarise it") was rendered into the
 * assembled prompt as a pre-action instruction, i.e. an accusation the model reads before doing anything. `pred` is
 * an opaque closure, so nothing rule-shaped can be DERIVED from the parameters — hence an optional
 * `prose` param plus a rule-shaped (not accusatory) neutral default. Prefer passing an explicit `prose`
 * that states the invariant this tool's result must hold.
 */
export function resultInvariant<W extends AgentWorld = AgentWorld>(
  pred: (result: unknown, world: W) => boolean,
  reason: string,
  prose?: string,
): Guard {
  return {
    kind: 'resultInvariant',
    dim: 'output',
    check(ctx) {
      if (ctx.result === undefined) return null;
      return pred(ctx.result, ctx.world as W) ? null : reason;
    },
    prose: () => prose ?? 'report a tool result only as it actually came back — when it does not hold what the request needed, say so plainly instead of presenting it as complete',
  };
}

/**
 * FAMILY 6 — retention / consent. Whether consent was *informed*, or whether this purpose is compatible
 * with the consented one, is UNCHECKABLE. Whether the world's consent flag reads true is a pure world
 * read: a write that stores or transmits personal data runs only while `consentOk(world)` holds. It is
 * `precondition` specialised to a TOOL SET (a consent gate almost always covers several writes, and the
 * distinct kind is what makes the family auditable in a spec header instead of hiding inside a generic
 * precondition). Pair with `maxCalls({scope:'conversation'})` for the repeat-contact/retention half.
 *
 * MISCONFIGURATION FAILS AT CONSTRUCTION: an empty `tools` gates nothing, and a blank `reason` is worse
 * than inert — the deny value would be a falsy string, read as "no violation", so a denied call would
 * silently proceed. Both throw.
 */
export function consentRequired<W extends AgentWorld = AgentWorld>(opts: {
  tools: string[];
  consentOk: (world: W) => boolean;
  reason: string;
  /** Override the DERIVED prose (prose≠reason law). `reason` stays the deny text. */
  prose?: string;
}): Guard {
  const set = new Set(opts.tools);
  if (!opts.tools.length) {
    throw new Error('consentRequired: `tools` is empty — the guard would gate nothing. List the writes the consent flag must cover.');
  }
  if (!opts.reason.trim()) {
    throw new Error('consentRequired: `reason` is blank — it is the deny text, and a falsy deny value would read as "allowed".');
  }
  return {
    kind: 'consentRequired',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      return opts.consentOk(ctx.world as W) ? null : opts.reason;
    },
    // PROSE≠REASON: this kind returned `reason` verbatim, so the deny text —
    // written post-hoc, often past-tense — was rendered into the assembled prompt as a pre-action instruction. The
    // TOOL LIST is a real parameter, so a followable rule CAN be derived from it; `prose` overrides.
    prose: () =>
      opts.prose ??
      `call ${opts.tools.join(', ')} only while this person's consent to store or share their data is on record — if it is not, ask for it first and do not call them`,
  };
}
