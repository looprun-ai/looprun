/**
 * THE PARITY LAW — a condition the world refuses a write under is a condition some spec gates.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase, precondition } from '@looprun-ai/core';
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
        targets: ['honesty:claimIsGrounded'],
      },
    ],
    toolDefs: [{ name: 'createBooking', description: '', inputSchema: { properties: {} } }],
    makeWorld,
  } as Subject;
};

const GATED: DomainContract = {
  ...CONTRACT,
  guards: [
    {
      hook: 'preTool',
      target: 'writeTools',
      guard: precondition(
        (w) => (w as unknown as { status(): string }).status() !== 'suspended',
        'This workspace is suspended.',
        { prose: 'nothing changes while the workspace is suspended' },
      ),
      id: 'changeAllowed:precondition',
      priority: 'changeAllowed',
    },
  ],
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

describe('TARGET-SILENT-ON-EVERY-PRESET', () => {
  it('is silent when the target denies on the case preset', () => {
    const s = subject(GATED);
    s.cases = [{ ...s.cases[0], targets: ['changeAllowed:precondition'] }];
    expect(lintSubject(s).some((f) => f.includes('TARGET-SILENT-ON-EVERY-PRESET'))).toBe(false);
  });

  it('accuses a target that can never deny on the presets the case runs', () => {
    const s = subject(GATED);
    s.cases = [{ ...s.cases[0], setup: { preset: 'default' }, targets: ['changeAllowed:precondition'] }];
    expect(
      lintSubject(s).some((f) => f.includes('TARGET-SILENT-ON-EVERY-PRESET: case "c-1" targets \'changeAllowed:precondition\'')),
    ).toBe(true);
  });
});

describe('the id laws', () => {
  it('a minted, positional guard id is a violation', async () => {
    const { lintSpecLaws } = await import('../src/lint.js');
    const spec = new AgentSpecBase({
      id: 'rentals',
      mode: 'M',
      persona: 'The rentals desk.',
      tools: ['createBooking'],
      contract: CONTRACT,
    });
    spec.addGuard('preTool', ['createBooking'], {
      kind: 'custom',
      dim: 'run',
      check: () => null,
      prose: () => 'x',
    } as never);
    expect(
      lintSpecLaws({ rentals: spec }).some((f) => f.includes('GUARD-ID-POSITIONAL') && f.includes('agent:custom#1')),
    ).toBe(true);
  });

  it('a guard id shared by two lanes is not covered by the other lane targeting it', () => {
    const s = subject(CONTRACT);
    const shared = {
      kind: 'precondition',
      dim: 'run',
      check: () => 'no',
      prose: () => 'x',
    } as never;
    const other = new AgentSpecBase({
      id: 'fleet',
      mode: 'M',
      persona: 'The fleet desk.',
      tools: ['createBooking'],
      contract: CONTRACT,
    });
    other.addGuard('preTool', ['createBooking'], shared, { id: 'agent:sharedGate' });
    const mine = s.specs.rentals as AgentSpecBase;
    mine.addGuard('preTool', ['createBooking'], shared, { id: 'agent:sharedGate' });
    s.specs = { rentals: mine, fleet: other };
    s.cases = [{ ...s.cases[0], targets: ['agent:sharedGate'] }];
    expect(lintSubject(s).some((f) => f.includes("GUARD-NEVER-TARGETED: 'agent:sharedGate' on agent fleet"))).toBe(
      true,
    );
  });

  it('the census demands a case for an honesty guard and for the change gate, and never for an always guard', () => {
    const s = subject(GATED);
    s.cases = [{ ...s.cases[0], targets: ['agent:none'] }];
    const findings = lintSubject(s).join('\n');
    expect(findings).toContain('honesty:claimIsGrounded');
    expect(findings).toContain('changeAllowed:precondition');
    expect(findings).not.toContain('always:noDuplicateCall');
    expect(findings).not.toContain('always:degenerationGuard');
  });

  it('the never-targeted message offers no way to accept the gap', () => {
    const s = subject(CONTRACT);
    const mine = s.specs.rentals as AgentSpecBase;
    mine.addGuard(
      'preTool',
      ['createBooking'],
      { kind: 'precondition', dim: 'run', check: () => 'no', prose: () => 'x' } as never,
      { id: 'agent:lonelyGate' },
    );
    s.cases = [{ ...s.cases[0], targets: [] }];
    const msg = lintSubject(s).find((f) => f.includes('GUARD-NEVER-TARGETED'));
    expect(msg).toMatch(/Repair one of/);
    expect(msg).toMatch(/cannot be accepted, only closed/);
    expect(msg).not.toMatch(/ignore|allowlist|suppress|record the gap/i);
  });
});
