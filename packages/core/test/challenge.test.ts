/**
 * THE CONSENT CHALLENGE — what its token is, what it licenses, and when it stops licensing.
 */
import { describe, it, expect } from 'vitest';
import {
  challengeMatchesCall,
  challengeToken,
  closeChallengesFor,
  consumeChallenges,
  deriveToken,
  type Challenge,
} from '../src/runtime/challenge.js';

const withRecord = (): Challenge => ({
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
});

const withLabel = (): Challenge => ({
  tool: 'deleteAllData',
  meaning: 'delete all of your data',
  token: 'CONFIRM DELETE-ALL',
  issuedTurn: 0,
});

describe('deriveToken', () => {
  it('takes the first two words, upper-cased and hyphen-joined', () => {
    expect(deriveToken('delete all of your data')).toBe('DELETE-ALL');
  });

  it('takes the whole meaning when it is a single word', () => {
    expect(deriveToken('BK-1')).toBe('BK-1');
  });

  it('ignores surrounding punctuation and extra spaces', () => {
    expect(deriveToken('  close   the account.  ')).toBe('CLOSE-THE');
  });
});

describe('challengeToken', () => {
  it('prefixes the derived part', () => {
    expect(challengeToken('delete all of your data')).toBe('CONFIRM DELETE-ALL');
  });
});

describe('challengeMatchesCall', () => {
  it('matches a record challenge when an arg carries the subject', () => {
    expect(challengeMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-1' })).toBe(true);
  });

  it('rejects a record challenge when the arg names another record', () => {
    expect(challengeMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-12' })).toBe(false);
  });

  it('rejects a record challenge on a different tool', () => {
    expect(challengeMatchesCall(withRecord(), 'deleteBooking', { id: 'BK-1' })).toBe(false);
  });

  it('matches a label challenge on the tool alone', () => {
    expect(challengeMatchesCall(withLabel(), 'deleteAllData', {})).toBe(true);
  });

  it('rejects a label challenge on a different tool', () => {
    expect(challengeMatchesCall(withLabel(), 'deleteBookings', {})).toBe(false);
  });
});

describe('consumeChallenges', () => {
  it('consumes the challenge whose token the user typed', () => {
    const open = [withRecord(), withLabel()];
    const consumed = consumeChallenges(open, 'yes, CONFIRM BK-1', 3);
    expect(consumed.map((c) => c.token)).toEqual(['CONFIRM BK-1']);
    expect(open[0]!.consumedTurn).toBe(3);
    expect(open[1]!.consumedTurn).toBeUndefined();
  });

  it('consumes nothing on a human yes that is not the token', () => {
    const open = [withRecord()];
    expect(consumeChallenges(open, 'go ahead', 3)).toEqual([]);
    expect(open[0]!.consumedTurn).toBeUndefined();
  });

  it('never consumes a challenge twice', () => {
    const open = [withRecord()];
    consumeChallenges(open, 'CONFIRM BK-1', 3);
    expect(consumeChallenges(open, 'CONFIRM BK-1', 4)).toEqual([]);
    expect(open[0]!.consumedTurn).toBe(3);
  });
});

describe('closeChallengesFor', () => {
  it('closes an open challenge on a record that changed', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-1');
    expect(open[0]!.closed).toBe(true);
  });

  it('leaves a challenge on another record open', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-2');
    expect(open[0]!.closed).toBeUndefined();
  });

  it('leaves a challenge that names no record open', () => {
    const open = [withLabel()];
    closeChallengesFor(open, 'BK-1');
    expect(open[0]!.closed).toBeUndefined();
  });

  it('never consumes a closed challenge', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-1');
    expect(consumeChallenges(open, 'CONFIRM BK-1', 3)).toEqual([]);
  });
});
