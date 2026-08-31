import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, test } from 'vitest';
import { checkAgainstSurface, readDeclaration, writeCards } from '../src/index.js';
import { FACTS, SEAM } from './helpers.js';

function fixture(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'emit-declaration-'));
  const path = join(dir, 'declaration.yaml');
  writeFileSync(path, yaml, 'utf8');
  return path;
}

/** The six voices as the lines of a desk's `conduct` map, indented for a desk of the `desks`
 *  sequence. Every desk of a house of two or more states all six, so a fixture pairing two desks
 *  writes these lines under each of them. */
const SIX_VOICES = [
  'declareHonestly: Say what ran and what did not.',
  'oneQuestion: Put ONE thing up for agreement per turn.',
  'yourLaneYourReads: Answer from the reads this desk can run.',
  'recordsOverAssertions: Say what the read returned, never what you recall.',
  'askBeforeYouChoose: Ask before you choose on the operator\'s behalf.',
  'nameItDoNotPassItOn: Name what this desk cannot do, and never hand it on in silence.'
].map(line => `      ${line}`).join('\n');

describe('readDeclaration', () => {
  test('it reads a desk and its conduct laws', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: ['Check-in is from 15:00.']
  guards: []
  disclosure: {}
desks:
  - name: front-desk
    persona: The front desk.
    tools: [getBooking, moveBooking]
    conduct:
      declareHonestly: Say what ran and what did not.
`));
    expect(d.desks[0].tools).toEqual(['getBooking', 'moveBooking']);
    expect(d.desks[0].conduct.declareHonestly).toBe('Say what ran and what did not.');
  });

  test('a needs alias is the read alone, or the read and the args it is answered from', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    cancelBooking:
      needs:
        booking: getBooking
        freezes: { tool: listHolds, args: {} }
        room: { tool: getRoom, args: { roomId: bookingRoomId } }
      before: Cancelling this booking cannot be taken back.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [cancelBooking]
    conduct:
      declareHonestly: Say what ran and what did not.
`));
    expect(d.contract.disclosure.cancelBooking.needs).toEqual({
      booking: 'getBooking',
      freezes: { tool: 'listHolds', args: {} },
      room: { tool: 'getRoom', args: { roomId: 'bookingRoomId' } }
    });
  });

  test('a needs pick rides through the reader with its three strings', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    releaseHold:
      needs:
        hold: { tool: listHolds, args: {}, pick: { list: holds, by: id, key: holdId } }
      before: Lifting {args.holdId}, placed for {hold.reason}, cannot be taken back.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [releaseHold]
    conduct:
      declareHonestly: Say what ran and what did not.
`));
    expect(d.contract.disclosure.releaseHold.needs).toEqual({
      hold: { tool: 'listHolds', args: {},
              pick: { list: 'holds', by: 'id', key: 'holdId' } }
    });
  });

  test('a needs alias in the full form states the read it names', () => {
    expect(() => readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: v
  facts: []
  guards: []
  disclosure:
    cancelBooking:
      needs:
        freezes: { args: {} }
      before: b
desks:
  - name: front-desk
    persona: p
    tools: [cancelBooking]
    conduct: { declareHonestly: x }
`))).toThrow(/disclosure\.cancelBooking\.needs\.freezes\.tool.*is required/);
  });

  test('a prose guard is read with the acts its sentence is stamped on', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: v
  facts: []
  guards:
    - name: roleRefusalNamesWhoCan
      acts: [cancelBooking, moveBooking]
      factory: prose
      rule: Name the role the record states, then a member whose role can act.
  disclosure: {}
desks:
  - name: front-desk
    persona: p
    tools: [cancelBooking]
    conduct: { declareHonestly: x }
`));
    expect(d.contract.guards[0].factory).toBe('prose');
    expect(d.contract.guards[0].acts).toEqual(['cancelBooking', 'moveBooking']);
    expect(d.contract.guards[0].rule)
      .toBe('Name the role the record states, then a member whose role can act.');
  });

  test('it reads the rewrites, the wording, the standing tenses and a desk\'s judged checks', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: v
  facts: []
  guards:
    - name: 'seam:cardNumber'
      acts: [cancelBooking]
      factory: blockPattern
      args: { pattern: '[0-9]{13,19}', on: reply }
      rule: A card number never goes out in a reply.
  disclosure:
    cancelBooking:
      before: Cancelling this booking cannot be taken back.
      later: The cancelled booking is still the open piece of this stay.
      empty: This booking carries no nights to release.
  rewrites:
    - kind: maskPattern
      name: taxNumber
      pattern: '[A-Z]{2}[0-9]{9}'
    - kind: swapTerms
      terms: { invoice: statement }
  wording:
    status: { held: waiting on you }
    sentence: { deniedByGuard: A rule of this house stopped that. }
desks:
  - name: front-desk
    persona: p
    tools: [cancelBooking]
    conduct: { declareHonestly: x }
    judged:
      - factory: injectionCheck
        acts: [cancelBooking]
`));
    expect(d.contract.guards[0].args).toEqual({ pattern: '[0-9]{13,19}', on: 'reply' });
    expect(d.contract.disclosure.cancelBooking.later)
      .toBe('The cancelled booking is still the open piece of this stay.');
    expect(d.contract.disclosure.cancelBooking.empty).toBe('This booking carries no nights to release.');
    expect(d.contract.rewrites).toEqual([
      { kind: 'maskPattern', name: 'taxNumber', pattern: '[A-Z]{2}[0-9]{9}' },
      { kind: 'swapTerms', terms: { invoice: 'statement' } }
    ]);
    expect(d.contract.wording).toEqual({ status: { held: 'waiting on you' },
      sentence: { deniedByGuard: 'A rule of this house stopped that.' } });
    expect(d.desks[0].judged).toEqual([{ factory: 'injectionCheck', acts: ['cancelBooking'] }]);
  });

  test('a rewrite kind and a judged factory the engine does not carry name their line', () => {
    const withTail = (tail: string): string => `
contract: { name: x, voice: v, facts: [], guards: [], disclosure: {} }
desks:
  - name: front-desk
    persona: p
    tools: [getBooking]
    conduct: { declareHonestly: x }
${tail}`;
    expect(() => readDeclaration(fixture(withTail(`    judged:
      - factory: toneCheck
        acts: [getBooking]
`)))).toThrow(/desks\[0\]\.judged\[0\]\.factory.*must be one of injectionCheck/);
    expect(() => readDeclaration(fixture(`
contract:
  name: x
  voice: v
  facts: []
  guards: []
  disclosure: {}
  rewrites:
    - kind: trimPattern
      name: n
      pattern: p
desks:
  - name: front-desk
    persona: p
    tools: [getBooking]
    conduct: { declareHonestly: x }
`))).toThrow(/contract\.rewrites\[0\]\.kind.*must be one of maskPattern/);
  });

  test('a desk with no conduct is an error naming the line', () => {
    expect(() => readDeclaration(fixture(`
contract: { name: x, voice: v, facts: [], guards: [], disclosure: {} }
desks:
  - name: front-desk
    persona: p
    tools: [getBooking]
`))).toThrow(/desks\[0\].*conduct/);
  });
});

