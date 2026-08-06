/**
 * THE VETO IS THE QUESTION — a denied destructive call raises the approval about the record the
 * call itself names; the spec's label is the fallback for a call that names none; a tool with
 * neither can never be consented to.
 */
import { describe, it, expect } from 'vitest';
import { createActionHistory, issueApprovalForVeto } from '../src/runtime/action-history.js';
import { approvalMatchesCall, consumeApprovals } from '../src/runtime/approval-request.js';

describe('issueApprovalForVeto — the denial raises the question about the record the call names', () => {
  it('derives the subject from the call arguments', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBe('cust_2001');
  });

  it('the issued approval licenses the same call once its code is typed', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    const consumed = consumeApprovals(h.approvals, h.approvals[0].token, 1);
    expect(consumed).toHaveLength(1);
    expect(approvalMatchesCall(consumed[0], 'unsubscribeCustomer', { customerId: 'cust_2001' })).toBe(true);
  });

  it('falls back to the declared label when the call names no record', () => {
    const h = createActionHistory();
    h.destructiveLabels = { purgeAllLogs: 'purge all system logs' };
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBeUndefined();
  });

  it('the record wins over the label when both exist', () => {
    const h = createActionHistory();
    h.destructiveLabels = { unsubscribeCustomer: 'unsubscribe a customer' };
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals[0].subject).toBe('cust_2001');
  });

  it('issues nothing when there is neither record nor label', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals).toHaveLength(0);
  });
});
