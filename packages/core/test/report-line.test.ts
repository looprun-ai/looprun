/**
 * The tool result's own REPORT sentence rides the operation record: `recordToolResult` extracts a
 * string `report` off the result onto the observed entry, `deriveClaimsFromActionHistory` carries it
 * onto the derived claim, and `operationRecord` renders it after the outcome word — so the fact
 * reaches the user even when the reply's prose forgets it. A result with no `report` renders the
 * outcome word alone.
 */
import { describe, expect, it } from 'vitest';
import type { AgentWorld } from '../src/index.js';
import { deriveClaimsFromActionHistory, operationRecord } from '../src/internal.js';
import type { Intention } from '../src/runtime/claims.js';
import { createActionHistory, recordToolResult } from '../src/runtime/action-history.js';

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

describe('recordToolResult — a string report rides the observed entry', () => {
  it('extracts a non-empty string report onto the observed call', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'cancelDispatch', { bookingId: 'bk_1001' }, {
      ok: true, id: 'bk_1001', report: 'removed tech_4003; 2026-07-10 freed',
    });
    expect(actionHistory.observed[0].report).toBe('removed tech_4003; 2026-07-10 freed');
  });

  it('omits the field when the result carries no report', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'cancelDispatch', { bookingId: 'bk_1001' }, { ok: true, id: 'bk_1001' });
    expect(actionHistory.observed[0].report).toBeUndefined();
  });

  it('omits the field when report is not a non-empty string', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'cancelDispatch', { bookingId: 'bk_1001' }, { ok: true, id: 'bk_1001', report: '   ' });
    expect(actionHistory.observed[0].report).toBeUndefined();
  });
});

describe('deriveClaimsFromActionHistory — the report rides the derived claim', () => {
  it('an effected write carries its result report onto the derived success claim', () => {
    const actionHistory = createActionHistory();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'cancelDispatch', args: { bookingId: 'bk_1001' }, result: { label: 'bk_1001' }, tookEffect: true });
    recordToolResult(actionHistory, 'cancelDispatch', { bookingId: 'bk_1001' }, {
      label: 'bk_1001', report: 'removed tech_4003; 2026-07-10 freed',
    }, world);
    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['cancelDispatch']);
    expect(derived).toEqual([
      { op: 'bk_1001', target: 'bk_1001', outcome: 'success', report: 'removed tech_4003; 2026-07-10 freed' },
    ]);
  });

  it('a requiresConfirmation result carries its report onto the derived tool_called_request_approval claim', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'createBooking', { a: 2 }, {
      requiresConfirmation: true, report: 'charges 3000 USD deposit',
    });
    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['createBooking']);
    expect(derived).toEqual([{ op: 'operation', outcome: 'tool_called_request_approval', report: 'charges 3000 USD deposit' }]);
  });

  it('an ok:false result carries its report onto the derived failure claim', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'createBooking', { a: 1 }, {
      success: false, report: 'slot already taken',
    });
    const derived = deriveClaimsFromActionHistory(actionHistory.observed, 0, ['createBooking']);
    expect(derived).toEqual([{ op: 'operation', outcome: 'failure', report: 'slot already taken' }]);
  });
});

describe('operationRecord — a claim carrying a report renders it after the outcome word', () => {
  it('a write result report line renders after the outcome', () => {
    const did: Intention[] = [{ op: 'cancel', target: 'bk_1001', outcome: 'success', report: 'removed tech_4003; 2026-07-10 freed' }];
    expect(operationRecord(did).text).toContain('bk_1001: done — removed tech_4003; 2026-07-10 freed');
  });

  it('a simulation result report line rides the pending line', () => {
    const did: Intention[] = [{ op: 'cancel', target: 'bk_1001', outcome: 'tool_called_request_approval', report: 'charges 3000 USD deposit' }];
    expect(operationRecord(did).text).toMatch(/bk_1001: awaiting your confirmation — charges 3000 USD deposit/);
  });

  it('a result with no report renders the outcome word alone', () => {
    const did: Intention[] = [{ op: 'cancel', target: 'bk_1001', outcome: 'success' }];
    const text = operationRecord(did).text;
    expect(text).toContain('bk_1001: done');
    expect(text).not.toContain(' — ');
  });

  it('a domain renderClaim override still gets the report appended', () => {
    const did: Intention[] = [{ op: 'refund', target: 'ORD-5', outcome: 'success', report: 'charged 50 USD' }];
    const out = operationRecord(did, { renderClaim: (c, core) => `${c.target} refunded (${core})` }).text;
    expect(out).toContain('ORD-5 refunded (success) — charged 50 USD');
  });

  it('a target-less failure report drops the engine default line own period before joining', () => {
    const did: Intention[] = [{ op: 'operation', outcome: 'failure', report: 'slot already taken' }];
    expect(operationRecord(did).text).toContain('could not be completed — slot already taken');
  });

  it('a domain renderClaim line keeps ITS OWN punctuation — never mutated to join a report', () => {
    const did: Intention[] = [{ op: 'refund', target: 'BK-1', outcome: 'success', report: 'charged 50 EUR' }];
    const out = operationRecord(did, { renderClaim: (c) => `${c.target} confirmed.` }).text;
    expect(out).toContain('BK-1 confirmed. — charged 50 EUR');
  });
});
