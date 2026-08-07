/**
 * THE DELIVERY SEAM of the sensitive-data filter — the runtime's last net over the bytes a turn hands
 * to the user.
 *
 * A contract that declares `scrubTextFields` says free text is a place contact data drifts into. The
 * two seams before this one clean what the executor exchanges; this one cleans what the AGENT wrote —
 * the address it copied out of a result, the number the user typed and the prose repeated back — and
 * a contract that declares no free-text field delivers the prose byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '../src/index.js';
import type { AgentWorld, DomainContract } from '../src/index.js';
import { beginTurn, createActionHistory } from '../src/runtime/action-history.js';
import { composeDeliveryText, finalizeReply } from '../src/runtime/turn.js';
import type { ApprovalRequest } from '../src/runtime/approval-request.js';
import type { RespondPayload } from '../src/runtime/claims.js';

const BASE: DomainContract = {
  voice: 'You are the claims agent of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

/** The domain that named its free text: a claim description is prose, so it is scrubbed. */
const SCRUBBING: DomainContract = { ...BASE, scrubTextFields: ['fileClaim.description'] };
/** The same domain with nothing declared — the acceptance is authored, and it is this absence. */
const PLAIN: DomainContract = { ...BASE };

const APPROVAL: ApprovalRequest = {
  tool: 'cancelClaim',
  subject: 'CL-1',
  meaning: 'CL-1',
  token: 'CONFIRM CL-1',
  issuedTurn: 0,
};

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

describe('the composed delivery is the final net', () => {
  it('scrubs an address the prose picked up', () => {
    const text = composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], SCRUBBING);
    expect(text).not.toMatch(/@x\.example/);
    expect(text).toBe('I will write to ••• about it.\n\nNo operation was carried out on this turn.');
  });

  it('scrubs a phone number the user typed and the prose repeated', () => {
    const text = composeDeliveryText('Noted your number +1 415 555 0199.', [{ op: 'inform' }], [], SCRUBBING);
    expect(text).not.toContain('415');
    expect(text).toContain('Noted your number •••.');
  });

  it('leaves the prose untouched when the contract declares no free-text field', () => {
    const text = composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], PLAIN);
    expect(text).toBe('I will write to ops@x.example about it.\n\nNo operation was carried out on this turn.');
  });

  it('leaves the engine question and the operation record intact', () => {
    const text = composeDeliveryText('Reach me at ops@x.example.', [{ op: 'cancel', target: 'CL-2', outcome: 'success' }], [APPROVAL], SCRUBBING);
    expect(text).toBe(
      'Reach me at •••.\n\n' +
        'To confirm CL-1, reply: CONFIRM CL-1\n\n' +
        'CL-2: done\nNothing else was changed on this turn.',
    );
  });
});

describe('the delivered turn carries the scrubbed text', () => {
  const spec = () =>
    new AgentSpecBase({
      id: 'claims',
      mode: 'M',
      persona: 'You are the claims agent.',
      tools: ['fileClaim'],
      contract: SCRUBBING,
    });
  const payload = (message: string): RespondPayload => ({ message, did: [{ op: 'inform' }] });
  const noRedrive = async () => payload('unused');

  it('finalizeReply delivers prose whose contact data is gone', async () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'my email is ops@x.example');
    const finalized = await finalizeReply(
      spec(),
      SCRUBBING,
      fixtureWorld(),
      actionHistory,
      payload('I filed the claim and copied ops@x.example.'),
      noRedrive,
      1,
    );
    expect(finalized.text).not.toMatch(/@x\.example/);
    expect(finalized.text).toContain('I filed the claim and copied •••.');
  });
});
