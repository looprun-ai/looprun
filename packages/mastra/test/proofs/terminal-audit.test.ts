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
import { governanceVeto, normalizeTerminalToolDef, prematureTerminalTools, terminalProtocol } from '@looprun-ai/core/internal';
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
  // The engine-DERIVED default closure (deriveClaimsFromLedger + renderOperationReport + the
  // EXHAUSTION_NOTHING/PARTIAL sentence) has properties — names no tool, surfaces world labels,
  // "nothing was changed" when empty — that are proven at
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
   *  all of which the runtime replaces with its own contract (exactly `message` + `did`). */
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
    // The runtime reads exactly message + did — both REQUIRED, and `did` carries at least one
    // intention. There is no `asked` property to be set through.
    expect((d.inputSchema as { required: string[] }).required).toEqual(['message', 'did']);
    expect(props.did).toBeDefined();
    expect((props.did as unknown as { minItems: number }).minItems).toBe(1);
    expect((props as Record<string, unknown>).asked).toBeUndefined();

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

  /**
   * The MANDATORY-INTENTION surface must survive the backend's JSON-schema → zod conversion.
   * A converter that kept only the field TYPES would ship the model a bare `{op,target,outcome}`,
   * leaving the vocabulary, the cardinality and the `inform` guardrail — the forcing function the
   * honesty design rests on — inside the repo. This reads the schema as the PROVIDER receives it.
   */
  it('ships the mandatory-intention respond schema to the model (did ≥ 1, op prose, no `asked`)', async () => {
    const { llm } = await runWith(new AgentSpecBase(baseCfg() as never), [
      [{ tool: 'respond', args: { message: 'done', did: [{ op: 'inform' }] } }],
    ]);

    const tools = (llm.received[0] as { tools?: Array<Record<string, unknown>> }).tools ?? [];
    const reply = tools.find((t) => (t.name ?? t.toolName) === 'respond')!;
    const schema = reply.inputSchema as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };

    expect(schema.required).toEqual(['message', 'did']);
    expect(schema.properties.asked).toBeUndefined(); // no `asked` boolean has any wire presence
    const did = schema.properties.did!;
    expect(did.minItems).toBe(1); // every response declares at least one intention
    expect(String(did.description)).toContain('AT LEAST ONE intention'); // the floor is STATED, not only typed
    // The CLOSED key set reaches the model as prose: the converter drops `additionalProperties`, so
    // a model adding a fifth key would otherwise learn the law only from a refused reply.
    expect(String(did.description)).toContain('an entry carrying an unknown key is rejected');

    const op = (did.items as { properties: Record<string, { description?: string }> }).properties.op!;
    // The op vocabulary reaches the model on the field it governs.
    expect(op.description).toContain('inform');
    expect(op.description).toContain('greet');
    expect(op.description).toContain('refuse');
    expect(op.description).toContain('ask');
    // The inform guardrail is stated ONCE, on `op` — the field whose value it governs, and the one
    // place it is read in both terminal modes. Stating it a second time in the protocol block buys
    // nothing and costs the small model context it needs for the domain.
    const GUARDRAIL =
      '`inform` is for conveying information or answering a question. It MUST NOT be used to assert '
      + "that you performed an action. If you performed an action, declare it as that action's op — "
      + 'which is verified against what actually happened. Reporting a done action as `inform` is '
      + 'dishonest.';
    expect(op.description).toContain(GUARDRAIL);
    expect(terminalProtocol(false)).not.toContain('dishonest');
    expect(terminalProtocol(true)).not.toContain('dishonest');
    // `message` carries its own contract — prose only, operations belong to `did`.
    expect(String(schema.properties.message!.description)).toContain('operations go in did');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b — the `did` floor AT THE TOOL BOUNDARY
//
// Carrying `minItems` through the conversion means the backend's own input validation REJECTS a
// `respond` with an empty `did` before its execute runs. What follows pins the OBSERVED consequence
// — including the step/LLM-call cost, because a
// rejected tool input under `toolChoice:'required'` could in principle be handed back to the model
// and burn the whole step budget. It does not: the stop condition keys on the terminal CALL, not on
// its successful execution, so the generate stops at once and the turn takes the ordinary
// forced-terminal path.
// ─────────────────────────────────────────────────────────────────────────────
describe('an empty did never delivers', () => {
  /** The same spec/world for both arms — only the `did` differs. */
  const emptyDidScript = (did: unknown[]): ScriptStep[] => [
    [{ tool: 'respond', args: { message: 'All done!', did } }],
    // Three more identical steps are AVAILABLE: if a rejected input were fed back to the model, the
    // loop would consume them. The call-count assertion below is what proves it does not.
    [{ tool: 'respond', args: { message: 'All done!', did } }],
    [{ tool: 'respond', args: { message: 'All done!', did } }],
    [{ tool: 'respond', args: { message: 'All done!', did } }],
  ];

  it('CONTROL — the same turn with one intention delivers the model’s own message', async () => {
    const { llm, result } = await runWith(new AgentSpecBase(baseCfg() as never), emptyDidScript([{ op: 'inform' }]));

    expect(result.turnRecords[0]!.assistantFinalText).toBe('All done!');
    expect(result.turnRecords[0]!.recoveryEvents).toEqual([]);
    expect(llm.calls()).toBe(1);
  });

  it('`did: []` is rejected at the boundary → forced terminal → the engine closure, in ONE extra call', async () => {
    const { llm, result } = await runWith(new AgentSpecBase(baseCfg() as never), emptyDidScript([]));

    const r = result.turnRecords[0]!;
    // The model's prose NEVER ships: the terminal's execute never ran, so nothing was captured.
    expect(r.assistantFinalText).not.toContain('All done!');
    expect(r.assistantFinalText.length).toBeGreaterThan(0); // the engine closure is non-empty by construction
    // `terminal-rejected` × 2: the main generate's respond and the forced-terminal's respond both carry
    // `did: []`, and the guard hook REFUSES such a call with a governed correction instead of letting it
    // fail silently in zod — so the rejection lands in the turn's recovery log.
    // The engine's DECLARATION FLOOR denies the undeclared candidate BEFORE the blank
    // floor can see it, so the turn exhausts through the ordinary reply path (no terminal was observed
    // to salvage — both were refused) into the engine-derived closure.
    expect(r.recoveryEvents).toEqual(['terminal-rejected', 'terminal-rejected', 'forced-terminal', 'salvage-miss:no-terminal-observed', 'exhaustion-terminal']);
    // BOUNDED: the main generate + exactly one forced-terminal generate. No step burn, no retry loop.
    expect(llm.calls()).toBe(2);
    expect(r.maxIterHit).toBe(false);
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
