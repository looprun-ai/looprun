/**
 * THE CONSENT APPROVAL REQUEST — what its literal licenses, and when it stops licensing.
 *
 * The licence IS the call: nothing about it is elected as its subject, so two calls that differ in any
 * argument are two acts asking two questions.
 */
import { describe, it, expect } from 'vitest';
import {
  approvalMatchesCall,
  closeApprovalsForCall,
  consumeApprovals,
  stripToLicensed,
  type ApprovalRequest,
} from '../src/runtime/approval-request.js';

const forCall = (tool: string, args: Record<string, unknown>): ApprovalRequest => ({
  tool,
  args,
  meaning: 'cancelling a dispatch',
  token: 'CONFIRM CANCELBOOKING-3F7A',
  issuedTurn: 0,
});

const toolOnly = (): ApprovalRequest => ({
  tool: 'deleteAllData',
  meaning: 'delete all of your data',
  token: 'CONFIRM DELETEALLDATA-A1B2',
  issuedTurn: 0,
});

describe('approvalMatchesCall', () => {
  it('licenses the same call', () => {
    expect(approvalMatchesCall(forCall('cancelBooking', { id: 'BK-1' }), 'cancelBooking', { id: 'BK-1' })).toBe(true);
  });

  it('does not reach a call on another record', () => {
    expect(approvalMatchesCall(forCall('cancelBooking', { id: 'BK-1' }), 'cancelBooking', { id: 'BK-12' })).toBe(false);
  });

  it('does not reach another tool', () => {
    expect(approvalMatchesCall(forCall('cancelBooking', { id: 'BK-1' }), 'deleteBooking', { id: 'BK-1' })).toBe(false);
  });

  it('does not reach a call that CHANGED an argument the user was shown', () => {
    const c = forCall('payInvoice', { invoiceId: 'inv_7001', amount: 2930 });
    expect(approvalMatchesCall(c, 'payInvoice', { invoiceId: 'inv_7001', amount: 500 })).toBe(false);
  });

  it('still licenses a call that ADDED an argument the user was never shown', () => {
    const c = forCall('payInvoice', { invoiceId: 'inv_7001', amount: 2930 });
    expect(approvalMatchesCall(c, 'payInvoice', { invoiceId: 'inv_7001', amount: 2930, idempotencyKey: 'CBBD' })).toBe(true);
  });

  it('ignores the order the arguments arrive in', () => {
    const c = forCall('payInvoice', { invoiceId: 'inv_7001', amount: 2930 });
    expect(approvalMatchesCall(c, 'payInvoice', { amount: 2930, invoiceId: 'inv_7001' })).toBe(true);
  });

  it('an approval that stored no call licenses its tool', () => {
    expect(approvalMatchesCall(toolOnly(), 'deleteAllData', { scope: 'everything' })).toBe(true);
  });
});

describe('stripToLicensed', () => {
  /** The approval whose literal is `CONFIRM PAYINVOICE-CBBD` — the code a model reads off the screen. */
  const paid = (): ApprovalRequest => ({
    tool: 'payInvoice',
    args: { invoiceId: 'inv_7001', amount: 2930 },
    meaning: 'recording a payment',
    token: 'CONFIRM PAYINVOICE-CBBD',
    issuedTurn: 0,
  });

  it('removes the literal the model copied into an argument', () => {
    const args: Record<string, unknown> = { invoiceId: 'inv_7001', amount: 2930, idempotencyKey: 'CBBD' };
    stripToLicensed([paid()], 'payInvoice', args);
    expect(args).toEqual({ invoiceId: 'inv_7001', amount: 2930 });
  });

  it("removes it whatever the model called the field, and whatever the case", () => {
    const args: Record<string, unknown> = { invoiceId: 'inv_7001', amount: 2930, reference: 'cbbd' };
    stripToLicensed([paid()], 'payInvoice', args);
    expect(args).toEqual({ invoiceId: 'inv_7001', amount: 2930 });
  });

  it("leaves a field the WORLD's own protocol needs — that is the domain speaking, not the model copying", () => {
    const args: Record<string, unknown> = { invoiceId: 'inv_7001', amount: 2930, confirmed: true };
    stripToLicensed([paid()], 'payInvoice', args);
    expect(args).toEqual({ invoiceId: 'inv_7001', amount: 2930, confirmed: true });
  });

  it('leaves a call no approval licenses exactly as it came', () => {
    const args: Record<string, unknown> = { invoiceId: 'inv_9999', reference: 'CBBD' };
    stripToLicensed([paid()], 'payInvoice', args);
    expect(args).toEqual({ invoiceId: 'inv_9999', reference: 'CBBD' });
  });
});

describe('consumeApprovals', () => {
  it('consumes the approval whose literal the user typed', () => {
    const open = [forCall('cancelBooking', { id: 'BK-1' })];
    expect(consumeApprovals(open, 'yes — CONFIRM CANCELBOOKING-3F7A', 2)).toHaveLength(1);
    expect(open[0].consumedTurn).toBe(2);
  });

  it('licenses one act per typed literal', () => {
    const open = [forCall('cancelBooking', { id: 'BK-1' })];
    consumeApprovals(open, 'CONFIRM CANCELBOOKING-3F7A', 2);
    expect(consumeApprovals(open, 'CONFIRM CANCELBOOKING-3F7A', 3)).toHaveLength(0);
  });

  it('never consumes a closed approval', () => {
    const open = [{ ...forCall('cancelBooking', { id: 'BK-1' }), closed: true }];
    expect(consumeApprovals(open, 'CONFIRM CANCELBOOKING-3F7A', 2)).toHaveLength(0);
  });
});

describe('closeApprovalsForCall', () => {
  it('closes the question about a call that took effect', () => {
    const open = [forCall('cancelBooking', { id: 'BK-1' })];
    closeApprovalsForCall(open, 'cancelBooking', { id: 'BK-1' });
    expect(open[0].closed).toBe(true);
  });

  it('leaves the question about another call open', () => {
    const open = [forCall('cancelBooking', { id: 'BK-1' })];
    closeApprovalsForCall(open, 'cancelBooking', { id: 'BK-2' });
    expect(open[0].closed).toBeUndefined();
  });

  it('leaves an approval that stored no call open', () => {
    const open = [toolOnly()];
    closeApprovalsForCall(open, 'deleteAllData', { scope: 'everything' });
    expect(open[0].closed).toBeUndefined();
  });
});