describe('description', () => {
  it('description survives the round trip on a multi-desk declaration', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure: {}
desks:
  - name: billing
    persona: The billing desk.
    tools: [getInvoice]
    conduct: { declareHonestly: x }
    description: quotes and bookings
    summary: the desk
  - name: audit
    persona: The audit desk.
    tools: [closeBooking]
    conduct: { declareHonestly: x }
    description: invoices and refunds
    summary: the desk
`));
    expect(d.desks[0].description).toBe('quotes and bookings');
    expect(d.desks[1].description).toBe('invoices and refunds');
    const out = writeCards(d, FACTS);
    expect(out).toContain("description: 'quotes and bookings',");
    expect(out).toContain("summary: 'the desk',");
    expect(out).toContain("description: 'invoices and refunds',");
  });

  it('a multi-desk declaration missing description refuses at emit', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: billing
    persona: The billing desk.
    tools: [getInvoice]
    conduct:
${SIX_VOICES}
    description: quotes and bookings
    summary: the desk
  - name: audit
    persona: The audit desk.
    tools: [closeBooking]
    conduct:
${SIX_VOICES}
`));
    expect(checkAgainstSurface(d, FACTS, SEAM))
      .toEqual([expect.stringContaining("'audit'")]);
  });

  it('a single-desk declaration carrying description refuses as unreachable words', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [getInvoice]
    conduct: { declareHonestly: x }
    description: quotes and bookings
    summary: the desk
`));
    expect(checkAgainstSurface(d, FACTS, SEAM))
      .toEqual([expect.stringContaining("'front-desk'")]);
  });
});

describe('the six voices', () => {
  const house = (secondConduct: string): string => `
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: billing
    persona: The billing desk.
    tools: [getInvoice]
    conduct:
${SIX_VOICES}
    description: quotes and bookings
    summary: the desk
  - name: audit
    persona: The audit desk.
    tools: [closeBooking]
    conduct:
${secondConduct}
    description: invoices and refunds
    summary: the desk
`;

  it('a desk of a two-desk house teaching five voices emits — the sentences are the author\'s', () => {
    const withoutRecords = SIX_VOICES.split('\n')
      .filter(line => !line.includes('recordsOverAssertions')).join('\n');
    const d = readDeclaration(fixture(house(withoutRecords)));
    expect(checkAgainstSurface(d, FACTS, SEAM)).toEqual([]);
  });

  it('a single-desk declaration missing five voices is refused none of them', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`));
    expect(checkAgainstSurface(d, FACTS, SEAM)).toEqual([]);
  });

  it('a two-desk house where every desk teaches all six is accepted', () => {
    const d = readDeclaration(fixture(house(SIX_VOICES)));
    expect(checkAgainstSurface(d, FACTS, SEAM)).toEqual([]);
  });
});

