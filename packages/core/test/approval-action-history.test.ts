/**
 * THE APPROVAL REQUEST STORE — who issues a consent question, and what turns it into consent.
 *
 * Both are the RUNTIME's: reading the user's text and mutating the store are exactly what a guard must
 * not do, so the guard layer only ever reads the result.
 */
import { describe, it, expect } from 'vitest';
import { beginTurn, createActionHistory, issueApprovalForVeto, recordToolResult } from '../src/runtime/action-history.js';

describe('a world result that requires confirmation issues an approval request', () => {
  it('names the record the world issued', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'cancel BK-1');
    recordToolResult(actionHistory, 'cancelBooking', { id: 'BK-1' }, { requiresConfirmation: true, id: 'BK-1' });
    expect(actionHistory.approvals).toHaveLength(1);
    expect(actionHistory.approvals[0]).toMatchObject({ tool: 'cancelBooking', subject: 'BK-1', token: 'CONFIRM BK-1' });
    expect(actionHistory.approvalsIssuedThisTurn).toHaveLength(1);
  });

  it('asks one question per act, however many times the act is attempted', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'cancel BK-1');
    const result = { requiresConfirmation: true, id: 'BK-1' };
    recordToolResult(actionHistory, 'cancelBooking', { id: 'BK-1' }, result);
    recordToolResult(actionHistory, 'cancelBooking', { id: 'BK-1' }, result);
    expect(actionHistory.approvals).toHaveLength(1);
  });

  it('issues nothing when the world named no record', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'cancel it');
    recordToolResult(actionHistory, 'cancelBooking', {}, { requiresConfirmation: true });
    expect(actionHistory.approvals).toHaveLength(0);
  });
});

describe('a vetoed destructive call issues an approval request from its declared label', () => {
  it('uses the label the spec declared', () => {
    const actionHistory = createActionHistory();
    actionHistory.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(actionHistory, 0, 'wipe everything');
    issueApprovalForVeto(actionHistory, 'deleteAllData');
    expect(actionHistory.approvals[0]).toMatchObject({
      tool: 'deleteAllData',
      meaning: 'delete all of your data',
      token: 'CONFIRM DELETE-ALL',
    });
    expect(actionHistory.approvals[0]!.subject).toBeUndefined();
  });

  it('issues nothing for a tool with no declared label', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'wipe everything');
    issueApprovalForVeto(actionHistory, 'deleteAllData');
    expect(actionHistory.approvals).toHaveLength(0);
  });
});

describe("the user's own words consume an open approval", () => {
  const armed = () => {
    const actionHistory = createActionHistory();
    actionHistory.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(actionHistory, 0, 'wipe everything');
    issueApprovalForVeto(actionHistory, 'deleteAllData');
    return actionHistory;
  };

  it('records the consumption on the turn that carried the token', () => {
    const actionHistory = armed();
    beginTurn(actionHistory, 1, 'ok, CONFIRM DELETE-ALL');
    expect(actionHistory.consentThisTurn).toHaveLength(1);
    expect(actionHistory.approvals[0]!.consumedTurn).toBe(1);
  });

  it('carries no consent on a turn whose message is a human yes', () => {
    const actionHistory = armed();
    beginTurn(actionHistory, 1, 'go ahead');
    expect(actionHistory.consentThisTurn).toEqual([]);
  });

  it('keeps an approval request open across an unrelated turn', () => {
    const actionHistory = armed();
    beginTurn(actionHistory, 1, 'wait, what does that remove?');
    expect(actionHistory.consentThisTurn).toEqual([]);
    beginTurn(actionHistory, 2, 'CONFIRM DELETE-ALL');
    expect(actionHistory.consentThisTurn).toHaveLength(1);
  });

  it('licenses one act per typed token', () => {
    const actionHistory = armed();
    beginTurn(actionHistory, 1, 'CONFIRM DELETE-ALL');
    expect(actionHistory.consentThisTurn).toHaveLength(1);
    beginTurn(actionHistory, 2, 'CONFIRM DELETE-ALL');
    expect(actionHistory.consentThisTurn).toEqual([]);
  });
});

describe('a write that lands closes the question about its record', () => {
  it('leaves an unanswered question unanswerable once the record moved', () => {
    const world = { toolCalls: [] as Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> };
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'cancel BK-1');
    recordToolResult(actionHistory, 'cancelBooking', { id: 'BK-1' }, { requiresConfirmation: true, id: 'BK-1' });
    world.toolCalls.push({ name: 'cancelBooking', args: { id: 'BK-1' }, tookEffect: true });
    recordToolResult(actionHistory, 'cancelBooking', { id: 'BK-1' }, { id: 'BK-1' }, world as never);
    expect(actionHistory.approvals[0]!.closed).toBe(true);
    beginTurn(actionHistory, 1, 'CONFIRM BK-1');
    expect(actionHistory.consentThisTurn).toEqual([]);
  });
});
