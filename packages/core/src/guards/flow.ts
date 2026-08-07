/**
 * FLOW guards — sequencing, budgets and repetition (the `spatial` / `run` dims that key on WHICH calls
 * already happened), plus the canonical-args fingerprint the repetition kinds are built on.
 */
import type { Guard, GuardCtx, ObservedCall } from '../rules.js';
import { TERMINAL_TOOLS } from './shared.js';

/**
 * THE BUDGET COUNTER — the shared counting core of every "at most n" gate. Counts the model's OWN
 * SUCCESSFUL (`ok`) calls among `candidates` that satisfy `match`, within a budget WINDOW:
 *  - `scope: 'turn'` — only calls of the current turn (`o.turnIndex === turnIndex`);
 *  - `scope: 'conversation'` — every turn.
 * `maxCalls` counts one tool by name; `destructiveThrottle` counts a tool SET minus its simulations — both
 * deny once the count reaches their `n` (1 for the throttle). One place decides what "already acted"
 * means, so the two kinds can never drift apart on it.
 */
export function countOkCalls(
  candidates: readonly ObservedCall[],
  match: (o: ObservedCall) => boolean,
  opts: { scope: 'turn' | 'conversation'; turnIndex: number },
): number {
  return candidates.filter(
    (o) => o.ok && (opts.scope === 'conversation' || o.turnIndex === opts.turnIndex) && match(o),
  ).length;
}

// ── SPATIAL (graph / sequencing) ─────────────────────────────────────────────

/**
 * T may run only after EVERY dep has already run successfully this conversation.
 *
 * RECENCY LAW (2026-08-02): this is an EVIDENCE guard — a past dep call is PROOF the groundwork was done,
 * not a license that unlocks a new act — so `within` defaults to **UNBOUNDED**: a read from turn 1
 * legitimately grounds a turn-3 write. Pass `within` to bound it (`currentTurnIndex − depTurnIndex ≤ within`)
 * only when the domain genuinely wants the evidence to be fresh.
 */
export function requiresBefore(deps: string[], opts?: { within?: number }): Guard {
  const within = opts?.within;
  const ranWithin = (ctx: GuardCtx, dep: string): boolean =>
    ctx.observed.some(
      (o) =>
        o.name === dep &&
        o.ok &&
        (within == null || (ctx.turnIndex - o.turnIndex >= 0 && ctx.turnIndex - o.turnIndex <= within)),
    );
  return {
    kind: 'requiresBefore',
    dim: 'spatial',
    meta: { before: [...deps] },
    check(ctx) {
      const missing = deps.filter((d) => !ranWithin(ctx, d));
      return missing.length ? `Do ${missing.join(' then ')} FIRST — it must run before this tool.` : null;
    },
    prose: () => `only after ${deps.join(' → ')} has run`,
  };
}

/**
 * T is forbidden for this turn — an UNCONDITIONAL deny while this binding is installed.
 *
 * PROSE/REASON SPLIT (see GUARDS.md "the prose≠reason law"): `reason` is the DENY text
 * (post-hoc, read only when the model already violated); `prose()` returns a followable RULE derived
 * from the guard's parameters, read BEFORE acting. Pass `prose` to override the derived default.
 *
 * PROSE↔CHECK ALIGNMENT: the derived prose states an UNCONDITIONAL ban, not "do not call this tool
 * AGAIN in this turn" — the latter describes a repeat-detector, and this kind is not one. `check` is
 * `() => reason`, unconditional and turn-logic-free: the FIRST call is denied too. This kind is the hard
 * "not now" on a tool; the repeat-detector is `noDuplicateCall`.
 */
export function forbidThisTurn(reason: string, prose?: string): Guard {
  return {
    kind: 'forbidThisTurn',
    dim: 'spatial',
    check: () => reason,
    prose: () => prose ?? 'do not call this tool in this turn — not even once',
  };
}

// ── RUN (execution preconditions) ────────────────────────────────────────────

/**
 * `tool` may run at most `n` successful times within a budget WINDOW (counts the model's OWN OK calls):
 *  - `scope: 'turn'` (default) — the per-turn budget (bulk cap): counts only OK calls of THIS turn.
 *  - `scope: 'conversation'` — the cross-turn budget: counts OK calls across all turns.
 * The two scopes share one deny message (the caller-supplied `reason`); `prose()` is the DERIVED
 * budget rule (prose≠reason law) — override with `opts.prose`.
 */
export function maxCalls(
  tool: string,
  n: number,
  reason: string,
  opts?: { scope?: 'turn' | 'conversation'; prose?: string },
): Guard {
  const scope = opts?.scope ?? 'turn';
  return {
    kind: 'maxCalls',
    dim: 'run',
    check(ctx) {
      const count = countOkCalls(ctx.observed, (o) => o.name === tool, { scope, turnIndex: ctx.turnIndex });
      return count >= n ? reason : null;
    },
    prose: () =>
      opts?.prose ??
      `call ${tool} at most ${n} time${n === 1 ? '' : 's'} per ${scope === 'conversation' ? 'conversation' : 'turn'}`,
  };
}

/** Where an argument object carries the fingerprint of the form the model WROTE it in. */
const WRITTEN_FINGERPRINT = Symbol.for('looprun.writtenArgsFingerprint');