test('the seam section reads as act, code, sentence', () => {
  const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure: {}
  seam:
    issueRefund:
      INVOICE_SETTLED: An invoice already settled takes no refund.
      stateIs:status: The status the read returned is the one that refuses this.
desks:
  - name: billing
    persona: The billing desk.
    tools: [issueRefund]
    conduct: { declareHonestly: Say what ran and what did not. }
`));
  expect(d.contract.seam).toEqual({ issueRefund: {
    INVOICE_SETTLED: 'An invoice already settled takes no refund.',
    'stateIs:status': 'The status the read returned is the one that refuses this.' } });
});

test('a seam act whose value is not a mapping fails at its own path and line', () => {
  expect(() => readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure: {}
  seam:
    issueRefund: a sentence with no code
desks:
  - name: billing
    persona: The billing desk.
    tools: [issueRefund]
    conduct: { declareHonestly: Say what ran and what did not. }
`))).toThrow(/contract\.seam\.issueRefund \(line \d+\): must be a mapping of refusal code/);
});

describe('the after tense speaks the result', () => {
  const withAfter = (after: string): string => `
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      needs: { invoice: getInvoice }
      before: Refunding this invoice cannot be taken back.
      after: ${after}
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [issueRefund, getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`;

  it('an after with no result slot is refused by its own path', () => {
    const d = readDeclaration(fixture(withAfter('The refund is recorded against this invoice.')));
    const refusals = checkAgainstSurface(d, FACTS, SEAM);
    expect(refusals).toEqual([expect.stringContaining('contract.disclosure.issueRefund.after')]);
    expect(refusals[0]).toContain('{result.');
  });

  it('an after built only from the reads and the held args is refused too', () => {
    const d = readDeclaration(fixture(withAfter('The refund of {invoice.invoiceId} is recorded.')));
    expect(checkAgainstSurface(d, FACTS, SEAM))
      .toEqual([expect.stringContaining('contract.disclosure.issueRefund.after')]);
  });

  it('an after naming a field the result carries is accepted', () => {
    const d = readDeclaration(fixture(withAfter('The refund on {result.removed} is recorded.')));
    expect(checkAgainstSurface(d, FACTS, SEAM)).toEqual([]);
  });
});

describe('a value check binds a required argument', () => {
  /** A surface whose destructive act declares two arguments and requires one of them: a call may
   *  arrive with `note` left out, and may never arrive without `invoiceId`. */
  const REQUIRING = { tools: {
    ...(FACTS as never as { tools: Record<string, unknown> }).tools,
    issueRefund: { name: 'issueRefund', effect: 'destructive', target: 'invoiceId',
                   entity: 'invoices',
                   schema: { properties: { invoiceId: {}, note: {} }, required: ['invoiceId'] } }
  } } as never;

  const withValueCheck = (arg: string): string => `
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards:
    - name: refundAsTheGuestWroteIt
      acts: [issueRefund]
      factory: valueFromUser
      args: { arg: ${arg} }
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [issueRefund, getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`;

  it('a value check on an argument the act leaves optional is refused, naming both', () => {
    const d = readDeclaration(fixture(withValueCheck('note')));
    const refusals = checkAgainstSurface(d, REQUIRING, SEAM);
    expect(refusals).toEqual([expect.stringContaining('contract.guards[0].args.arg')]);
    expect(refusals[0]).toContain("'note'");
    expect(refusals[0]).toContain("'issueRefund'");
  });

  it('a value check on an argument the act requires is accepted', () => {
    const d = readDeclaration(fixture(withValueCheck('invoiceId')));
    expect(checkAgainstSurface(d, REQUIRING, SEAM)).toEqual([]);
  });
});

