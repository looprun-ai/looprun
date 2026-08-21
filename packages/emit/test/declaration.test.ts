import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readDeclaration } from '../src/index.js';

function fixture(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'emit-declaration-'));
  const path = join(dir, 'declaration.yaml');
  writeFileSync(path, yaml, 'utf8');
  return path;
}

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
