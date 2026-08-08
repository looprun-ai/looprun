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

/** No reads happened — a delivery composed over an empty conversation. */
const NO_READS = createActionHistory();

const BASE: DomainContract = {
  voice: 'You are the claims agent of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

/** The domain that named its free text: a claim description is prose, so it is scrubbed. */
const SCRUBBING: DomainContract = { ...BASE, scrubTextFields: ['fileClaim.description'] };
/** The same domain, closing an exhausted turn in its own words — words that carry an address. */
const CLOSING: DomainContract = {
  ...SCRUBBING,
  exhaustionReply: () => 'I could not finish this. Write to ops@x.example and we will pick it up.',
};
/** The same domain with nothing declared — the acceptance is authored, and it is this absence. */
const PLAIN: DomainContract = { ...BASE };

const APPROVAL: ApprovalRequest = {
  tool: 'cancelClaim',
  subject: 'CL-1',
  meaning: 'CL-1',
  token: 'CONFIRM CL-1',
  issuedTurn: 0,
};

/** A record id with the shape a phone number has: separator-joined digit groups. The user must be able
 *  to type this back exactly, so the engine's question and record carry it as stored. */
const DIGIT_ID = '2026-0801-77';
const DIGIT_APPROVAL: ApprovalRequest = {
  tool: 'cancelClaim',
  subject: DIGIT_ID,
  meaning: DIGIT_ID,
  token: `CONFIRM ${DIGIT_ID}`,
  issuedTurn: 0,
};

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

describe('the composed delivery is the final net', () => {
  it('scrubs an address the prose picked up', () => {
    const text = composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], NO_READS, SCRUBBING);
    expect(text).not.toMatch(/@x\.example/);
    expect(text).toBe('I will write to ••• about it.\n\nNo operation was carried out on this turn.');
  });

  it('scrubs a phone number the user typed and the prose repeated', () => {
    const text = composeDeliveryText('Noted your number +1 415 555 0199.', [{ op: 'inform' }], [], NO_READS, SCRUBBING);
    expect(text).not.toContain('415');
    expect(text).toContain('Noted your number •••.');
  });

  it('leaves the prose untouched when the contract declares no free-text field', () => {
    const text = composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], NO_READS, PLAIN);
    expect(text).toBe('I will write to ops@x.example about it.\n\nNo operation was carried out on this turn.');
  });

  it('leaves the engine question and the operation record intact', () => {
    const text = composeDeliveryText('Reach me at ops@x.example.', [{ op: 'cancel', target: 'CL-2', outcome: 'success' }], [APPROVAL], NO_READS, SCRUBBING);
    expect(text).toBe(
      'Reach me at •••.\n\n' +
        'To confirm CL-1, reply: CONFIRM CL-1\n\n' +
        'CL-2: done\nNothing else was changed on this turn.',
    );
  });

  it('keeps a question whose record id is shaped like a phone number typeable', () => {
    const text = composeDeliveryText('Call me on +1 415 555 0199.', [{ op: 'inform' }], [DIGIT_APPROVAL], NO_READS, SCRUBBING);
    // The token the user must type back is stored literally, and consent matches that literal — a
    // question delivered with the id scrubbed names an act nobody can ever confirm.
    expect(text).toContain(`To confirm ${DIGIT_ID}, reply: CONFIRM ${DIGIT_ID}`);
    expect(text).toContain('Call me on •••.');
  });

  it('keeps a record line whose subject is shaped like a phone number', () => {
    const text = composeDeliveryText(
      'Also reach me on +1 415 555 0199.',
      [{ op: 'cancel', target: DIGIT_ID, outcome: 'success' }],
      [],
      NO_READS,
      SCRUBBING,
    );
    expect(text).toBe(
      'Also reach me on •••.\n\n' +
        `${DIGIT_ID}: done\nNothing else was changed on this turn.`,
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

  it('the exhaustion closure passes through the same net', async () => {
    const spec = new AgentSpecBase({
      id: 'claims',
      mode: 'M',
      persona: 'You are the claims agent.',
      tools: ['fileClaim'],
      contract: CLOSING,
    });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'file it');
    // A payload declaring NO intention violates the declaration floor on every pass, so the redrive
    // exhausts and the turn closes in the domain's own sentence.
    const undeclared: RespondPayload = { message: 'Filed.', did: [] };
    const finalized = await finalizeReply(spec, CLOSING, fixtureWorld(), actionHistory, undeclared, async () => undeclared, 1);
    expect(finalized.exhausted).toBe(true);
    expect(finalized.text).not.toMatch(/@x\.example/);
    expect(finalized.text).toBe(
      'No operation was carried out on this turn.\n\nI could not finish this. Write to ••• and we will pick it up.',
    );
  });
});
