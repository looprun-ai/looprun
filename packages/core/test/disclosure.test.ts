/**
 * THE DISCLOSURE — one authored sentence per destructive tool, filled from the turn's own reads and
 * printed above that tool's consent question.
 */
import { describe, it, expect } from 'vitest';
import { renderDisclosure } from '../src/runtime/disclosure.js';
import { createActionHistory, recordToolResult, type TurnActionHistory } from '../src/runtime/action-history.js';
import type { ApprovalRequest } from '../src/runtime/approval-request.js';

const CONTRACT = {
  disclose: {
    retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out of the rentable fleet for good.',
    updateMemberRole: 'Promoting {getMember.member.name} to owner gives them billing control.',
    purgeArchive: 'Emptying the archive cannot be undone.',
  },
};

const approvalFor = (tool: string, subject?: string): ApprovalRequest => ({
  tool,
  ...(subject !== undefined ? { subject } : {}),
  meaning: subject ?? tool,
  token: 'CONFIRM X',
  issuedTurn: 0,
});

/** An action history whose observed rows are written by the SAME hook the runtime uses, and with no
 *  world — the shape a self-executing tool leaves behind. */
function historyWith(calls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>): TurnActionHistory {
  const actionHistory = createActionHistory();
  for (const c of calls) recordToolResult(actionHistory, c.name, c.args, c.result);
  return actionHistory;
}

describe('renderDisclosure', () => {
  it('fills a slot from the read whose result names the subject', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_ltwr01'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.',
    );
  });

  it('binds to the SUBJECT, not to the latest call of the same read', () => {
    const actionHistory = historyWith([
      { name: 'getMember', args: { memberId: 'mem_1004' }, result: { member: { id: 'mem_1004', name: 'Sam Whitfield' } } },
      { name: 'getMember', args: {}, result: { member: { id: 'mem_1001', name: 'Dana Okafor' } } },
    ]);
    expect(renderDisclosure(approvalFor('updateMemberRole', 'mem_1004'), CONTRACT, actionHistory)).toBe(
      'Promoting Sam Whitfield to owner gives them billing control.',
    );
  });

  it('renders the placeholder when the bound result carries no value at the path', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: null } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_ltwr01'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('renders every slot as the placeholder when the approval names no record', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset'), CONTRACT, actionHistory)).toBe(
      'Retiring NA (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('honours a domain-declared placeholder', () => {
    const actionHistory = createActionHistory();
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), { ...CONTRACT, discloseMissing: '—' }, actionHistory)).toBe(
      'Retiring — (—) takes it out of the rentable fleet for good.',
    );
  });

  it('renders a malformed brace literally', () => {
    const contract = { disclose: { retireAsset: 'Retiring { getAsset.asset.id } is final; {} is not a slot.' } };
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), contract, createActionHistory())).toBe(
      'Retiring { getAsset.asset.id } is final; {} is not a slot.',
    );
  });

  it('renders a slotless sentence unchanged', () => {
    expect(renderDisclosure(approvalFor('purgeArchive'), CONTRACT, createActionHistory())).toBe(
      'Emptying the archive cannot be undone.',
    );
  });

  it('returns null when the tool has no entry', () => {
    expect(renderDisclosure(approvalFor('cancelBooking', 'BK-1'), CONTRACT, createActionHistory())).toBeNull();
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), undefined, createActionHistory())).toBeNull();
  });

  it('ignores a FAILED read — a refusal grounds no slot', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_x' }, result: { error: 'FROZEN', asset: { id: 'ast_x', name: 'Ghost' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), CONTRACT, actionHistory)).toBe(
      'Retiring NA (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('renders the placeholder when the path lands on a record rather than a value', () => {
    const contract = { disclose: { retireAsset: 'Retiring {getAsset.asset} is final.' } };
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_x' }, result: { asset: { id: 'ast_x' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), contract, actionHistory)).toBe('Retiring NA is final.');
  });
});
