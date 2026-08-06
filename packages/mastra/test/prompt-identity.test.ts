/**
 * THE IDENTITY GATE: a real governed turn sends EXACTLY what `renderTurnPrompt` returns.
 *
 * The failure this rules out is expensive and silent: if the offline instruments (the margin probe
 * and its fork replays) carried their own REPLICA of the prompt assembly, a refactor of the runtime
 * would leave the replica behind, and the instruments would keep producing numbers about a prompt
 * nothing ran. A wrong prompt does not crash; it answers.
 *
 * So the runtime and the instruments render through one function, and this pins that the function is
 * telling the truth. If someone reassembles the prompt inside a driver again, this test fails.
 *
 * Byte-exact, both halves: the SYSTEM message (assembledPrompt + terminal protocol) and the USER message
 * (state block → uploads → request). A near-match is a failure — the margin instrument measures a
 * single token's logprob, so one byte of drift is the whole error budget.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import { renderTurnPrompt } from '@looprun-ai/core/internal';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';

const CONTRACT: DomainContract = {
  voice: 'You are the assistant of Fixture Plants.',
  stateBlock: (w) => `plan=${String((w as { plan?: unknown }).plan ?? 'starter')}`,
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  exhaustionReply: (_w, okTools) => `closure:${okTools.join(',')}`,
};

function fixtureWorld(): AgentWorld & { plan: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sse: any[] = [];
  return {
    plan: 'pro',
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'respond') {
        sse.push({ name, args });
        return { success: true };
      }
      const result = { success: true, plants: ['fern'] };
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: sse,
  };
}

const TOOL_DEFS = [
  { name: 'listPlants', description: 'List plants.', inputSchema: { type: 'object', properties: {} } },
];

class FixtureSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'fx-plants',
      mode: 'FIXTURE',
      persona: 'You are the plants desk.',
      tools: ['listPlants'],
      behavior: ['When asked about a plant, read it before you answer.'],
    });
  }
}

/** The system text the model was actually handed on its first call. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function systemSent(received: any[]): string {
  const first = received[0];
  const fromPrompt = (first?.prompt ?? []).find((m: { role?: string }) => m?.role === 'system');
  const raw = fromPrompt?.content ?? first?.system ?? '';
  return typeof raw === 'string' ? raw : String(raw?.[0]?.text ?? '');
}

/** The LAST user message text the model was actually handed on its first call. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastUserSent(received: any[]): string {
  const msgs = (received[0]?.prompt ?? []).filter((m: { role?: string }) => m?.role === 'user');
  const content = msgs[msgs.length - 1]?.content;
  if (typeof content === 'string') return content;
  return (content ?? []).map((p: { text?: string }) => p?.text ?? '').join('');
}

describe('prompt identity — the runtime sends what renderTurnPrompt returns', () => {
  it('system and user halves match byte for byte', async () => {
    const spec = new FixtureSpec();
    const world = fixtureWorld();
    const userText = 'Is the fern ok?';

    // Render BEFORE the turn: nothing in this fixture mutates the state the prompt reads, so the
    // expectation is the same bytes the turn will assemble.
    const expected = renderTurnPrompt({ spec, contract: CONTRACT, world, userText });

    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'The fern is fine.', did: [{ op: 'inform' }] } }]]);
    const agent = new LoopRunAgent({
      spec, contract: CONTRACT, world, toolDefs: TOOL_DEFS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: scripted.model as any,
    });
    await agent.generate(userText);

    expect(scripted.received.length).toBeGreaterThan(0);
    expect(systemSent(scripted.received)).toBe(expected.instructions);
    expect(lastUserSent(scripted.received)).toBe(expected.userContent);
  });

  it('the state block rides the USER half, never the system half', () => {
    const spec = new FixtureSpec();
    const world = fixtureWorld();
    const rendered = renderTurnPrompt({ spec, contract: CONTRACT, world, userText: 'hi' });

    // State-in-tail is what makes the system prefix cacheable across turns. If volatile state leaks
    // into the system half, every turn busts the prefix cache and the margin battery's cache-state
    // variant stops meaning anything.
    expect(rendered.userContent).toContain('plan=pro');
    expect(rendered.instructions).not.toContain('plan=pro');
    expect(rendered.userContent.endsWith('hi')).toBe(true);
  });

  it('constructing an agent never asks the contract about a stub world', () => {
    // THE REGRESSION. The constructor renders static instructions against a stub world, and the
    // state block is business code reading business state — a domain accessor the stub does not
    // have. The first version of the producer rendered both halves unconditionally and threw here,
    // at construction, for every contract whose state block reads anything real.
    //
    // The fixture above survives a stub because it reads `plan` defensively, which is exactly why
    // it did not catch this. So this contract reads like a real one does: it calls a method.
    const strictContract: DomainContract = {
      ...CONTRACT,
      stateBlock: (w) => `items=${(w as unknown as { itemCount(): number }).itemCount()}`,
    };
    const world = fixtureWorld();
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'ok', did: [{ op: 'inform' }] } }]]);

    expect(() => new LoopRunAgent({
      spec: new FixtureSpec(), contract: strictContract, world, toolDefs: TOOL_DEFS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: scripted.model as any,
    })).not.toThrow();

    // And a REAL turn still gets the real state block — skipping it is scoped to the stub path,
    // not a licence to drop state from the prompt the model actually reads.
    const live = { ...world, itemCount: () => 7 } as unknown as AgentWorld;
    expect(renderTurnPrompt({ spec: new FixtureSpec(), contract: strictContract, world: live, userText: 'hi' }).userContent)
      .toContain('items=7');
  });

  it('uploads render between the state block and the request', () => {
    const spec = new FixtureSpec();
    const world = fixtureWorld();
    const rendered = renderTurnPrompt({
      spec, contract: CONTRACT, world, userText: 'what is this?',
      uploadLabels: ['i901'], uploadUrls: ['https://x.test/scan.png'],
    });
    const stateAt = rendered.userContent.indexOf('plan=pro');
    const uploadAt = rendered.userContent.indexOf('[Uploads this turn: i901 (scan.png)]');
    const askAt = rendered.userContent.indexOf('what is this?');
    expect(stateAt).toBeGreaterThanOrEqual(0);
    expect(uploadAt).toBeGreaterThan(stateAt);
    expect(askAt).toBeGreaterThan(uploadAt);
  });
});
