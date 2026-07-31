/**
 * @looprun-ai/mastra — LoopRunAgent CONSTRUCTION: config → the arguments `new Agent({...})` needs.
 *
 * One responsibility: turn an authored {@link LoopRunAgentConfig} into a validated, resolved
 * construction — the world seam, the ratified tool surface, the Mastra tool map, the static
 * instructions and the pass-through Agent options. Everything here runs ONCE, at construction,
 * and nothing here touches a turn; `agent.ts` keeps the governed-turn machine.
 *
 * The order of the checks is load-bearing and preserved verbatim from the pre-split constructor:
 * contract → mode exclusivity → world presence → spec warnings → surface intersection →
 * tool build → certification drift gate → static instructions.
 */
import { validateSpec } from '@looprun-ai/core';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { renderTurnPrompt } from '@looprun-ai/core/internal';
import type { LoopRunAgentConfig } from './agent.js';
import type { WorldFactory } from './session.js';
import { buildTerminalTools, buildWorldTools } from './tools.js';
import type { SessionAccessor } from './tools.js';
import { surfaceFingerprint } from './surface.js';
import { worldFromTools } from './world-adapters.js';

/** The config keys LoopRunAgent owns; everything else passes through to `new Agent({...})`. */
const LOOPRUN_KEYS = new Set([
  'spec', 'contract', 'world', 'tools', 'stateView', 'toolDefs', 'model', 'modelParams',
  'terminalProtocol', 'maxSteps', 'redrives', 'strict', 'id', 'name', 'expectedSurfaceHash',
]);

export interface ResolvedConstruction<W extends AgentWorld = AgentWorld> {
  contract: DomainContract | undefined;
  /** The world seam: an instance, or a factory in multi-session hosts (synthesized in native mode). */
  world: W | WorldFactory<W>;
  nativeToolsMode: boolean;
  /** Every tool the host registered (native mode); empty otherwise. */
  nativeToolNames: string[];
  /** Native mode: host tools ∩ spec.surface.tools — the RESOLVED active surface. */
  nativeActiveNames: string[];
  surface: Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
  terminalOn: boolean;
  staticInstructions: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  passthrough: Record<string, any>;
}

export function resolveConstruction<W extends AgentWorld = AgentWorld>(
  config: LoopRunAgentConfig<W>,
  getSession: SessionAccessor,
): ResolvedConstruction<W> {
  const { spec } = config;
  const contract = config.contract ?? spec.contract;
  if (!contract && !spec.surface.systemPrompt) {
    throw new Error(`LoopRunAgent "${spec.id}": no contract — pass config.contract or set spec.contract.`);
  }
  if (config.tools && (config.world || config.toolDefs)) {
    throw new Error(`LoopRunAgent "${spec.id}": pass EITHER native tools (tools[+stateView]) OR world+toolDefs — not both.`);
  }
  if (!config.tools && !config.world) {
    throw new Error(`LoopRunAgent "${spec.id}": a world (or native tools) is required.`);
  }
  const warnings = validateSpec(spec);
  if (warnings.length) {
    if (config.strict) throw new Error(`LoopRunAgent "${spec.id}": ${warnings.map((w) => w.message).join(' | ')}`);
    for (const w of warnings) console.warn(`[looprun] ${w.message}`);
  }

  const nativeToolsMode = !!config.tools;
  const world: W | WorldFactory<W> = nativeToolsMode
    ? (worldFromTools({ stateView: config.stateView }) as W)
    : (config.world as W | WorldFactory<W>);

  const surface = new Set(spec.surface.tools);
  const nativeToolNames = Object.keys(config.tools ?? {});
  // Native/MCP mode enforces the spec's RATIFIED surface, deny-by-default:
  //  · a host/MCP tool the surface does not list is NEVER registered or active (one loud
  //    console.error names the exclusions — governance must be visible, not silent);
  //  · a surface tool the host does NOT provide throws — the spec promises a capability the
  //    host lacks, and a broken bundle must not run quiet.
  const nativeActiveNames = nativeToolNames.filter((t) => surface.has(t));
  if (nativeToolsMode) {
    const unprovided = spec.surface.tools.filter((t) => !nativeToolNames.includes(t));
    if (unprovided.length) {
      throw new Error(
        `LoopRunAgent "${spec.id}": spec.surface.tools promise capabilities the host does not provide: ` +
          `${unprovided.join(', ')}. Register those tools or remove them from the spec's surface.`,
      );
    }
    const excluded = nativeToolNames.filter((t) => !surface.has(t));
    if (excluded.length) {
      console.error(
        `[looprun] LoopRunAgent "${spec.id}": ${excluded.length} host-registered tool(s) are NOT in ` +
          `spec.surface.tools and will never be active (deny-by-default): ${excluded.join(', ')}. ` +
          `Add them to the spec's surface (and re-certify) if the agent should have them.`,
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tools: Record<string, any>;
  if (nativeToolsMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admitted: Record<string, any> = {};
    for (const t of nativeActiveNames) admitted[t] = config.tools![t];
    tools = { ...admitted, ...buildTerminalTools(getSession) };
  } else {
    tools = buildWorldTools(config.toolDefs ?? [], surface, getSession);
  }

  // Certification drift gate: fingerprint the RESOLVED active surface (post-intersection, with
  // schemas when available) and compare against the certified hash — a mismatch voids the seal.
  if (config.expectedSurfaceHash) {
    const resolvedNames = nativeToolsMode ? nativeActiveNames : spec.surface.tools;
    const schemaOf = (name: string): unknown =>
      nativeToolsMode
        ? config.tools![name]?.inputSchema
        : (config.toolDefs ?? []).find((d) => d.name === name)?.inputSchema;
    const actual = surfaceFingerprint(resolvedNames, resolvedNames.map(schemaOf));
    if (actual !== config.expectedSurfaceHash) {
      throw new Error(
        `LoopRunAgent "${spec.id}": surface drifted since certification — seal void; re-certify. ` +
          `expected ${config.expectedSurfaceHash}, resolved surface fingerprints to ${actual}.`,
      );
    }
  }

  // Static default instructions (Studio/introspection); each governed turn passes the exact
  // per-turn variant via the per-execution `instructions` override.
  const staticWorld: AgentWorld = {
    exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [],
  };
  const terminalOn = config.terminalProtocol !== false;
  const staticInstructions = renderTurnPrompt({
    spec, contract, world: staticWorld, userText: null, terminalProtocol: terminalOn,
    // NOTHING here may interrogate the stub world. The terminal policy is pinned (the static
    // prompt has always rendered the full protocol, and that byte identity is load-bearing), and
    // the state block is skipped outright — it is business code reading business state, and this
    // world has none. Asking it anyway throws at construction for every real contract.
    replyOnly: false,
    instructionsOnly: true,
  }).instructions;

  // Pass through any further Agent option (memory, description, processors, …).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passthrough: Record<string, any> = {};
  for (const [k, v] of Object.entries(config)) if (!LOOPRUN_KEYS.has(k)) passthrough[k] = v;

  return {
    contract, world, nativeToolsMode, nativeToolNames, nativeActiveNames, surface, tools,
    terminalOn, staticInstructions, passthrough,
  };
}
