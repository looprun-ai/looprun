/**
 * `ok` MEANS "THE CALL EXECUTED", NEVER "THE ACTION SUCCEEDED" (audit 2026-07-21).
 *
 * `noFabricatedSuccess` short-circuits on `ranThisTurn`, which reads `ObservedCall.ok`. That is a
 * silent assumption about how the world reports refusals:
 *
 *   world THROWS on refusal    → ok:false → the guard adjudicates normally
 *   world RETURNS its refusal  → ok:true  → the ENTIRE guard short-circuits to null
 *
 * The second world is not broken — returning `{ reason: 'part_unavailable' }` instead of throwing is
 * a reasonable, arguably better design, and a blind generation run produced exactly that. Measured
 * consequence there: the agent announced order `OS-2023` immediately after the world refused to open
 * it, with every seam of this guard disarmed.
 *
 * The runtime cannot fix this by inspecting the result: what counts as a refusal is business
 * vocabulary, and P8a keeps that out of here. So the DOMAIN injects `succeeded`. These proofs pin
 * both the trap and the closure — and pin that the default stayed byte-stable.
 */
import { describe, it, expect } from 'vitest';
import { noFabricatedSuccess } from '../../src/guards.js';
import type { GuardCtx, ObservedCall } from '../../src/rules.js';

const ctxWith = (observed: ObservedCall[], reply: string): GuardCtx =>
  ({ args: {}, observed, turnIndex: 0, reply, world: {} as never } as unknown as GuardCtx);

const CLAIM = /\b(?:aberta|criada|opened)\b/i;
const guard = (opts: Record<string, unknown> = {}) =>
  noFabricatedSuccess('openServiceOrder', { reason: 'do not claim it was opened', claimRe: CLAIM, labelRe: /OS-\d{4}/, ...opts });

/** The refusal a polite world returns: the call RAN, the action did NOT happen. */
const refusedButOk: ObservedCall[] = [{ name: 'openServiceOrder', args: {}, ok: true, turnIndex: 0 }];
/** The refusal a throwing world produces. */
const refusedAndFailed: ObservedCall[] = [{ name: 'openServiceOrder', args: {}, ok: false, turnIndex: 0 }];

describe('refusal-as-result disarms the guard unless the domain says what success means', () => {
  it('THE TRAP: a refusal reported as a RESULT (ok:true) silences the guard by default', () => {
    const verdict = guard().check(ctxWith(refusedButOk, 'Pronto! A OS-2023 foi aberta.'));
    expect(verdict, 'this null IS the defect: the reply fabricates an order the world refused').toBeNull();
  });

  it('a THROWING world is adjudicated normally — which is why the trap went unnoticed', () => {
    expect(guard().check(ctxWith(refusedAndFailed, 'Pronto! A OS-2023 foi aberta.'))).not.toBeNull();
  });

  it('CLOSURE: the injected `succeeded` predicate restores the verdict on the same ledger', () => {
    const g = guard({ succeeded: () => false });   // the domain knows this turn refused
    expect(g.check(ctxWith(refusedButOk, 'Pronto! A OS-2023 foi aberta.'))).not.toBeNull();
  });

  it('`succeeded` true still short-circuits — an honest report of real work is not fabrication', () => {
    const g = guard({ succeeded: () => true });
    expect(g.check(ctxWith(refusedButOk, 'Pronto! A OS-2023 foi aberta.'))).toBeNull();
  });

  it('the DEFAULT is byte-stable: absent `succeeded`, behaviour is exactly the old `ranThisTurn`', () => {
    const noRun: ObservedCall[] = [];
    // no attempt this turn → the claim branch is attempt-keyed and stays silent
    expect(guard().check(ctxWith(noRun, 'Costumamos abrir OS no balcão.'))).toBeNull();
    // executed OK → short-circuit, same as before the seam existed
    expect(guard().check(ctxWith(refusedButOk, 'A OS-2023 foi aberta.'))).toBeNull();
  });
});
