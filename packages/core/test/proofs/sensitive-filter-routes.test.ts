/**
 * THE SENSITIVE-DATA FILTER, and the one place it is NOT allowed to run.
 *
 * Two shapes of removal, both pure and both on our side of the executor boundary: a DECLARED field is
 * omitted or masked wherever its dot-suffix path matches, and free text is PATTERN-scrubbed for the
 * contact data that drifts into prose. The delivery is the last net, and it runs over AUTHORED prose
 * only — the engine's own blocks are composed from the already-filtered record, and a record id shaped
 * like a phone number must stay typeable:
 *
 * ```
 *   scrubbed as a whole:  'To confirm •••, reply: CONFIRM •••'          nobody can ever confirm this
 *   authored prose only:  'To confirm 2026-0801-77, reply: CONFIRM 2026-0801-77'
 * ```
 */
import { describe, it, expect } from 'vitest';
import type { DomainContract } from '../../src/assembled-prompt.js';
import { filterSensitiveFields, scrubText } from '../../src/internal.js';
import { composeDeliveryText } from '../../src/runtime/turn.js';
import type { ApprovalRequest } from '../../src/runtime/approval-request.js';

const BASE: DomainContract = {
  voice: 'You are the claims agent of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};
/** The domain that named its free text — a claim description is prose, so it is scrubbed. */
const SCRUBBING: DomainContract = { ...BASE, scrubTextFields: ['fileClaim.description'] };
/** The same domain with nothing declared: the acceptance is authored, and it is this absence. */
const PLAIN: DomainContract = { ...BASE };

/** A record id with the shape of a phone number: separator-joined digit groups. */
const DIGIT_ID = '2026-0801-77';
const APPROVAL: ApprovalRequest = {
  tool: 'cancelClaim',
  subject: DIGIT_ID,
  meaning: DIGIT_ID,
  token: `CONFIRM ${DIGIT_ID}`,
  issuedTurn: 0,
};

describe('a declared field, wherever it sits', () => {
  it('positive — omits and masks by dot-suffix path at any depth', () => {
    const filtered = filterSensitiveFields(
      { rows: [{ customer: { phone: '+1 415 555 0199', email: 'ops@x.example', name: 'Ana' } }] },
      { 'customer.phone': 'omit', email: 'mask' },
    );
    expect(filtered).toEqual({ rows: [{ customer: { email: 'o•••@x.example', name: 'Ana' } }] });
  });

  it('negative — a path that does not END the field path leaves the value in place', () => {
    const filtered = filterSensitiveFields({ customer: { phone: '+1 415 555 0199' } }, { 'supplier.phone': 'omit' });
    expect(filtered).toEqual({ customer: { phone: '+1 415 555 0199' } });
  });

  it('neutral — a contract declaring no field gets its own value back', () => {
    const value = { customer: { phone: '+1 415 555 0199' } };
    expect(filterSensitiveFields(value, {})).toEqual(value);
  });
});

describe('free text, where nobody named the field', () => {
  it('positive — an email, a card and a phone shape each mask', () => {
    expect(scrubText('mail ops@x.example, card 4242 4242 4242 4242, call +1 415 555 0199')).toBe(
      'mail •••, card •••, call •••',
    );
  });

  it('negative — a run of digits that names no contact stays whole', () => {
    expect(scrubText('invoice inv_7001 total 2930 on 2026-08-03')).toBe('invoice inv_7001 total 2930 on 2026-08-03');
  });

  it('neutral — prose with nothing to remove comes back byte for byte', () => {
    const text = 'The claim is filed and the adjuster will follow up.';
    expect(scrubText(text)).toBe(text);
  });
});

describe('the delivery net runs on authored prose and nothing else', () => {
  it('positive — the model prose loses the address it picked up', () => {
    expect(composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], SCRUBBING)).toBe(
      'I will write to ••• about it.\n\nNo operation was carried out on this turn.',
    );
  });

  it('negative — the engine question and the record line stay verbatim', () => {
    const text = composeDeliveryText(
      'Call me on +1 415 555 0199.',
      [{ op: 'cancel', target: DIGIT_ID, outcome: 'success' }],
      [APPROVAL],
      SCRUBBING,
    );
    expect(text).toBe(
      'Call me on •••.\n\n' +
        `To confirm ${DIGIT_ID}, reply: CONFIRM ${DIGIT_ID}\n\n` +
        `${DIGIT_ID}: done\nNothing else was changed on this turn.`,
    );
  });

  it('neutral — a contract that declared no free-text field delivers the prose untouched', () => {
    expect(composeDeliveryText('I will write to ops@x.example about it.', [{ op: 'inform' }], [], PLAIN)).toBe(
      'I will write to ops@x.example about it.\n\nNo operation was carried out on this turn.',
    );
  });
});