/**
 * Keep the fingerprint of `args` as it stands NOW on the object itself, before anything rewrites it.
 *
 * The sensitive-data seam rewrites a declared free-text argument in place, and the action history then
 * records the rewritten object. A repeat of the same call arrives written the way the model wrote it,
 * so without this the two forms fingerprint differently and the repeat reads as new work:
 *
 * ```
 *   written  { description: 'boom — call +1 415 555 0199' }   ← what the repeat detector is handed
 *   recorded { description: 'boom — call •••' }               ← what the record holds
 * ```
 *
 * The property is symbol-keyed and non-enumerable, so no walk, serialization or equality over the
 * arguments sees it — {@link canonArgs} keeps answering with the VALUES the object holds, which is what
 * pairs a recorded call with the world's own row for it.
 */
export function keepWrittenArgs(args: Record<string, unknown>): void {
  Object.defineProperty(args, WRITTEN_FINGERPRINT, { value: canonArgs(args), configurable: true });
}

/** The fingerprint of a call in the form it was WRITTEN in: the kept one when the object was rewritten
 *  after the model sent it, its own values otherwise. This is the form two sendings of the same call
 *  agree on. */
function writtenArgs(v: Record<string, unknown>): string {
  const kept = (v as Record<symbol, unknown>)[WRITTEN_FINGERPRINT];
  return typeof kept === 'string' ? kept : canonArgs(v);
}

/** Key-order-independent canonical fingerprint of a call's args, over the values it holds. */
export function canonArgs(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonArgs).join(',')}]`;
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonArgs(rec[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Describe what a prior tool result actually CAME BACK WITH, in one clause — pure, domain-neutral,
 * shape-driven (it reads container sizes, never values).
 *
 * WHY: `noDuplicateCall`'s deny must not assert "…and it succeeded — use the earlier result and move
 * on". `ok` is true for a call that returned an EMPTY list, so that wording tells the model to use a
 * result with no content in it: a model sweeping `listBookings` status-by-status gets "succeeded" on
 * every empty call and no way to know that repeating the sweep is pointless. A deny that names the SHAPE
 * of what came back ("came back EMPTY (zero items)") is followable; "it succeeded" is not.
 */
function describeResultShape(result: unknown): string {
  if (result === undefined || result === null) return 'came back with nothing';
  if (Array.isArray(result)) {
    return result.length ? `came back with ${result.length} entries` : 'came back EMPTY (zero entries)';
  }
  if (typeof result === 'object') {
    const rec = result as Record<string, unknown>;
    const arrayField = Object.entries(rec).find(([, v]) => Array.isArray(v));
    if (arrayField) {
      const [key, list] = arrayField as [string, unknown[]];
      return list.length ? `came back with ${list.length} ${key}` : `came back EMPTY (zero ${key})`;
    }
    if (rec.success === false || rec.ok === false || typeof rec.error === 'string') return 'came back as a FAILURE';
    return 'came back with exactly the result you already have';
  }
  return 'came back with exactly the result you already have';
}

/** The RESULT the world action history recorded for the last call of `tool` with the canonical args `key`, or
 *  `undefined` when the host's action history carries none (ObservedCall itself holds no payload). Pure read. */
function priorResultOf(ctx: GuardCtx, tool: string, key: string): unknown {
  const calls = Array.isArray(ctx.world?.toolCalls) ? ctx.world.toolCalls : [];
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const c = calls[i];
    if (c?.name === tool && canonArgs(c.args) === key) return c.result;
  }
  return undefined;
}

/** Deny a call whose (tool, canonical args) already SUCCEEDED this turn. */
export function noDuplicateCall(): Guard {
  return {
    kind: 'noDuplicateCall',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      // MATCHED ON THE WRITTEN FORM, so a call whose declared free text the sensitive-data seam
      // rewrote still answers to the arguments the model sent — otherwise the record holds
      // `'call •••'`, the repeat arrives as `'call +1 415 555 0199'`, and one call sent twice reads as
      // two different calls.
      const key = writtenArgs(ctx.args);
      const dup = ctx.observed.find(
        (o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === ctx.tool && writtenArgs(o.args) === key,
      );
      if (!dup) return null;
      // A TERMINAL duplicate is not a data re-read — naming the runtime-owned tool back at the model
      // would leak an internal name into a correction it can act on in plain terms (TASK 3 lint).
      if (TERMINAL_TOOLS.has(ctx.tool)) {
        return 'You already sent that exact message to the user this turn — do not send it a second time; end the turn.';
      }
      // The world's own row holds the arguments the executor received, so the prior result is looked up
      // by the VALUES the matched call was recorded with.
      const shape = describeResultShape(priorResultOf(ctx, ctx.tool, canonArgs(dup.args)));
      return `You already called ${ctx.tool} with these EXACT arguments this turn and it ${shape} — running it again returns the same thing. Work with what came back: if it came back empty, THAT is the answer — say so instead of retrying, and never retry the same arguments hoping for a different result.`;
    },
    // PROSE↔CHECK ALIGNMENT: the check is TURN-scoped (`o.turnIndex ===
    // ctx.turnIndex`) but the prose stated an unqualified "never repeat", which reads as a
    // conversation-wide ban and wrongly discourages the legitimate re-read of the same record in a
    // LATER turn. The check is right (a cross-turn repeat is usually a genuine refresh); the prose now
    // carries the turn scope it actually enforces.
    prose: () => 'never repeat, within the same turn, a tool call that already succeeded with the same arguments',
  };
}
