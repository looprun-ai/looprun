/**
 * WHAT THE DELIVERED TEXT CARRIES, end to end and deterministically.
 *
 * Three facts reach the user through the engine's own blocks, never through the model's prose:
 *
 *   · THE RESULT'S OWN SENTENCE — a `report` string on a tool result renders after the outcome word in
 *     the operation record (`bk_1001: done — removed tech_4003`), so the fact survives a reply that
 *     forgot it. A result with no report renders the outcome word alone.
 *   · EVERY OPEN QUESTION — an approval that is neither consumed nor closed renders on EVERY delivery,
 *     whatever turn raised it, and the blank-delivery floor counts a standing question as something to
 *     deliver.
 *   · THE FAILURE'S AUTHORED HALF — a failure line carries ` — <sentence>` from the world result's own
 *     `message` or from the vetoing guard's `publicReason`, and from nothing else.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import type { AgentWorld, Guard } from '../../src/rules.js';
import { deriveClaimsFromActionHistory, operationRecord, renderOperationReport } from '../../src/internal.js';
import type { Intention } from '../../src/runtime/claims.js';
import { beginTurn, createActionHistory, recordToolResult } from '../../src/runtime/action-history.js';
import { evaluatePreTool, finalizeReply } from '../../src/runtime/turn.js';

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

const spec = (id: string, tools: string[]) =>
  new AgentSpecBase({ id, mode: 'PROOF', persona: 'You are the proof agent.', tools, destructiveTools: tools });

// ── the result's own sentence ────────────────────────────────────────────────
describe('the operation record and the result report', () => {
  it('positive — a report on the result renders after the outcome word', () => {
    const actionHistory = createActionHistory();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'cancelDispatch', args: { bookingId: 'bk_1001' }, result: { label: 'bk_1001' }, tookEffect: true });
    recordToolResult(actionHistory, 'cancelDispatch', { bookingId: 'bk_1001' }, { label: 'bk_1001', report: 'removed tech_4003' }, world);

    const did = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['cancelDispatch']);
    expect(operationRecord(did).text).toContain('bk_1001: done — removed tech_4003');
  });

  it('negative — a result with no report renders the outcome word alone', () => {
    const withReport: Intention[] = [{ op: 'cancel', target: 'bk_1001', outcome: 'success', report: 'removed tech_4003' }];
    const without: Intention[] = [{ op: 'cancel', target: 'bk_1001', outcome: 'success' }];
    expect(operationRecord(without).text).toBe(operationRecord(withReport).text.replace(' — removed tech_4003', ''));
    expect(operationRecord(without).text).not.toContain(' — ');
  });

  it('neutral — a blank report is no report, and the record says nothing extra', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'cancelDispatch', { id: 'bk_1001' }, { id: 'bk_1001', report: '   ' });
    expect(actionHistory.observed[0]!.report).toBeUndefined();
  });
});

// ── every open question ──────────────────────────────────────────────────────
describe('the open approvals on a delivery', () => {
  const deliver = (id: string, actionHistory: ReturnType<typeof createActionHistory>, message: string) =>
    finalizeReply(
      spec(id, ['chargeDeposit']),
      undefined,
      fixtureWorld(),
      actionHistory,
      { message, did: [{ op: 'inform' }] },
      async () => ({ message: '', did: [{ op: 'inform' }] }),
      0,
    );

  /** A turn that raised one question about bk_1001, then a later turn that answers nothing. */
  function standingQuestion() {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'charge the deposit for bk_1001');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { requiresConfirmation: true, id: 'bk_1001' });
    beginTurn(actionHistory, 1, 'tell me about my account');
    return actionHistory;
  }

  it('positive — a question raised an earlier turn renders again on this one', async () => {
    const out = await deliver('open-question', standingQuestion(), 'Here is what I can tell you.');
    expect(out.text).toContain('To confirm bk_1001, reply: CONFIRM BK_1001');
  });

  it('negative — a question the user answered renders nothing', async () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'charge the deposit for bk_1001');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { requiresConfirmation: true, id: 'bk_1001' });
    beginTurn(actionHistory, 1, 'CONFIRM BK_1001');

    const out = await deliver('answered-question', actionHistory, 'Done.');
    expect(out.text).not.toContain('CONFIRM BK_1001');
  });

  it('neutral — a blank turn beside a standing question delivers the question, not the exhaustion closure', async () => {
    const out = await deliver('blank-floor', standingQuestion(), '');
    expect(out.text).toContain('To confirm bk_1001, reply: CONFIRM BK_1001');
    expect(out.exhausted).toBe(false);
  });
});

// ── the failure's authored half ──────────────────────────────────────────────
describe('the closure failure line', () => {
  const closureFor = (actionHistory: ReturnType<typeof createActionHistory>, tool: string) =>
    renderOperationReport(deriveClaimsFromActionHistory(actionHistory.observed, 0, [tool]));

  it('positive — an executed failure carries the world result message', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'scheduleMaintenance', { assetId: 'ast_1' }, {
      ok: false,
      error: 'ASSET_IN_MAINTENANCE',
      message: 'ast_1 is already in maintenance',
    });
    expect(closureFor(actionHistory, 'scheduleMaintenance')).toContain('could not be completed — ast_1 is already in maintenance');
  });

  it('positive — a vetoed call carries the guard public sentence', async () => {
    const guard: Guard = {
      kind: 'precondition',
      dim: 'run',
      check: () => 'the workspace is suspended for maintenance, no writes are accepted',
      prose: () => '',
      publicReason: 'the workspace is suspended',
    };
    const agent = spec('public-reason', ['scheduleMaintenance']);
    agent.addGuard('preTool', ['scheduleMaintenance'], guard, { id: 'agent:workspaceSuspended' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'schedule it');
    await evaluatePreTool(agent, actionHistory, fixtureWorld(), 'scheduleMaintenance', { assetId: 'ast_1' });

    expect(closureFor(actionHistory, 'scheduleMaintenance')).toContain('— the workspace is suspended');
  });

  it('negative — the guard correction the model reads never rides the delivery', async () => {
    const guard: Guard = {
      kind: 'precondition',
      dim: 'run',
      check: () => 'the workspace is suspended for maintenance, no writes are accepted',
      prose: () => '',
      publicReason: 'the workspace is suspended',
    };
    const agent = spec('correction-stays-in', ['scheduleMaintenance']);
    agent.addGuard('preTool', ['scheduleMaintenance'], guard, { id: 'agent:workspaceSuspended' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'schedule it');
    await evaluatePreTool(agent, actionHistory, fixtureWorld(), 'scheduleMaintenance', { assetId: 'ast_1' });

    expect(closureFor(actionHistory, 'scheduleMaintenance')).not.toContain('no writes are accepted');
  });

  it('neutral — a call with neither source keeps the generic line', async () => {
    const guard: Guard = { kind: 'precondition', dim: 'run', check: () => 'not allowed right now', prose: () => '' };
    const agent = spec('no-authored-sentence', ['scheduleMaintenance']);
    agent.addGuard('preTool', ['scheduleMaintenance'], guard, { id: 'agent:plainDeny' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'schedule it');
    await evaluatePreTool(agent, actionHistory, fixtureWorld(), 'scheduleMaintenance', { assetId: 'ast_1' });

    const closure = closureFor(actionHistory, 'scheduleMaintenance');
    expect(closure).toContain('An action could not be completed.');
    expect(closure).not.toContain('—');
  });
});
