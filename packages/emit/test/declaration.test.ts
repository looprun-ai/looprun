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
