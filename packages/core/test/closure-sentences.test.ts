/**
 * THE EXHAUSTION CLOSURE'S FAILURE LINE — one authored sentence, from one of two sources.
 *
 * A `failure` claim's line reads `<target>: could not be completed`, and the engine-derived closure
 * appends `— <sentence>` to it from whichever authored text the observed call carried: the world
 * result's own `message` for an executed `ok:false` call, or the vetoing guard's `publicReason` for a
 * blocked one. Neither source is read data — both are strings an author wrote — and a call that
 * carries neither leaves the line exactly as the engine's generic default.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '../src/index.js';
import type { AgentWorld, Guard } from '../src/index.js';
import { renderOperationReport, deriveClaimsFromActionHistory } from '../src/internal.js';
import { createActionHistory, beginTurn, recordToolResult } from '../src/runtime/action-history.js';
import { evaluatePreTool } from '../src/runtime/turn.js';

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

describe('a failed call closure line', () => {
  it('carries the world error message', () => {
    const actionHistory = createActionHistory();
    recordToolResult(
      actionHistory,
      'scheduleMaintenance',
      { assetId: 'ast_genr01' },
      { ok: false, error: 'ASSET_IN_MAINTENANCE', message: 'ast_genr01 is already in maintenance' },
    );
    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['scheduleMaintenance']);
    const closure = renderOperationReport(derived);
    expect(closure).toContain('could not be completed — ast_genr01 is already in maintenance');
  });
});

describe('a vetoed call closure line', () => {
  it('carries the guard public sentence when authored', async () => {
    const guard: Guard = {
      kind: 'precondition',
      dim: 'run',
      check: () => 'the workspace is suspended for maintenance, no writes are accepted',
      prose: () => '',
      publicReason: 'the workspace is suspended',
    };
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'] });
    spec.addGuard('preTool', ['createBooking'], guard, { id: 'x:workspaceSuspended' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'book the slot');

    await evaluatePreTool(spec, actionHistory, fixtureWorld(), 'createBooking', { slot: 1 });

    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['createBooking']);
    const closure = renderOperationReport(derived);
    expect(closure).toContain('— the workspace is suspended');
  });
});

describe('no authored sentence', () => {
  it('a result carrying neither message nor report renders the engine default line alone', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'scheduleMaintenance', { assetId: 'ast_genr01' }, { error: 'ASSET_IN_MAINTENANCE' });
    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['scheduleMaintenance']);
    const closure = renderOperationReport(derived);
    expect(closure).toContain('An action could not be completed.');
  });

  it('a plain guard denial with no publicReason renders the engine default line alone', async () => {
    const guard: Guard = { kind: 'precondition', dim: 'run', check: () => 'not allowed right now', prose: () => '' };
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'] });
    spec.addGuard('preTool', ['createBooking'], guard, { id: 'x:plainDeny' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'book the slot');

    await evaluatePreTool(spec, actionHistory, fixtureWorld(), 'createBooking', { slot: 1 });

    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['createBooking']);
    const closure = renderOperationReport(derived);
    expect(closure).toContain('An action could not be completed.');
    expect(closure).not.toContain('—');
  });
});
