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
import { governanceVeto, normalizeTerminalToolDef, prematureTerminalTools } from '@looprun-ai/core/internal';
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
  // The engine-DERIVED default closure (SCG: deriveClaimsFromLedger + renderOperationReport + the
  // EXHAUSTION_NOTHING/PARTIAL sentence) replaced the deleted `defaultExhaustionReply` helper. Its
  // properties — names no tool, surfaces world labels, "nothing was changed" when empty — are proven at
  // the unit level in core (`test/claims-render.test.ts` + `test/runtime.test.ts` blank-floor cases); the
  // backend keeps only the wiring proof below, that a host exhaustionReply gets a DOMAIN-only okTools list.

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
      [[{ tool: 'listItems', args: {} }], [{ tool: 'respond', args: { message: 'Alpha and Beta.', did: [{ op: 'inform' }] } }]],
      { contract },
    );

    expect(result.turnRecords[0]?.assistantFinalText).toBe('host closure');
    expect(seen[0]).toContain('listItems');
    // A terminal is the runtime's own delivery mechanism, never DOMAIN work handed to the closure.
    expect(seen[0]).not.toContain('respond');
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
    expect(escalated.correction).not.toContain('respond');
  });

  it('reaches the model tagged', async () => {
    const spec = new AgentSpecBase(baseCfg() as never);
    spec.addGuard('preTool', ['createItem'], custom({ kind: 'proofDeny', dim: 'run', check: () => 'not allowed yet', prose: () => 'x' }), { id: 'agent:proofDeny' });

    const { llm, result } = await runWith(spec, [
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'respond', args: { message: 'I could not create it.', did: [{ op: 'inform' }] } }],
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
  /** A host declaring its OWN `respond`: business prose, a brand-language pin, an extra required arg —
   *  all of which the runtime replaces with its own contract (message / did / asked). */
  const hostRespond: ToolDef = {
    name: 'respond',
    description: 'Send a user-facing reply when no domain tool is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        reflects: { type: 'string', enum: ['stepHistory', 'none'], description: 'What the reply reflects.' },
        message: { type: 'string', description: 'User-facing message in the brand language.' },
      },
      required: ['reflects', 'message'],
    },
  };

  it('replaces a host terminal def with the runtime contract, and passes domain defs through', () => {
    const d = normalizeTerminalToolDef(hostRespond);
    expect(d.description).not.toContain('when no domain tool is needed');
    expect(d.description).toContain('END the turn');
    // No brand-language pin reaches the model, and no argument the runtime never reads.
    expect(JSON.stringify(d.inputSchema)).not.toContain('brand language');
    expect(JSON.stringify(d.inputSchema)).not.toContain('stepHistory');
    const props = (d.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.reflects).toBeUndefined();
    expect(props.message.description).toContain("USER'S language");
    // The runtime reads exactly message + did (asked optional): required is [message, did].
    expect((d.inputSchema as { required: string[] }).required).toEqual(['message', 'did']);
    expect(props.did).toBeDefined();

    // A domain def is returned BY IDENTITY — provably untouched.
    const domain = FIXTURE_TOOL_DEFS.find((t) => t.name === 'createItem')!;
    expect(normalizeTerminalToolDef(domain)).toBe(domain);
  });

  it('puts the runtime contract on the wire, not the host wording', async () => {
    const toolDefs = [...FIXTURE_TOOL_DEFS.filter((d) => d.name !== 'respond'), hostRespond];
    const { llm } = await runWith(new AgentSpecBase(baseCfg() as never), [[{ tool: 'respond', args: { message: 'done', did: [{ op: 'inform' }] } }]], { toolDefs });

    const tools = (llm.received[0] as { tools?: Array<Record<string, unknown>> }).tools ?? [];
    const reply = tools.find((t) => (t.name ?? t.toolName) === 'respond');
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
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }, { toolName: 'respond' }] }])).toEqual(['listItems']);
    // Order within the step is irrelevant — "same step" means "the result was not observable".
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'respond' }, { toolName: 'listItems' }] }])).toEqual(['listItems']);
    // Separate steps are the HEALTHY shape.
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }] }, { toolCalls: [{ toolName: 'respond' }] }])).toEqual([]);
    expect(prematureTerminalTools([{ toolCalls: [{ toolName: 'listItems' }] }])).toEqual([]);
    expect(prematureTerminalTools(undefined)).toEqual([]);
    // A finished step is chunk-shaped; reading only `toolName` makes the gate a silent no-op.
    expect(
      prematureTerminalTools([
        { toolCalls: [{ type: 'tool-call', payload: { toolName: 'listItems' } }, { type: 'tool-call', payload: { toolName: 'respond' } }] },
      ]),
    ).toEqual(['listItems']);
  });

  it('discards the same-step reply and re-closes AFTER the tool result exists', async () => {
    const { result } = await runWith(new AgentSpecBase(baseCfg() as never), [
      [{ tool: 'listItems', args: {} }, { tool: 'respond', args: { message: 'There are no items on record.', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'You have 2 items: Alpha and Beta.', did: [{ op: 'inform' }] } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('You have 2 items: Alpha and Beta.');
    expect(rec?.recoveryEvents).toContain('premature-terminal:listItems');
    expect(rec?.recoveryEvents).toContain('forced-terminal');
  });

  it('leaves a well-formed turn untouched', async () => {
    const { llm, result } = await runWith(new AgentSpecBase(baseCfg() as never), [
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'respond', args: { message: 'You have 2 items: Alpha and Beta.', did: [{ op: 'inform' }] } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('You have 2 items: Alpha and Beta.');
    expect((rec?.recoveryEvents ?? []).join(',')).not.toContain('premature-terminal');
    expect(rec?.recoveryEvents).not.toContain('forced-terminal');
    // Zero repair round: exactly the two scripted steps.
    expect(llm.calls()).toBe(2);
  });
});
