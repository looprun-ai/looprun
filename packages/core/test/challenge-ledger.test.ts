/**
 * THE CHALLENGE STORE — who issues a consent question, and what turns it into consent.
 *
 * Both are the RUNTIME's: reading the user's text and mutating the store are exactly what a guard must
 * not do, so the guard layer only ever reads the result.
 */
import { describe, it, expect } from 'vitest';
import { beginTurn, createLedger, issueChallengeForVeto, recordToolResult } from '../src/runtime/ledger.js';

describe('a world result that requires confirmation issues a challenge', () => {
  it('names the record the world issued', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel BK-1');
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, { requiresConfirmation: true, id: 'BK-1' });
    expect(ledger.challenges).toHaveLength(1);
    expect(ledger.challenges[0]).toMatchObject({ tool: 'cancelBooking', subject: 'BK-1', token: 'CONFIRM BK-1' });
    expect(ledger.challengesIssuedThisTurn).toHaveLength(1);
  });

  it('asks one question per act, however many times the act is attempted', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel BK-1');
    const result = { requiresConfirmation: true, id: 'BK-1' };
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, result);
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, result);
    expect(ledger.challenges).toHaveLength(1);
  });

  it('issues nothing when the world named no record', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel it');
    recordToolResult(ledger, 'cancelBooking', {}, { requiresConfirmation: true });
    expect(ledger.challenges).toHaveLength(0);
  });
});

describe('a vetoed destructive call issues a challenge from its declared label', () => {
  it('uses the label the spec declared', () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    expect(ledger.challenges[0]).toMatchObject({
      tool: 'deleteAllData',
      meaning: 'delete all of your data',
      token: 'CONFIRM DELETE-ALL',
    });
    expect(ledger.challenges[0]!.subject).toBeUndefined();
  });

  it('issues nothing for a tool with no declared label', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    expect(ledger.challenges).toHaveLength(0);
  });
});

describe("the user's own words consume an open challenge", () => {
  const armed = () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    return ledger;
  };

  it('records the consumption on the turn that carried the token', () => {
    const ledger = armed();
    beginTurn(ledger, 1, 'ok, CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toHaveLength(1);
    expect(ledger.challenges[0]!.consumedTurn).toBe(1);
  });

  it('carries no consent on a turn whose message is a human yes', () => {
    const ledger = armed();
    beginTurn(ledger, 1, 'go ahead');
    expect(ledger.consentThisTurn).toEqual([]);
  });

  it('keeps a challenge open across an unrelated turn', () => {
    const ledger = armed();
    beginTurn(ledger, 1, 'wait, what does that remove?');
    expect(ledger.consentThisTurn).toEqual([]);
    beginTurn(ledger, 2, 'CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toHaveLength(1);
  });

  it('licenses one act per typed token', () => {
    const ledger = armed();
    beginTurn(ledger, 1, 'CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toHaveLength(1);
    beginTurn(ledger, 2, 'CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toEqual([]);
  });
});

describe('a write that lands closes the question about its record', () => {
  it('leaves an unanswered question unanswerable once the record moved', () => {
    const world = { toolCalls: [] as Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> };
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel BK-1');
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, { requiresConfirmation: true, id: 'BK-1' });
    world.toolCalls.push({ name: 'cancelBooking', args: { id: 'BK-1' }, tookEffect: true });
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, { id: 'BK-1' }, world as never);
    expect(ledger.challenges[0]!.closed).toBe(true);
    beginTurn(ledger, 1, 'CONFIRM BK-1');
    expect(ledger.consentThisTurn).toEqual([]);
  });
});
