/**
 * THE PARITY LAW — a condition the world refuses a write under is a condition some spec gates.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import type { DomainContract } from '@looprun-ai/core';
import { lintSubject } from '../src/lint-subject.js';
import type { Subject } from '../src/subject.js';

const CONTRACT: DomainContract = {
  voice: 'A rentals desk.',
  stateBlock: () => '',
  coreInvariants: [],
  languageClause: 'Answer in English.',
  writeTools: ['createBooking'],
};

const makeWorld = (preset?: string) => {
  if (preset && !['default', 'suspended'].includes(preset)) throw new Error(`unknown preset ${preset}`);
  const suspended = preset === 'suspended';
  return {
    status: () => (suspended ? 'suspended' : 'active'),
    exec: () => (suspended ? { ok: false } : { ok: true, id: 'BK-1' }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
  } as never;
};

const subject = (contract: DomainContract): Subject => {
  const spec = new AgentSpecBase({
    id: 'rentals',
    mode: 'M',
    persona: 'The rentals desk.',
    tools: ['createBooking'],
    contract,
  });
  return {
    dir: '.',
    specs: { rentals: spec },
    contract,
    caseAgent: { 'c-1': 'rentals' },
    cases: [
      {
        id: 'c-1',
        setup: { preset: 'suspended' },
        turns: [{ userText: 'book it' }],
        targets: ['minimal:claimIsGrounded'],
      },
    ],
    toolDefs: [{ name: 'createBooking', description: '', inputSchema: { properties: {} } }],
    makeWorld,
  } as Subject;
};

const GATED: DomainContract = {
  ...CONTRACT,
  writeGate: {
    ok: (w) => (w as unknown as { status(): string }).status() !== 'suspended',
    reason: 'This workspace is suspended.',
  },
};

describe('WRITE-REFUSED-UNGATED', () => {
  it('accuses a lane whose world refuses a write it never gates', () => {
    const out = lintSubject(subject(CONTRACT));
    expect(
      out.some((f) => f.includes("WRITE-REFUSED-UNGATED: preset 'suspended'") && f.includes('createBooking')),
    ).toBe(true);
  });

  it('is silent once the contract declares the gate', () => {
    expect(lintSubject(subject(GATED)).some((f) => f.includes('WRITE-REFUSED-UNGATED'))).toBe(false);
  });
});