describe('the empty sentence stays fillable', () => {
  const withEmpty = (empty: string): string => `
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards: []
  disclosure:
    issueRefund:
      needs: { invoice: getInvoice }
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
      empty: ${empty}
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: front-desk
    persona: The front desk.
    tools: [issueRefund, getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`;

  it('an empty sentence rooted on a read the entry owes is refused, naming the alias', () => {
    const d = readDeclaration(fixture(withEmpty('This invoice carries no {invoice.total} to refund.')));
    const refusals = checkAgainstSurface(d, FACTS, SEAM);
    expect(refusals).toEqual([expect.stringContaining('contract.disclosure.issueRefund.empty')]);
    expect(refusals[0]).toContain('{invoice.total}');
    expect(refusals[0]).toContain("'invoice'");
  });

  it('an empty sentence written from the held call\'s own args is accepted', () => {
    const d = readDeclaration(fixture(withEmpty('The invoice {args.invoiceId} carries nothing to refund.')));
    expect(checkAgainstSurface(d, FACTS, SEAM)).toEqual([]);
  });
});


describe('a guard name is unique', () => {
  it('two guards under one name are refused by that name and both lines', () => {
    expect(() => readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards:
    - name: refundReadsTheInvoice
      acts: [issueRefund]
      factory: onlyAfter
      args: { after: getInvoice }
    - name: refundReadsTheInvoice
      acts: [closeBooking]
      factory: onlyAfter
      args: { after: getInvoice }
  disclosure: {}
desks:
  - name: front-desk
    persona: The front desk.
    tools: [issueRefund, getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`))).toThrow(/contract\.guards\[1\]\.name \(line 11\).*'refundReadsTheInvoice'.*line 7/s);
  });

  it('two guards named apart are read as two guards', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: []
  guards:
    - name: refundReadsTheInvoice
      acts: [issueRefund]
      factory: onlyAfter
      args: { after: getInvoice }
    - name: closingNoteReadsTheInvoice
      acts: [closeBooking]
      factory: onlyAfter
      args: { after: getInvoice }
  disclosure: {}
desks:
  - name: front-desk
    persona: The front desk.
    tools: [issueRefund, getInvoice]
    conduct: { declareHonestly: Say what ran and what did not. }
`));
    expect(d.contract.guards.map(guard => guard.name))
      .toEqual(['refundReadsTheInvoice', 'closingNoteReadsTheInvoice']);
  });
});

describe('the old desk fields and the summary comma', () => {
  it('a summary carrying a comma is refused quoting the separator rule', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: v
  facts: []
  guards: []
  disclosure:
    issueRefund:
      before: Refunding this invoice cannot be taken back.
      after: The refund of {result.refunded} is on this invoice.
    closeBooking:
      after: The closing note reads {result.status}.
desks:
  - name: billing
    persona: p
    tools: [getInvoice]
    conduct:
${SIX_VOICES}
    description: quotes and bookings
    summary: the desk, and the counter
  - name: audit
    persona: p
    tools: [closeBooking]
    conduct:
${SIX_VOICES}
    description: invoices and refunds
    summary: the desk
`));
    expect(checkAgainstSurface(d, FACTS, SEAM))
      .toEqual([expect.stringContaining('comma')]);
  });

  it('handles and teammates are unknown desk keys, refused by name and line', () => {
    expect(() => readDeclaration(fixture(`
contract: { name: x, voice: v, facts: [], guards: [], disclosure: {} }
desks:
  - name: front-desk
    persona: p
    tools: [getInvoice]
    conduct: { declareHonestly: x }
    handles: quotes and bookings
`))).toThrow(/handles/);
    expect(() => readDeclaration(fixture(`
contract: { name: x, voice: v, facts: [], guards: [], disclosure: {} }
desks:
  - name: front-desk
    persona: p
    tools: [getInvoice]
    conduct: { declareHonestly: x }
    teammates: { audit: the other desk }
`))).toThrow(/teammates/);
  });
});
