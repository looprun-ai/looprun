/**
 * Chapter 06 · advanced — the same scheduler, taken somewhere else: served behind an
 * OpenAI-compatible endpoint, run on a local llama.cpp model, or driven by tools that execute
 * themselves (native tools / MCP).
 *
 * Nothing here runs on import: everything that would bind a port, spawn a server or download
 * weights is exported and called by you.
 *
 * The server package has no `looprun/server` facade subpath, so it comes from the scoped package
 * name `@looprun-ai/server` (outline §6, decision 5 — a Task 12 open question).
 */
import { createModelServer } from '@looprun-ai/server';
import type { ModelServer, ModelServerConfig, TurnEvent } from '@looprun-ai/server';
import { LoopRunAgent, worldFromTools } from 'looprun/mastra';
import type { StateView } from 'looprun/mastra';
import type { AgentWorld } from 'looprun';
import { LlamaCppRuntime, localModel, localModelStatus, resolveAlias } from 'looprun/models';
import type { LocalModelOptions, LocalModelSpec, ModelRuntimePort } from 'looprun/models';
import { schedulerSpec } from './scheduler/spec.ts';
import { SCHEDULER_TOOLS } from './scheduler/tools.ts';
import { SchedulerWorld } from './scheduler/world.ts';
import type { CalendarEvent } from './scheduler/world.ts';

// ── 1 · serve it: the governed agent as an OpenAI-compatible "model" ──────────────────────────
export function schedulerAgent(model: unknown): LoopRunAgent {
  return new LoopRunAgent({
    spec: schedulerSpec,
    world: () => new SchedulerWorld(), // a FACTORY: one world per session, and the server is multi-session
    toolDefs: SCHEDULER_TOOLS,
    model,
  });
}

/** The authored config. The `model` field of an incoming request selects the agent by this key. */
export function schedulerServerConfig(model: unknown, onTurn: (event: TurnEvent) => void): ModelServerConfig {
  return {
    agents: { scheduler: schedulerAgent(model) },
    port: 8099,
    // Observability: fires after every governed turn, with the corrections and violations of it.
    onTurn,
    // Optional: evict idle sessions (calls agent.endSession()). Default: never.
    sessionTtlMs: 30 * 60_000,
  };
}

export async function serveScheduler(model: unknown): Promise<ModelServer> {
  const server = await createModelServer(
    schedulerServerConfig(model, (event) => {
      // eslint-disable-next-line no-console
      console.log(`${event.model} · turn ${event.meta.turnIndex} · corrections`, event.meta.corrections);
    }),
  );
  return server; // { url, port, handler, close() } — url is `http://127.0.0.1:8099/v1`
}

// ── 2 · run it locally: one call, a governed agent on llama.cpp ───────────────────────────────
/** `localModel` resolves the alias, ensures the GGUF and a healthy server, then returns a client. */
export async function localSchedulerAgent(): Promise<LoopRunAgent> {
  const model = await localModel('qwen3.5-4b');
  return schedulerAgent(model);
}

/** The options, authored. `autoDownload` defaults to FALSE — a multi-GB download is consent-first. */
export const DEV_LOCAL_OPTIONS: LocalModelOptions = {
  autoStart: true,
  autoDownload: true, // dev convenience, sensible for the 4B only
  timeoutMs: 120_000,
};

/** "Why isn't it working": binary found? file on disk? server up? Three answers, no model call. */
export async function whyIsLocalNotWorking(alias = 'qwen3.5-4b'): Promise<string[]> {
  const status = await localModelStatus(alias);
  return [
    `runtime  ${status.runtime}`,
    `binary   ${status.binary.ok ? status.binary.path : `MISSING — ${status.binary.note ?? 'install llama.cpp (≥ b9780) and/or set $LLAMA_BIN'}`}`,
    `weights  ${status.modelFile.exists ? status.modelFile.path : `MISSING — npx looprun models pull ${alias}`}`,
    `server   ${status.server.up ? `up at ${status.server.baseURL}` : 'down'}`,
  ];
}

/** What `resolveAlias` returns and every runtime consumes: the measured launch profile of a tier. */
export const RAM24: LocalModelSpec = resolveAlias('ram24');

/** The shipped runtime, used directly — `localModel` is these three calls in the right order. */
export const llamaCpp: ModelRuntimePort = new LlamaCppRuntime();

/**
 * The seam a second runtime (MLX, ollama, vllm) implements. Aliases, the consent flow and the agent
 * side stay unchanged: `localModel('qwen3.5-4b', { runtime: myRuntime })`.
 */
export const alreadyServedRuntime: ModelRuntimePort = {
  id: 'already-running',
  status: async (spec: LocalModelSpec) => ({
    runtime: 'already-running',
    binary: { path: null, ok: true, note: 'someone else owns the process' },
    modelFile: { path: spec.file, exists: true },
    server: { up: true, baseURL: `http://127.0.0.1:${spec.port}/v1` },
  }),
  ensureModel: async (spec: LocalModelSpec) => spec.file,
  ensureServer: async (spec: LocalModelSpec) => ({
    baseURL: `http://127.0.0.1:${spec.port}/v1`,
    alreadyRunning: true,
    stop: async () => {},
  }),
};

// ── 3 · native tools: state without execution ─────────────────────────────────────────────────
/**
 * When the tools execute themselves (Mastra assigned tools, toolsets, MCP), there is no world to
 * hand-write — but stateful guards and `contract.stateBlock` still need state reads. A `StateView`
 * supplies exactly those, and `refresh()` runs at every turn boundary — FIRE-AND-FORGET.
 */
let cachedEvents: CalendarEvent[] = [];

export const calendarStateView: StateView = {
  snapshot: () => cachedEvents,
  clashesWith: (start: string, end: string) => cachedEvents.filter((e) => e.start < end && start < e.end),
  async refresh() {
    cachedEvents = await fetchCalendar();
  },
};

/** The synthesized world: state reads work, `exec` throws — the tools already execute themselves. */
export const nativeWorld: AgentWorld = worldFromTools({ stateView: calendarStateView });

/** Stand-in for the real remote read this state view would do. */
async function fetchCalendar(): Promise<CalendarEvent[]> {
  return cachedEvents;
}
