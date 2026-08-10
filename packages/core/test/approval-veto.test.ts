/**
 * THE VETO IS THE QUESTION — a denied destructive call raises the approval about the CALL itself.
 * Nothing about the call is elected as its subject, so two calls that differ in any argument are two
 * acts and ask two literals.
 */
import { describe, it, expect } from 'vitest';
import { createActionHistory, issueApprovalForVeto } from '../src/runtime/action-history.js';
import { approvalMatchesCall, consumeApprovals } from '../src/runtime/approval-request.js';

describe('issueApprovalForVeto — the denial raises the question about the call', () => {
  it('stores the call the agent made', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].args).toEqual({ customerId: 'cust_2001' });
  });

  it('the literal carries the tool name, so no two tools ever ask for the same one', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    issueApprovalForVeto(h, 'deleteCustomer', { customerId: 'cust_2001' });
    expect(h.approvals[0].token).toMatch(/^CONFIRM UNSUBSCRIBECUSTOMER-[0-9A-F]{4}$/);
    expect(h.approvals[1].token).toMatch(/^CONFIRM DELETECUSTOMER-[0-9A-F]{4}$/);
  });

  it('two calls of the SAME tool on different records ask two different literals', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2002' });
    expect(h.approvals).toHaveLength(2);
    expect(h.approvals[0].token).not.toBe(h.approvals[1].token);
  });

  it('the same call twice asks once — one act asks one question until it is answered', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals).toHaveLength(1);
  });

  it('the issued approval licenses the same call once its literal is typed', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    const consumed = consumeApprovals(h.approvals, h.approvals[0].token, 1);
    expect(consumed).toHaveLength(1);
    expect(approvalMatchesCall(consumed[0], 'unsubscribeCustomer', { customerId: 'cust_2001' })).toBe(true);
  });

  it('the question is worded with the declared label', () => {
    const h = createActionHistory();
    h.destructiveLabels = { purgeAllLogs: 'purge all system logs' };
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals[0].meaning).toBe('purge all system logs');
  });

  it('a tool with no declared label still asks an answerable question', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].meaning).toBe('purgeAllLogs');
  });
});
