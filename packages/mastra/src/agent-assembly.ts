/** Construction resolution, one shot, keyed by the surface card's kind: a world card
 *  builds the local world and derives the facts; an mcpWorld card first connects
 *  through the host-env door; a liveWorld card takes the host's tools directly. The
 *  live kinds pass SurfaceGate (reconcile · deny-by-default · certification) and get
 *  HostToolPort. Never names a port in its public type — the scripted seat enters as
 *  DATA on the model key. */
import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentSpec, DeclaredWorld, DomainContract, EngineConfig, LiveTool,
              LiveWorldCard, McpWorldCard, ModelStep, ModelTarget, SurfaceFacts,
              SurfaceReport } from '@looprun-ai/core';
import { AgentFactory, ModelSeat, ScriptedModel, SurfaceGate, TurnFailure, WorldBuilder,
         factsFromWorld } from '@looprun-ai/core';
import { MastraModelPort } from './mastra-model-port.js';
import { HostToolPort } from './host-tool-port.js';
import { connect } from './mcp-connect.js';

export type LoopRunModel = MastraModelConfig | { scripted: { steps: readonly ModelStep[] } };

export interface LoopRunConfig {
  readonly spec: AgentSpec;
  readonly contract?: DomainContract;
  readonly model: LoopRunModel;
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
  /** The MCP door — host env, never the cards. Required exactly when the world is an mcpWorld card. */
  readonly mcp?: { readonly url: string; readonly headers?: Record<string, string> };
  /** The host's own tools. Required exactly when the world is a liveWorld card. */
  readonly live?: Readonly<Record<string, LiveTool>>;
  /** The certification seal of the live surface; omitted = not yet certified. */
  readonly seal?: string;
  readonly preset?: string;
}

export interface Assembled { readonly config: EngineConfig; readonly surface: SurfaceReport | null }

const isScripted = (m: LoopRunModel): m is { scripted: { steps: readonly ModelStep[] } } =>
  typeof m === 'object' && m !== null && 'scripted' in m;

function seatFor(model: LoopRunModel, spec: AgentSpec): ModelSeat {
  if (isScripted(model)) {
    const target: ModelTarget = { id: 'scripted', provider: 'scripted', keyEnv: null,
                                  tier: 'cloud', certified: true };
    return ModelSeat.create([target], 'scripted', () => new ScriptedModel(model.scripted.steps));
  }
  const id = typeof model === 'string' ? model
    : typeof model === 'object' && model !== null && 'id' in model && typeof model.id === 'string'
      ? model.id : 'host-model';
  const target: ModelTarget = { id, provider: 'mastra', keyEnv: null, tier: 'cloud', certified: true };
  return ModelSeat.create([target], id, () => new MastraModelPort(model, spec.llmParams ?? {}));
}

/** Facts whose card entry declared no schema adopt the live tool's own — the model
 *  and the drift check then share one truth. */
function adoptLiveSchemas(facts: SurfaceFacts, card: McpWorldCard,
                          live: Readonly<Record<string, LiveTool>>): SurfaceFacts {
  const entryOf = (name: string) =>
    card.reads?.[name] ?? card.writes?.[name] ?? card.destructive?.[name];
  const tools = Object.fromEntries(Object.entries(facts.tools).map(([name, fact]) => {
    const entry = entryOf(name);
    const isCompose = typeof fact.proxy === 'object' && fact.proxy !== null;
    const hostedName = typeof fact.proxy === 'string' ? fact.proxy : name;
    const hosted = live[hostedName];
    const adopt = entry !== undefined && entry.schema === undefined
      && !isCompose && hosted !== undefined;
    return [name, adopt ? { ...fact, schema: hosted.schema } : fact];
  }));
  return { tools };
}

async function resolveSurface(cfg: LoopRunConfig): Promise<{
  facts: SurfaceFacts;
  toolPort: EngineConfig['toolPort'];
  recordsPort: EngineConfig['recordsPort'];
  surface: SurfaceReport | null;
}> {
  const w = cfg.world;
  if ('card' in w) {
    const built = new WorldBuilder().build(w, cfg.preset);
    return { facts: factsFromWorld(w), toolPort: built, recordsPort: built, surface: null };
  }
  const live = 'host' in w
    ? cfg.live ?? missing('a liveWorld card needs the host tools on the live key')
    : await connect(cfg.mcp ?? missing('an mcpWorld card needs the mcp door { url, headers }'));
  const facts = adoptLiveSchemas(factsFromWorld(w), w, live);
  const surface = new SurfaceGate().check(facts, Object.values(live), cfg.seal ?? null);
  return { facts, toolPort: new HostToolPort(w, live), recordsPort: null, surface };
}

function missing(sentence: string): never {
  throw new TurnFailure('construction', sentence);
}

async function build(cfg: LoopRunConfig, armed: boolean): Promise<Assembled> {
  const { facts, toolPort, recordsPort, surface } = await resolveSurface(cfg);
  const factory = new AgentFactory();
  const compiled = armed
    ? factory.governed(cfg.spec, cfg.contract, facts)
    : factory.ungoverned(cfg.spec, cfg.contract, facts);
  return { config: { compiled, toolPort, recordsPort, seat: seatFor(cfg.model, cfg.spec) }, surface };
}

export function assemble(cfg: LoopRunConfig): Promise<Assembled> {
  return build(cfg, true);
}

export function assembleUngoverned(cfg: LoopRunConfig): Promise<Assembled> {
  return build(cfg, false);
}
