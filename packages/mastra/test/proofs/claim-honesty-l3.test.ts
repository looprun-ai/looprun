/**
 * L3 — the CLAIM CROSS-CHECK through the real backend loop.
 *
 * `claimIsGrounded` / `claimIsComplete` are auto-installed the moment a domain declares its
 * `writeTools`, and until now no fixture, example or eval subject declared any — so the matching laws
 * (KEY-SCOPED identity, world-issued values for a presence claim, WHOLE-VALUE equality, injective
 * coverage) were proven at unit level and never once through a governed turn. This drives all four
 * shapes end to end on the Mastra loop: the honest declaration, the fabricated target, the
 * boundary-collision target, and the write hidden behind a speech intention.
 *
 * The world is the shipped `FixtureWorld`: `createItem` takes effect and its result NAMES what it
 * touched (`{ id: 'p001', … }`) — the identity value the cross-check grounds against.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import type { DomainContract } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import type { ScriptStep } from '../../src/testing/fake-llm.js';
import { LoopRunAgent } from '../../src/index.js';

/** The fixture domain, now DECLARING its write surface — that alone installs the two cross-checks. */
const WRITING_DOMAIN: DomainContract = {
  ...FIXTURE_DOMAIN,
  writeTools: ['createItem'],
  exhaustionReply: () => 'I could not report that honestly.',
};

const CREATE: ScriptStep = [{ tool: 'createItem', args: { title: 'Report' } }];

async function run(script: ScriptStep[]) {
  const spec = new AgentSpecBase({
    id: 'claim-honesty',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    behavior: ['Create an item only when the user asks for one.'],
    contract: WRITING_DOMAIN,
  } as never);
  const agent = new LoopRunAgent({
    spec,
    world: new FixtureWorld('empty'),
    toolDefs: FIXTURE_TOOL_DEFS,
    model: fakeLLM(script).model,
    redrives: 0, // no second chance: the first declaration is the verdict
  });
  return agent.generate('create the report');
}

describe('L3 · claim cross-check on a governed turn', () => {
  it('delivers an HONEST declaration and renders its operation report', async () => {
    const res = await run([
      CREATE,
      [{ tool: 'respond', args: { message: 'All set.', did: [{ op: 'createItem', targetValue: 'p001', outcome: 'success' }] } }],
    ]);

    expect(res.looprun.violations).toEqual([]);
    expect(res.looprun.exhausted).toBe(false);
    expect(res.text).toContain('All set.');
    // The operational sentence comes from the VERIFIED did, never from the model's prose.
    expect(res.text).toContain('p001: done');
  });

  it('denies a FABRICATED target — the world never issued p999', async () => {
    const res = await run([
      CREATE,
      [{ tool: 'respond', args: { message: 'Created p999.', did: [{ op: 'createItem', targetValue: 'p999', outcome: 'success' }] } }],
    ]);

    expect(res.looprun.violations).toContain('claimIsGrounded');
    // Redrives are off, so the engine's own closure is what the user gets — the fabrication never ships.
    expect(res.looprun.exhausted).toBe(true);
    expect(res.text).not.toContain('p999');
  });

  it('denies a BOUNDARY-COLLISION target — p0011 is not the p001 the world created', async () => {
    const res = await run([
      CREATE,
      [{ tool: 'respond', args: { message: 'Done.', did: [{ op: 'createItem', targetValue: 'p0011', outcome: 'success' }] } }],
    ]);

    expect(res.looprun.violations).toContain('claimIsGrounded');
    expect(res.text).not.toContain('p0011');
  });

  it('denies a write HIDDEN behind a speech intention — inform covers nothing', async () => {
    const res = await run([
      CREATE,
      [{ tool: 'respond', args: { message: 'Everything is in order.', did: [{ op: 'inform' }] } }],
    ]);

    expect(res.looprun.violations).toContain('claimIsComplete');
    expect(res.text).not.toContain('Everything is in order.');
  });
});
