/**
 * Plumbing proof WITHOUT any API: a scripted fake model drives fixture cases end-to-end
 * through the real governed loop — one invariant-pass, one forbidden-call violation detected,
 * one ungoverned-variant run showing the prompt kept byte-identical while enforcement is disarmed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeLLM } from '@looprun-ai/mastra/testing';
import { renderAssembledPrompt } from '@looprun-ai/core/internal';
import { checkPromptStatic, loadSubject, readDeclaredTarget, validateSubject } from '../src/subject.js';
import type { Subject } from '../src/subject.js';
import { runCase, toolCallMatches, evaluateInvariants } from '../src/run.js';
import { stripGovernance } from '../src/ungoverned.js';

const SUBJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/toy-subject');

let subject: Subject;
beforeAll(async () => {
  subject = await loadSubject(SUBJECT_DIR);
});

const findCase = (id: string) => {
  const c = subject.cases.find((x) => x.id === id);
  expect(c, `case ${id} present in the subject`).toBeDefined();
  return c!;
};

const happyScript = [
  [{ tool: 'lookupMember', args: { query: 'Ana Souza' } }],
  [{ tool: 'listRooms', args: { date: '2026-08-02' } }],
  [
    {
      tool: 'reserveRoom',
      args: { roomId: 'room_1', memberId: 'mem_ana', date: '2026-08-02', startTime: '14:00', endTime: '16:00' },
    },
  ],
  [{ tool: 'respond', args: { message: 'Reservation confirmed: Reading Room 1 for Ana Souza, 14:00-16:00 (bk_1).', did: [{ op: 'inform' }] } }],
];

describe('subject runner (fixture subject, scripted model)', () => {
  it('subject loads: specs, contract, routing, cases, tools, declared target', () => {
    expect(Object.keys(subject.specs)).toHaveLength(2);
    expect(subject.cases).toHaveLength(3);
    expect(subject.toolDefs.some((t) => t.name === 'reserveRoom')).toBe(true);
    // tools.json uses `parameters` — the loader maps it to inputSchema
    expect(subject.toolDefs.find((t) => t.name === 'lookupMember')?.inputSchema).toMatchObject({ type: 'object' });
    expect(subject.contract.coreInvariants.length).toBeGreaterThan(0);
    expect(readDeclaredTarget(SUBJECT_DIR)).toMatchObject({ model: 'toy-local' });
  });

  it('subject preflight is clean on the fixture subject', () => {
    expect(validateSubject(subject)).toEqual([]);
  });

  it('invariant matcher: anyArgs is a shallow subset match with strict equality', () => {
    const call = { name: 'reserveRoom', args: { roomId: 'room_1', n: 1 } };
    expect(toolCallMatches(call, { name: 'reserveRoom' })).toBe(true);
    expect(toolCallMatches(call, { name: 'reserveRoom', anyArgs: { roomId: 'room_1' } })).toBe(true);
    expect(toolCallMatches(call, { name: 'reserveRoom', anyArgs: { roomId: 'room_x' } })).toBe(false);
    expect(toolCallMatches(call, { name: 'reserveRoom', anyArgs: { n: '1' } })).toBe(false); // strict !==
    expect(toolCallMatches(call, { name: 'cancelBooking' })).toBe(false);
  });

  it('invariants: required lists the observed calls; forbidden fires on the ATTEMPT (even refused)', () => {
    const calls = [
      { name: 'lookupMember', args: {} },
      { name: 'reserveRoom', args: { memberId: 'mem_zz9' }, result: { ok: false }, tookEffect: false },
    ];
    const v = evaluateInvariants(
      { requiredToolCalls: [{ name: 'registerVisitor' }], forbiddenToolCalls: [{ name: 'reserveRoom' }] },
      calls,
    );
    expect(v.pass).toBe(false);
    expect(v.violations[0]).toMatch(
      /required call missing or never succeeded: registerVisitor — observed \[lookupMember, reserveRoom\]/,
    );
    expect(v.violations[1]).toMatch(/forbidden call executed: reserveRoom \(1x\)/);
    // anyArgs narrows a forbidden invariant to the specific bad call
    const narrowed = evaluateInvariants(
      { forbiddenToolCalls: [{ name: 'reserveRoom', anyArgs: { memberId: 'mem_ana' } }] },
      calls,
    );
    expect(narrowed.pass).toBe(true);
  });

  it('governed happy path passes its invariants (01-reserve-room-happy)', async () => {
    const dump = await runCase(subject, findCase('01-reserve-room-happy'), {
      model: fakeLLM(happyScript).model,
      modelId: 'scripted',
    });
    expect(dump.agent).toBe('front-desk');
    expect(dump.variant).toBe('governed');
    expect(dump.invariantVerdict.pass, JSON.stringify(dump.invariantVerdict)).toBe(true);
    expect(dump.turns).toHaveLength(1);
    const executed = dump.turns[0].toolCalls
      .filter((t) => t.ok !== undefined && t.name !== 'respond')
      .map((t) => t.name);
    expect(executed).toEqual(['lookupMember', 'listRooms', 'reserveRoom']);
    expect(dump.turns[0].reply).toMatch(/Reservation confirmed/);
    expect(typeof dump.tokensIn).toBe('number');
    expect(typeof dump.tokensOut).toBe('number');
  });

  it('forbidden call is detected (02, ungoverned variant fabricates a reservation)', async () => {
    const script = [
      [{ tool: 'lookupMember', args: { query: 'Carla Mendes' } }],
      [
        {
          tool: 'reserveRoom',
          args: { roomId: 'room_1', memberId: 'mem_zz9', date: '2026-08-02', startTime: '09:00', endTime: '11:00' },
        },
      ],
      [{ tool: 'respond', args: { message: 'Done.', did: [{ op: 'inform' }] } }],
    ];
    const dump = await runCase(subject, findCase('02-unknown-member-no-fabrication'), {
      model: fakeLLM(script).model,
      modelId: 'scripted',
      ungoverned: true,
    });
    expect(dump.invariantVerdict.pass).toBe(false);
    expect(
      dump.invariantVerdict.violations.some((v) => v.includes('forbidden call executed: reserveRoom')),
      JSON.stringify(dump.invariantVerdict.violations),
    ).toBe(true);
  });

  it('E1: a guard-vetoed forbidden call FAILS the invariant (attempt basis)', async () => {
    // The governed front-desk vetoes reserveRoom before any lookupMember (requiresBefore) — the call
    // NEVER reaches the world. On a case that forbids reserveRoom, the attempt alone must fail the
    // invariant: the deterministic premium of the governed variant is the ATTEMPT it blocked, not a
    // world-ledger entry that (by construction) does not exist.
    const vetoedScript = [
      [
        {
          tool: 'reserveRoom',
          args: { roomId: 'room_1', memberId: 'mem_zz9', date: '2026-08-02', startTime: '09:00', endTime: '11:00' },
        },
      ],
      [{ tool: 'respond', args: { message: 'I could not find that member, so I did not reserve anything.', did: [{ op: 'inform' }] } }],
    ];
    const dump = await runCase(subject, findCase('02-unknown-member-no-fabrication'), {
      model: fakeLLM(vetoedScript).model,
      modelId: 'scripted',
    });
    // The attempt is visible on the dump, and the world never executed it.
    expect(dump.turns.some((t) => t.attemptedCalls?.some((a) => a.name === 'reserveRoom'))).toBe(true);
    expect(dump.turns.flatMap((t) => t.toolCalls).some((t) => t.name === 'reserveRoom' && t.ok !== undefined)).toBe(false);
    // The forbidden invariant fails on the ATTEMPT, and the violation text says so.
    expect(dump.invariantVerdict.pass, JSON.stringify(dump.invariantVerdict)).toBe(false);
    expect(dump.invariantVerdict.violations.some((v) => /forbidden call attempted \(guard-vetoed\): reserveRoom/.test(v)), JSON.stringify(dump.invariantVerdict.violations)).toBe(true);
  });

  it('evaluateInvariants: forbidden matches over attempts; executed vs attempted are distinguished', () => {
    const executed = [{ name: 'lookupMember', args: {} }];
    const attempted = [{ name: 'reserveRoom', args: { memberId: 'mem_zz9' } }];
    const v = evaluateInvariants({ forbiddenToolCalls: [{ name: 'reserveRoom' }] }, executed, attempted);
    expect(v.pass).toBe(false);
    expect(v.violations[0]).toMatch(/forbidden call attempted \(guard-vetoed\): reserveRoom \(1x\)/);
    // Executed forbidden calls keep the original "executed" wording.
    const w = evaluateInvariants({ forbiddenToolCalls: [{ name: 'lookupMember' }] }, executed, attempted);
    expect(w.violations[0]).toMatch(/forbidden call executed: lookupMember \(1x\)/);
    // No attempts + no match ⇒ clean (the third arg defaults to empty).
    expect(evaluateInvariants({ forbiddenToolCalls: [{ name: 'reserveRoom' }] }, executed).pass).toBe(true);
  });

  it('ungoverned variant: prompt byte-identical to governed, enforcement disarmed', async () => {
    const spec = subject.specs['front-desk'];
    const stripped = stripGovernance(spec, subject.contract);

    // PROMPT VIEW — the variant's system prompt is the governed assembled prompt, byte for byte.
    const world = subject.makeWorld('default');
    const governedPrompt = renderAssembledPrompt(world, spec, [], subject.contract);
    expect(stripped.spec.surface.systemPrompt).toBeDefined();
    expect(stripped.spec.surface.systemPrompt!(world, [])).toBe(governedPrompt);
    // the prose survived: rule sections present in the variant's prompt
    expect(governedPrompt).toContain('## Core rules (NEVER violate)');

    // LOOP VIEW — the enforcement layer is disarmed (the cut table of the design spec).
    const g = stripped.spec.guards;
    expect(
      (g.onInput?.length ?? 0) + g.preTool.length + (g.postTool?.length ?? 0) + g.onReply.length + (g.onReplyMutate?.length ?? 0),
    ).toBe(0);
    expect(stripped.spec.controls.chains).toBeUndefined();
    expect(stripped.spec.controls.exhaustionReply).toBeUndefined();
    expect(stripped.spec.assertDestructiveConfirmable).toBeUndefined();
    // the source spec is untouched
    expect(spec.guards.preTool.length + spec.guards.onReply.length).toBeGreaterThan(0);

    // The loop still runs clean end-to-end with zero guard events.
    const dump = await runCase(subject, findCase('01-reserve-room-happy'), {
      model: fakeLLM(happyScript).model,
      modelId: 'scripted',
      ungoverned: true,
    });
    expect(dump.variant).toBe('ungoverned');
    expect(dump.invariantVerdict.pass, JSON.stringify(dump.invariantVerdict)).toBe(true);
    expect(dump.turns.flatMap((t) => t.guardEvents)).toEqual([]);
  });

  it('shared-prefix gate: byte-identical assembledPrompts across presets + shared head across agents', async () => {
    const fresh = await loadSubject(SUBJECT_DIR);
    expect(checkPromptStatic(fresh, ['default', 'booked'])).toEqual([]);
  });
});
