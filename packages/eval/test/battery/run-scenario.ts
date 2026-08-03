/**
 * ONE SCENARIO, THROUGH THE REAL LOOP.
 *
 * The conversation axes drive `runSpecConversation` — the same entry point `packages/eval`'s case
 * runner uses and the same one a host uses in batch. The battery does NOT reimplement the turn: an
 * instrument measuring its own copy of the loop measures nothing about the engine.
 *
 * What it does that `runCase` does not, and why it is a separate function rather than a flag on
 * `runCase`: the battery needs the RAW terminal payloads and the RAW prompts. `runCase` returns a
 * `CaseDump` shaped for the LLM judge — it keeps the ledger's cleaned `did` and drops the message
 * history, which is exactly the evidence a shape measurement is about. Adding a second return shape
 * to the shipped case runner to serve a gated instrument would put battery concerns in the published
 * package, so the instrument brings its own thin driver and shares everything below it.
 */
import { runSpecConversation } from '@looprun-ai/mastra';
import type { AgentSpec, AgentWorld, DomainContract, ToolDef } from '@looprun-ai/core';
import { attributeCalls, createRecorder, recordingModel } from './recording-model.js';
import { buildScenarioSheet, BATTERY_REDRIVES, type ScenarioSheet } from './sheet.js';

export interface ScenarioSpec {
  id: string;
  title: string;
  axis: 'capacity' | 'resistance';
  preset?: string;
  turns: string[];
}

export interface ScenarioDeps {
  spec: AgentSpec;
  contract: DomainContract;
  toolDefs: ToolDef[];
  makeWorld: (preset?: string) => AgentWorld;
  /** An AI-SDK LanguageModel — the real subject model, or a scripted fake. */
  model: unknown;
  modelParams?: Record<string, unknown>;
}

export async function runScenario(scenario: ScenarioSpec, deps: ScenarioDeps): Promise<ScenarioSheet> {
  const recorder = createRecorder();
  const world = deps.makeWorld(scenario.preset ?? 'default');
  const model = recordingModel(deps.model as object, recorder);
  const turns = scenario.turns.map((userText) => ({ userText }));

  const result = await runSpecConversation(deps.spec, turns, {
    model,
    modelParams: deps.modelParams ?? { temperature: 0 },
    world,
    toolDefs: deps.toolDefs,
    contract: deps.contract,
    redrives: BATTERY_REDRIVES,
  });

  attributeCalls(recorder, scenario.turns);

  return buildScenarioSheet({
    id: scenario.id,
    axis: scenario.axis,
    title: scenario.title,
    turnTexts: scenario.turns,
    records: result.turnRecords,
    messages: result.messages,
    recorder,
    worldCalls: world.toolCalls as Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>,
    ...(deps.contract.outcomes ? { outcomes: deps.contract.outcomes as Record<string, string> } : {}),
    ...(result.errorMsg ? { error: result.errorMsg } : {}),
  });
}
