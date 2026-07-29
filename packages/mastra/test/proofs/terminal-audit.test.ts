/**
 * TERMINAL-PROTOCOL AUDIT — the runtime mechanics that keep a turn's CLOSE honest.
 *
 * Three properties are pinned here, each at L1 (pure decision) and L3 (the real loop):
 *
 *  1. The honest-abstain closure is assembled from DOMAIN evidence only. Terminals are runtime
 *     machinery; naming one in a delivered sentence leaks internal vocabulary to the user.
 *  2. A guard veto reaches the model STRUCTURALLY tagged, distinguishable from a world refusal.
 *  3. The closing step is TERMINAL-ONLY: a terminal that shared its step with a domain call was
 *     composed before that call's result existed, so its text cannot be reporting it.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import { defaultExhaustionReply, governanceVeto, normalizeTerminalToolDef, prematureTerminalTools } from '@looprun-ai/core/internal';
import type { DomainContract, RunResult, ToolDef } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import type { ScriptStep } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';

const baseCfg = () => ({
  id: 'terminal-audit',
  mode: 'PROOF',
  persona: 'You are the proof agent.',
  tools: [...FIXTURE_TOOL_NAMES],
  contract: FIXTURE_DOMAIN,
});

interface RunOpts {
  contract?: DomainContract;
  toolDefs?: ToolDef[];
  redrives?: number;
}

async function runWith(
  spec: AgentSpecBase,
  script: ScriptStep[],
  opts: RunOpts = {},
): Promise<{ llm: ReturnType<typeof fakeLLM>; result: RunResult }> {
  const llm = fakeLLM(script);
  const result = await runSpecConversation(spec, [{ userText: 'do the thing' }], {
    model: llm.model,
    modelParams: {},
    world: new FixtureWorld('seeded-media'),
    toolDefs: opts.toolDefs ?? FIXTURE_TOOL_DEFS,
    contract: opts.contract ?? FIXTURE_DOMAIN,
    redrives: opts.redrives ?? 0,
  });
  return { llm, result };
}

/** A check that can never be satisfied — forces the finalizer past every repair into the closure. */
const alwaysFails = () =>
  custom({ kind: 'proofTruthGate', dim: 'behavior', check: () => 'never deliverable', prose: () => 'x' });

