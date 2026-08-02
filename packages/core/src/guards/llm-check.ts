/**
 * The LLM-ADJUDICATED guard kind (`llmCheck`) — the one guard whose verdict is a MODEL's, not a
 * deterministic predicate's. It exists for the jobs structure alone cannot decide: "did the operator's
 * yes license THIS act?", "is this reply promising something the world never did?" — a judgement over
 * the full conversation (history + user text) that no arg/observed pattern captures.
 *
 * THE CONTRACT (design 2026-08-02, firewall retired):
 *  - The MODEL is host-registered: an {@link Adjudicator} on the runtime options, threaded onto the
 *    guard ctx, NEVER named in config. `llmCheck` only carries the trusted, pre-baked `rubric` (the
 *    question) and a `failMode`.
 *  - The adjudicator's output is VERDICT-ONLY (`{ violation: string | null }`): a deny reason, never
 *    free text delivered to the operator. `check` returns it verbatim as the deny (relayed through the
 *    runtime's own correction/redrive channel).
 *  - Prompt-injection is acknowledged and accepted: the rubric is trusted and fixed, the output channel
 *    is a verdict, and the residual risk is priced by evals — not by blinding the guard to the text.
 *  - This guard is ASYNC (it awaits the adjudicator). Deterministic guards stay sync; the runtime awaits
 *    every `check` uniformly, so an llmCheck coexists ordered with the sync guards on the same hook.
 *
 * PURITY: no LLM call, clock or entropy lives HERE — the guard only DELEGATES to the injected seam, so
 * the T1 purity lint holds. The impurity is the host's adjudicator, outside the guard surface.
 */
import type { Guard, Dim } from '../rules.js';

/** The deny a `failMode:'closed'` guard emits when its adjudicator is UNREACHABLE (threw/rejected/timed
 *  out) — a generic, figure-free correction, never the adjudicator's own words (there are none: it
 *  failed). The SAME reason for a rejection and a timeout: both mean "could not verify". */
const CLOSED_FAIL_DENY =
  'A required policy check could not be completed — do not proceed until it can be verified.';

/** Default adjudicator timeout when the registration seam did not set `adjudicatorTimeoutMs`. A hung
 *  adjudicator past this deadline is treated as unreachable → `failMode` decides. */
const DEFAULT_ADJUDICATOR_TIMEOUT_MS = 30000;

/** A never-settling adjudicator would HANG the turn (failMode only fires on a SETTLED rejection). So the
 *  guard races the adjudicator against a timeout; on expiry the race rejects and the `catch` applies
 *  failMode, exactly as for a thrown/rejected adjudicator. The timer is always cleared. */
function adjudicateWithTimeout(
  run: Promise<{ violation: string | null }>,
  timeoutMs: number,
): Promise<{ violation: string | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`adjudicator timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([run, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * An LLM-adjudicated guard. `rubric` is the trusted question the host adjudicator answers; `failMode`
 * decides what an UNREACHABLE adjudicator means — `'open'` (default) allows, `'closed'` denies. `dim`
 * selects the hook family the runtime installs it on (`'behavior'` → onReply, the default; `'run'` →
 * preTool) — the eval loader passes it from the config `hook`. A verdict `{ violation }` becomes the
 * deny reason verbatim; `null` allows.
 */
export function llmCheck(opts: { rubric: string; failMode?: 'open' | 'closed'; dim?: Dim }): Guard {
  const failMode = opts.failMode ?? 'open';
  const dim: Dim = opts.dim ?? 'behavior';
  return {
    kind: 'llmCheck',
    dim,
    async check(ctx) {
      const adjudicator = ctx.adjudicator;
      if (!adjudicator) {
        // Unreachable in a well-formed run: assertAdjudicatorPresent fails loud at conversation start.
        // If we are here, the host wired an llmCheck past that gate — an author bug, so throw (never a
        // silent allow that would delete the gate).
        throw new Error(
          'llmCheck: no adjudicator on the guard ctx — register one on the runtime options ' +
            '(deps.adjudicator); assertAdjudicatorPresent should have caught this at conversation start.',
        );
      }
      const timeoutMs = ctx.adjudicatorTimeoutMs ?? DEFAULT_ADJUDICATOR_TIMEOUT_MS;
      try {
        const { violation } = await adjudicateWithTimeout(adjudicator(opts.rubric, ctx), timeoutMs);
        return violation ?? null;
      } catch {
        // Adjudicator UNREACHABLE (threw / rejected / TIMED OUT) — failMode decides. A host seam failure
        // (network, model, hang), NOT an author bug in the guard, so it is priced, not re-thrown.
        return failMode === 'closed' ? CLOSED_FAIL_DENY : null;
      }
    },
    prose: () => opts.rubric,
  };
}
