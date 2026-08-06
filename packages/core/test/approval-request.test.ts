/**
 * THE CONSENT APPROVAL REQUEST — what its token is, what it licenses, and when it stops licensing.
 */
import { describe, it, expect } from 'vitest';
import {
  approvalMatchesCall,
  approvalCode,
  closeApprovalsFor,
  consumeApprovals,
  deriveToken,
  type ApprovalRequest,
} from '../src/runtime/approval-request.js';

const withRecord = (): ApprovalRequest => ({
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
});

const withLabel = (): ApprovalRequest => ({
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

describe('approvalCode', () => {
  it('prefixes the derived part', () => {
    expect(approvalCode('delete all of your data')).toBe('CONFIRM DELETE-ALL');
  });
});

describe('approvalMatchesCall', () => {
  it('matches a record approval when an arg carries the subject', () => {
    expect(approvalMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-1' })).toBe(true);
  });

  it('rejects a record approval when the arg names another record', () => {
    expect(approvalMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-12' })).toBe(false);
  });

  it('rejects a record approval on a different tool', () => {
    expect(approvalMatchesCall(withRecord(), 'deleteBooking', { id: 'BK-1' })).toBe(false);
  });

  it('matches a label approval on the tool alone', () => {
    expect(approvalMatchesCall(withLabel(), 'deleteAllData', {})).toBe(true);
  });

  it('rejects a label approval on a different tool', () => {
    expect(approvalMatchesCall(withLabel(), 'deleteBookings', {})).toBe(false);
  });
});

describe('consumeApprovals', () => {
  it('consumes the approval whose token the user typed', () => {
    const open = [withRecord(), withLabel()];
    const consumed = consumeApprovals(open, 'yes, CONFIRM BK-1', 3);
    expect(consumed.map((c) => c.token)).toEqual(['CONFIRM BK-1']);
    expect(open[0]!.consumedTurn).toBe(3);
    expect(open[1]!.consumedTurn).toBeUndefined();
  });

  it('consumes nothing on a human yes that is not the token', () => {
    const open = [withRecord()];
    expect(consumeApprovals(open, 'go ahead', 3)).toEqual([]);
    expect(open[0]!.consumedTurn).toBeUndefined();
  });

  it('never consumes an approval request twice', () => {
    const open = [withRecord()];
    consumeApprovals(open, 'CONFIRM BK-1', 3);
    expect(consumeApprovals(open, 'CONFIRM BK-1', 4)).toEqual([]);
    expect(open[0]!.consumedTurn).toBe(3);
  });
});

describe('closeApprovalsFor', () => {
  it('closes an open approval on a record that changed', () => {
    const open = [withRecord()];
    closeApprovalsFor(open, 'BK-1');
    expect(open[0]!.closed).toBe(true);
  });

  it('leaves an approval request on another record open', () => {
    const open = [withRecord()];
    closeApprovalsFor(open, 'BK-2');
    expect(open[0]!.closed).toBeUndefined();
  });

  it('leaves an approval request that names no record open', () => {
    const open = [withLabel()];
    closeApprovalsFor(open, 'BK-1');
    expect(open[0]!.closed).toBeUndefined();
  });

  it('never consumes a closed approval', () => {
    const open = [withRecord()];
    closeApprovalsFor(open, 'BK-1');
    expect(consumeApprovals(open, 'CONFIRM BK-1', 3)).toEqual([]);
  });
});
