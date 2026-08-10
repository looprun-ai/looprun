/**
 * THE DISCLOSURE — one authored sentence per destructive tool, filled from the turn's own reads and
 * printed above that tool's consent question.
 */
import { describe, it, expect } from 'vitest';
import { renderDisclosure } from '../src/runtime/disclosure.js';
import { composeDeliveryText } from '../src/runtime/turn.js';
import { createActionHistory, recordToolResult, type TurnActionHistory } from '../src/runtime/action-history.js';
import type { ApprovalRequest } from '../src/runtime/approval-request.js';

const CONTRACT = {
  disclose: {
    retireAsset: { before: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out of the rentable fleet for good.' },
    updateMemberRole: { before: 'Promoting {getMember.member.name} to owner gives them billing control.' },
    purgeArchive: { before: 'Emptying the archive cannot be undone.' },
  },
};

const approvalFor = (tool: string, ...records: string[]): ApprovalRequest => ({
  tool,
  args: Object.fromEntries(records.map((r, i) => [`arg${i}`, r])),
  meaning: tool,
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
  it('fills a slot from the read whose result names a record the call carries', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_ltwr01'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.',
    );
  });

  it('binds to the record the CALL carries, not to the latest call of the same read', () => {
    const actionHistory = historyWith([
      { name: 'getMember', args: { memberId: 'mem_1004' }, result: { member: { id: 'mem_1004', name: 'Sam Whitfield' } } },
      { name: 'getMember', args: {}, result: { member: { id: 'mem_1001', name: 'Dana Okafor' } } },
    ]);
    expect(renderDisclosure(approvalFor('updateMemberRole', 'mem_1004'), CONTRACT, actionHistory)).toBe(
      'Promoting Sam Whitfield to owner gives them billing control.',
    );
  });

  // MECHANISM: the binding reads EVERY scalar of the call's args as a record, so a plain-word argument
  // (`role:'owner'`) counts as one. A read about a DIFFERENT person that happens to carry that word is
  // then a match too, and the LAST match wins — the sentence names the acting user instead of the
  // person acted on, in a privilege-escalation question. An `it.fails` here is the open vector; when
  // the binding closes it, this flips to a plain `it` and stays as the regression.
  it.fails('BREAK: a non-record arg value must not bind the slot to a read about someone else', () => {
    const actionHistory = historyWith([
      { name: 'getMember', args: { memberId: 'mem_1004' }, result: { member: { id: 'mem_1004', name: 'Sam Whitfield' } } },
      { name: 'getMember', args: {}, result: { member: { id: 'mem_1001', name: 'Dana Okafor', role: 'owner' } } },
    ]);
    const approval: ApprovalRequest = {
      tool: 'updateMemberRole',
      args: { memberId: 'mem_1004', role: 'owner' },
      meaning: 'updateMemberRole',
      token: 'CONFIRM X',
      issuedTurn: 0,
    };
    expect(renderDisclosure(approval, CONTRACT, actionHistory)).toBe(
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

  it('a SINGLE call of the read tool binds a slot on its own', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.',
    );
  });

  it('renders the placeholder when SEVERAL reads ran and none names a record of the call', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_a' }, result: { asset: { id: 'ast_a', name: 'A' } } },
      { name: 'getAsset', args: { assetId: 'ast_b' }, result: { asset: { id: 'ast_b', name: 'B' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_zzz'), CONTRACT, actionHistory)).toBe(
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
    const contract = { disclose: { retireAsset: { before: 'Retiring { getAsset.asset.id } is final; {} is not a slot.' } } };
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
    const contract = { disclose: { retireAsset: { before: 'Retiring {getAsset.asset} is final.' } } };
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_x' }, result: { asset: { id: 'ast_x' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), contract, actionHistory)).toBe('Retiring NA is final.');
  });
});

describe('the delivered text', () => {
  const approval: ApprovalRequest = {
    tool: 'retireAsset',
    args: { assetId: 'ast_ltwr01' },
    meaning: 'ast_ltwr01',
    token: 'CONFIRM AST_LTWR01',
    issuedTurn: 0,
  };

  it('prints the disclosure directly above the question it belongs to', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(
      composeDeliveryText('I have reviewed the record for ast_ltwr01.', [{ op: 'inform' }], [approval], actionHistory, CONTRACT),
    ).toBe(
      'I have reviewed the record for ast_ltwr01.\n\n' +
        'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.\n' +
        'To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01\n\n' +
        'No operation was carried out on this turn.',
    );
  });

  it('keeps a question whose tool the domain discloses nothing about', () => {
    const other: ApprovalRequest = { tool: 'cancelBooking', args: { bookingId: 'BK-1' }, meaning: 'a booking', token: 'CONFIRM CANCELBOOKING-0001', issuedTurn: 0 };
    const text = composeDeliveryText('One act is pending.', [{ op: 'inform' }], [other], createActionHistory(), CONTRACT);
    expect(text).toContain('To confirm a booking, reply: CONFIRM CANCELBOOKING-0001');
    expect(text).not.toContain('NA');
  });

  it('separates two disclosed acts with a blank line', () => {
    const second: ApprovalRequest = { tool: 'purgeArchive', meaning: 'the archive', token: 'CONFIRM THE-ARCHIVE', issuedTurn: 0 };
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    const text = composeDeliveryText('Pending.', [{ op: 'inform' }], [approval, second], actionHistory, CONTRACT);
    expect(text).toContain(
      'To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01\n\n'
        + 'Emptying the archive cannot be undone.\nTo confirm the archive, reply: CONFIRM THE-ARCHIVE',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `after` — the RESULT decides, not the call. A sentence is printed when the result carries a value
// for every slot it names; a refused call and an unmatched read leave the engine silent.
// ─────────────────────────────────────────────────────────────────────────────
describe('the sentence a call carries at the act', () => {
  const AFTER = {
    disclose: {
      payInvoice: { after: '{payInvoice.paid} recorded against {payInvoice.invoiceId}: {payInvoice.balanceDue} still due.' },
      getPlanUsage: { after: 'This workspace uses {getPlanUsage.seatsUsed} of {getPlanUsage.seatCap} seats.' },
    },
  };

  it('prints the sentence when the result fills every slot it names', () => {
    const actionHistory = historyWith([
      { name: 'payInvoice', args: { invoiceId: 'INV-1' }, result: { paid: 900, invoiceId: 'INV-1', balanceDue: 0 } },
    ]);
    expect(composeDeliveryText('Paid.', [{ op: 'pay', target: 'INV-1', outcome: 'success' }], [], actionHistory, AFTER))
      .toContain('900 recorded against INV-1: 0 still due.');
  });

  it('SAYS NOTHING when the call was refused — a slot that resolves to nothing is not a fact', () => {
    const actionHistory = historyWith([
      { name: 'payInvoice', args: { invoiceId: 'INV-1' }, result: { ok: false, error: 'ACCOUNT_HOLD' } },
    ]);
    const text = composeDeliveryText('It did not go through.', [{ op: 'pay', target: 'INV-1', outcome: 'blocked' }], [], actionHistory, AFTER);
    expect(text).not.toContain('recorded against');
    expect(text).not.toContain('NA');
  });

  it('A READ CARRIES ONE TOO — the only place the engine can speak on a turn that refuses', () => {
    const actionHistory = historyWith([
      { name: 'getPlanUsage', args: {}, result: { seatsUsed: 2, seatCap: 2, plan: 'starter' } },
    ]);
    expect(composeDeliveryText('No seats left.', [{ op: 'invite', outcome: 'blocked' }], [], actionHistory, AFTER))
      .toContain('This workspace uses 2 of 2 seats.');
  });
});