// ─────────────────────────────────────────────────────────────────────────────
// 1 — the exhaustion closure is built from DOMAIN evidence only
// ─────────────────────────────────────────────────────────────────────────────
describe('exhaustion evidence', () => {
  it('names no tool in the default closure', () => {
    const withWork = defaultExhaustionReply(FIXTURE_DOMAIN, new FixtureWorld(), ['listItems', 'createItem'], [], ['k']);
    expect(withWork).not.toContain('listItems');
    expect(withWork).not.toContain('createItem');
    expect(withWork).not.toContain('replyToUser');

    // World-issued labels DO survive: they are what the user asked to see.
    expect(defaultExhaustionReply(FIXTURE_DOMAIN, new FixtureWorld(), ['createMedia'], ['g002'], ['k'])).toContain('g002');

    expect(defaultExhaustionReply(FIXTURE_DOMAIN, new FixtureWorld(), [], [], ['k'])).toContain('nothing was changed');
  });

  it('hands a host exhaustionReply a DOMAIN-only okTools list', async () => {
    const seen: string[][] = [];
    const contract: DomainContract = {
      ...FIXTURE_DOMAIN,
      exhaustionReply: (_w, okTools) => {
        seen.push([...okTools]);
        return 'host closure';
      },
    };
    const spec = new AgentSpecBase(baseCfg() as never);
    spec.addReplyCheck(alwaysFails(), { id: 'agent:proofTruthGate' });

    const { result } = await runWith(
      spec,
      [[{ tool: 'listItems', args: {} }], [{ tool: 'replyToUser', args: { text: 'Alpha and Beta.' } }]],
      { contract },
    );

    expect(result.turnRecords[0]?.assistantFinalText).toBe('host closure');
    expect(seen[0]).toContain('listItems');
    expect(seen[0]).not.toContain('replyToUser');
    expect(seen[0]).not.toContain('askUser');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 — the veto envelope carries its origin
// ─────────────────────────────────────────────────────────────────────────────
describe('governance veto envelope', () => {
  it('carries the discriminator, the guard kind, and a structural escalation', () => {
    const plain = governanceVeto('precondition', 'You must read the record first.', false);
    expect(plain.source).toBe('governance');
    expect(plain.guard).toBe('precondition');
    expect(plain.correction).toBe('You must read the record first.');
    expect(plain.error).toBe(plain.correction);
    expect(plain.mustCloseTurn).toBeUndefined();

    const escalated = governanceVeto('precondition', 'You must read the record first.', true);
    expect(escalated.mustCloseTurn).toBe(true);
    expect(escalated.correction).toContain('STOP');
    // HOW to close the turn is the protocol's job — a raw tool name in a tool result is one
    // copy-paste away from the user.
    expect(escalated.correction).not.toContain('replyToUser');
    expect(escalated.correction).not.toContain('askUser');
  });

  it('reaches the model tagged', async () => {
    const spec = new AgentSpecBase(baseCfg() as never);
    spec.addGuard('preTool', ['createItem'], custom({ kind: 'proofDeny', dim: 'run', check: () => 'not allowed yet', prose: () => 'x' }), { id: 'agent:proofDeny' });

    const { llm, result } = await runWith(spec, [
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'replyToUser', args: { text: 'I could not create it.' } }],
    ]);

    const wire = JSON.stringify(llm.received);
    expect(wire).toContain('"source":"governance"');
    expect(wire).toContain('"guard":"proofDeny"');
    expect(result.turnRecords[0]?.recoveryEvents).toContain('run:proofDeny:createItem');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 — a terminal's definition belongs to the protocol, not to the host
// ─────────────────────────────────────────────────────────────────────────────
describe('terminal tool definitions', () => {
  /** A host declaring its own terminal: business prose, a brand-language pin, an extra required arg. */
  const hostReplyToUser: ToolDef = {
    name: 'replyToUser',
    description: 'Send a user-facing reply when no domain tool is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        reflects: { type: 'string', enum: ['stepHistory', 'none'], description: 'What the reply reflects.' },
        text: { type: 'string', description: 'User-facing message in the brand language.' },
      },
      required: ['reflects', 'text'],
    },
  };

  it('replaces a host terminal def with the runtime contract, and passes domain defs through', () => {
    const d = normalizeTerminalToolDef(hostReplyToUser);
    expect(d.description).not.toContain('when no domain tool is needed');
    expect(d.description).toContain('END the turn');
    // No brand-language pin reaches the model, and no argument the runtime never reads.
    expect(JSON.stringify(d.inputSchema)).not.toContain('brand language');
    expect(JSON.stringify(d.inputSchema)).not.toContain('stepHistory');
    const props = (d.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.reflects).toBeUndefined();
    expect(props.text.description).toContain("USER'S language");
    expect((d.inputSchema as { required: string[] }).required).toEqual(['text']);

    // askUser's argument is `text` too — a differently-named field would be silently ignored.
    const ask = normalizeTerminalToolDef({ name: 'askUser', description: 'x', inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } });
    expect((ask.inputSchema as { required: string[] }).required).toEqual(['text']);

    // A domain def is returned BY IDENTITY — provably untouched.
    const domain = FIXTURE_TOOL_DEFS.find((t) => t.name === 'createItem')!;
    expect(normalizeTerminalToolDef(domain)).toBe(domain);
  });

  it('puts the runtime contract on the wire, not the host wording', async () => {
    const toolDefs = [...FIXTURE_TOOL_DEFS.filter((d) => d.name !== 'replyToUser'), hostReplyToUser];
    const { llm } = await runWith(new AgentSpecBase(baseCfg() as never), [[{ tool: 'replyToUser', args: { text: 'done' } }]], { toolDefs });

    const tools = (llm.received[0] as { tools?: Array<Record<string, unknown>> }).tools ?? [];
    const reply = tools.find((t) => (t.name ?? t.toolName) === 'replyToUser');
    expect(reply).toBeDefined();
    expect(JSON.stringify(reply)).not.toContain('when no domain tool is needed');
    expect(JSON.stringify(reply)).not.toContain('brand language');
    expect(JSON.stringify(reply)).not.toContain('reflects');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 — the closing step is TERMINAL-ONLY
// ─────────────────────────────────────────────────────────────────────────────
describe('premature terminal', () => {
  it('detects the premature shape and only that shape', () => {
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }, { toolName: 'replyToUser' }] }])).toEqual(['listItems']);
    // Order within the step is irrelevant — "same step" means "the result was not observable".
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'replyToUser' }, { toolName: 'listItems' }] }])).toEqual(['listItems']);
    // Separate steps are the HEALTHY shape.
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }] }, { toolCalls: [{ toolName: 'replyToUser' }] }])).toEqual([]);
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }] }])).toEqual([]);
    expect(prematureTerminalTools(undefined)).toEqual([]);
    // A finished step is chunk-shaped; reading only `toolName` makes the gate a silent no-op.
    expect(
      prematureTerminalTools([
        { toolCalls: [{ type: 'tool-call', payload: { toolName: 'listItems' } }, { type: 'tool-call', payload: { toolName: 'replyToUser' } }] },
      ]),
    ).toEqual(['listItems']);
  });

  it('discards the same-step reply and re-closes AFTER the tool result exists', async () => {
    const { result } = await runWith(new AgentSpecBase(baseCfg() as never), [
      [{ tool: 'listItems', args: {} }, { tool: 'replyToUser', args: { text: 'There are no items on record.' } }],
      [{ tool: 'replyToUser', args: { text: 'You have 2 items: Alpha and Beta.' } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('You have 2 items: Alpha and Beta.');
    expect(rec?.recoveryEvents).toContain('premature-terminal:listItems');
    expect(rec?.recoveryEvents).toContain('forced-terminal');
  });

  it('leaves a well-formed turn untouched', async () => {
    const { llm, result } = await runWith(new AgentSpecBase(baseCfg() as never), [
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'You have 2 items: Alpha and Beta.' } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('You have 2 items: Alpha and Beta.');
    expect((rec?.recoveryEvents ?? []).join(',')).not.toContain('premature-terminal');
    expect(rec?.recoveryEvents).not.toContain('forced-terminal');
    // Zero repair round: exactly the two scripted steps.
    expect(llm.calls()).toBe(2);
  });
});
