# TO-BE Phase 3 Implementation Plan — facade, adapters, server, native tool-result

> **Status: OPEN — unexecuted; parked with the phases 3–6 design.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public doors over the phase-1/2 engine: the native tool-result seam in core, `packages/next/mastra` (MastraModelPort · HostToolPort · McpConnect · AgentAssembly · LoopRunAgent · UngovernedAgent) and `packages/next/server` (wire · WireSessions · WireHandler · Server), gated by a scripted E2E battery with zero network.

**Architecture:** Spec §2 of `docs/superpowers/specs/2026-08-18-to-be-phases-3-6-build-design.md`. Build order is fixed: seam in core → adapters → assembly + facade → server → gate battery. The seam is the only change to merged code and is paid first with the full phase-1/2 suite re-green.

**Tech Stack:** TypeScript (ESM, node ≥ 22), vitest, `@mastra/core` ^1.42, `ai` ^6, zod ^3.24. New packages copy `packages/next/core`'s tsconfig/eslint convention.

## Global Constraints

- Everything written is English (stone rule).
- AS-IS voice in comments and docs: no history, no evidence, no test names.
- No file calls a third-party model API; model tests use mock language models only.
- Name gate + layer lints scope to `packages/next/**`; the root plain-names count stays exactly 130.
- Branch `to-be-phase-3`; every task ends with the triple gate green (`tsc --noEmit && eslint . && vitest run`) in every `packages/next/*` package it touched, then a commit.
- Regex purity in core: regex only inside the four catalog homes. New packages keep regex out of guard-adjacent code; wire parsing uses plain string ops where reasonable.
- `pnpm -C <absolute path>` for every package command (cwd resets between calls).

---

### Task 1: The native tool-result seam in core

**Files:**
- Modify: `packages/next/core/src/contract/vocabulary.ts:13` (Msg)
- Modify: `packages/next/core/src/run/turn.ts:115` and `:149`
- Modify: `packages/next/core/src/cards/catalog.ts:153` (LEAKS)
- Test: `packages/next/core/test/run/native-acts.test.ts`

**Interfaces:**
- Produces: `ChatMsg { role: 'user' | 'assistant'; text: string }`, `ActsMsg { role: 'acts'; acts: readonly Act[] }`, `type Msg = ChatMsg | ActsMsg`. Every later task consumes this union.

- [ ] **Step 1: Write the failing test** — a capturing ModelPort wrapper records every `StepInput`; drive one turn whose model calls `getBooking` then finishes. Assert: (a) some captured input carries a `role:'acts'` message whose act names `getBooking` and carries its result; (b) NO captured message text anywhere contains `TOOL RESULTS`; (c) the turn seals.

```typescript
import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import type { StepInput } from '../../src/contract/vocabulary.js';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

test('tool results ride as a typed acts message, never as user-role text', async () => {
  const seen: StepInput[] = [];
  const inner = new ScriptedModel({ steps: [
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('bk_9 is confirmed for Tuesday.', [])
  ] });
  const capture: ModelPort = { step: async (i) => { seen.push(i); return inner.step(i); } };
  const { engine } = caseRig({ model: capture });
  const rec = await engine.chat('s1', 'is bk_9 confirmed?');
  expect(rec.delivery).toContain('Tuesday');
  const acts = seen.flatMap(i => i.messages.filter(m => m.role === 'acts'));
  expect(acts.length).toBeGreaterThan(0);
  expect(JSON.stringify(acts)).toContain('getBooking');
  const texts = seen.flatMap(i => i.messages.filter(m => m.role !== 'acts').map(m => m.text));
  expect(texts.join('\n')).not.toContain('TOOL RESULTS');
});
```

- [ ] **Step 2: Run it** — expect FAIL (no `role:'acts'` exists).
- [ ] **Step 3: Implement** — in `vocabulary.ts` split `Msg` into the union above (note: `Act` is declared later in the file; forward-reference is fine in types). In `turn.ts`, both composition points become `messages.push({ role: 'acts', acts: draft.acts.slice(from) })` (pre-loop: `from = 0`; in-loop: `from = actsBefore`); delete the two `lines` builders. In `catalog.ts:153` drop the `'TOOL RESULTS (engine record):'` element.
- [ ] **Step 4: Full suite green** — `pnpm -C packages/next/core gate`. The 132 phase-1/2 proofs re-green untouched (ScriptedModel never reads its input; no test asserts the removed literal). Fix only type-level fallout (e.g. code that reads `m.text` must narrow on `role`).
- [ ] **Step 5: Commit** — `feat(core): tool results ride the StepInput as typed acts; the seat renders them`

### Task 2: ScriptedModel promoted to src

**Files:**
- Create: `packages/next/core/src/run/scripted-model.ts` (move from `test/fixtures/scripted-model.ts`)
- Modify: every `test/**` import of the fixture (path swap only)

**Interfaces:**
- Produces: `ScriptedScript { steps: readonly ModelStep[]; judgeAnswers?: readonly ('yes'|'no')[] }` in vocabulary (or exported beside the class), `class ScriptedModel implements ModelPort`, helpers `callStep`/`finishStep` stay test-side if they are sugar.

- [ ] **Step 1:** Move the class (unchanged semantics) to `src/run/scripted-model.ts`; keep test helpers (`callStep`, `finishStep`, `scriptedTargets`) in fixtures re-exporting nothing from src they don't need.
- [ ] **Step 2:** Update fixture/test imports (`git grep -l "fixtures/scripted-model"`); the fixture file itself becomes the helpers-only module importing the class from src.
- [ ] **Step 3:** `pnpm -C packages/next/core gate` green.
- [ ] **Step 4: Commit** — `feat(core): ScriptedModel is a shipped seat, not a fixture`

### Task 3: next/core export barrel + next/mastra and next/server scaffolds

**Files:**
- Create: `packages/next/core/src/index.ts`; add `exports` to `packages/next/core/package.json`
- Create: `packages/next/mastra/{package.json,tsconfig.json,eslint.config.js,src/index.ts}`
- Create: `packages/next/server/{package.json,tsconfig.json,eslint.config.js,src/index.ts}`
- Verify: root `pnpm-workspace.yaml` covers `packages/next/*`; `pnpm install` links workspace deps.

**Interfaces:**
- Produces: `@looprun-ai/next-core` importable by name: Engine, EngineConfig, ModelSeat, ScriptedModel, AgentFactory, factsFromWorld, world/WorldBuilder/BuiltWorld, SurfaceGate, card types, vocabulary types, ports.
- `next-mastra` deps: `@looprun-ai/next-core workspace:*`, `@mastra/core ^1.42.0`, `ai ^6.0.0`, `zod ^3.24.0`. `next-server` deps: `@looprun-ai/next-core`, `@looprun-ai/next-mastra` (type-only for LoopRunAgent).

- [ ] **Step 1:** Write the barrel: explicit named exports (no `export *` from files with test-only helpers).
- [ ] **Step 2:** Scaffold both packages copying next/core's tsconfig/eslint; each has `gate` script.
- [ ] **Step 3:** `pnpm install` at root; `pnpm -C packages/next/mastra gate` green on an empty src (index exports a version const only, replaced by Task 8/10).
- [ ] **Step 4: Commit** — `chore(next): mastra and server package scaffolds + core export barrel`

### Task 4: MastraModelPort

**Files:**
- Create: `packages/next/mastra/src/mastra-model-port.ts`
- Test: `packages/next/mastra/test/mastra-model-port.test.ts`

**Interfaces:**
- Consumes: `Msg`/`ActsMsg`, `StepInput`, `ModelStep`, `RawCall`, `LlmParams`, `TurnFailure` from next-core; `resolveModelConfig` + `MastraModelConfig` from `@mastra/core/llm`; `generateText`, `jsonSchema`, `tool` from `ai`.
- Produces: `class MastraModelPort implements ModelPort { constructor(model: MastraModelConfig, params: LlmParams); step(input: StepInput): Promise<ModelStep> }`.

- [ ] **Step 1: Failing test** with a mock language model (from `ai/test`; use the installed major's mock class). Cases:
  - a StepInput whose messages carry ChatMsg + one ActsMsg → the prompt handed to the mock contains an assistant tool-call part AND a tool-role result part with a minted `toolCallId` (`act_0`), and NO literal block text;
  - the mock answers one tool call → `ModelStep.calls = [{ tool, args }]`;
  - `forceFinish: true` → the call options carry `toolChoice` forcing the finish tool (name read from the input's tool cards — the finish card is the one the engine appended; assert by name equality with the last ToolCard);
  - the mock throws → `step` rejects with `TurnFailure` whose prose carries no provider stack text;
  - `llmParams` (temperature, maxOutputTokens) verifiably reach the mock's received call options.
- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3:** Implement: resolve the model once (lazily) via `resolveModelConfig`; map messages — ChatMsg → `{role, content: text}`; ActsMsg → one assistant message with `tool-call` parts (`toolCallId: act_<i>`, `toolName`, `input: act.call.args`) followed by one tool message with matching `tool-result` parts (`output: { type: 'json', value: { sentence: act.sentence, result: act.result, status: act.status } }`); tools → `tool({ description: card.does, inputSchema: jsonSchema(card.schema) })` with NO execute (one step, structurally loop-free); single-step call (`generateText`), map `result.toolCalls` → RawCall[] and `result.text` → text.
- [ ] **Step 4:** Gate green; commit — `feat(mastra): MastraModelPort — one native step, llmParams delivered, TurnFailure on provider errors`

### Task 5: HostToolPort

**Files:**
- Create: `packages/next/mastra/src/host-tool-port.ts`
- Test: `packages/next/mastra/test/host-tool-port.test.ts`

**Interfaces:**
- Consumes: `ReadyCall`, `ToolAnswer`, `Done` from next-core; the surface card's remote entries (`RemoteToolEntry` — includes any declared proxy mapping) from next-core vocabulary.
- Produces: `type LiveTool = { execute(args: Readonly<Record<string, Json>>): Promise<Json>; attestsEffect?: boolean }`; `class HostToolPort implements ToolPort { constructor(entries: Readonly<Record<string, RemoteToolEntry>>, live: Readonly<Record<string, LiveTool>>); call(c: ReadyCall): Promise<ToolAnswer> }`.

- [ ] **Step 1: Failing test.** The answer law and the proxy law:
  - a read tool returning cleanly → `done:'yes'` with the result;
  - a WRITE tool returning cleanly with no protocol attestation → `done:'unknown'`;
  - a write whose LiveTool declares `attestsEffect: true` → `done:'yes'`;
  - the tool throws before send semantics (execute rejects) → `done:'no'`, result carries the failure as data;
  - a rename proxy (`proxy: { to: 'realName' }`) maps the call to the real live tool;
  - a compose proxy executes its declared reads and merges results;
  - an unknown tool → `done:'no'`, never a throw.
- [ ] **Step 2–3:** RED, then implement (~130 lines; effect comes from the entry's declared effect; the port never speaks engine vocabulary).
- [ ] **Step 4:** Gate; commit — `feat(mastra): HostToolPort — protocol facts only, proxies declared not inferred`

*(If phase-2 vocabulary lacks a proxy field on `RemoteToolEntry`, add it in this task as data: `proxy?: { readonly to: string } | { readonly compose: readonly string[] }` — a declared rename or a declared merge of reads, validated by `world()`'s mcp/live checks.)*

### Task 6: McpConnect

**Files:**
- Create: `packages/next/mastra/src/mcp-connect.ts`
- Test: `packages/next/mastra/test/mcp-connect.test.ts`

**Interfaces:**
- Produces: `connect(mcp: { url: string; headers?: Record<string, string> }): Promise<Readonly<Record<string, LiveTool>>>`.

- [ ] **Step 1: Failing test** against an in-process MCP server (the MCP SDK's in-memory/linked transport; add the SDK as a devDependency if `@mastra/mcp` does not expose one). The fixture serves two tools; `connect` lists both; calling one through the returned LiveTool round-trips.
- [ ] **Step 2–3:** RED, implement (~80 lines over `@mastra/mcp`'s client).
- [ ] **Step 4:** Gate; commit — `feat(mastra): McpConnect — url+headers in, live tool map out`

### Task 7: AgentAssembly

**Files:**
- Create: `packages/next/mastra/src/agent-assembly.ts`
- Test: `packages/next/mastra/test/agent-assembly.test.ts`

**Interfaces:**
- Consumes: everything above + `AgentFactory`, `factsFromWorld`, `WorldBuilder`, `SurfaceGate`, `ModelSeat`, `ScriptedModel` from next-core.
- Produces: `type LoopRunModel = MastraModelConfig | { scripted: ScriptedScript }`; `type LoopRunConfig = { spec: AgentSpec; contract?: DomainContract; model: LoopRunModel; world: DeclaredWorld | McpWorldCard | LiveWorldCard; live?: Readonly<Record<string, LiveTool>> }` (the `live` key exists ONLY for `liveWorld` cards — host tools are handed in, not connected); `assemble(cfg: LoopRunConfig): Promise<EngineConfig>` and `assembleUngoverned(cfg): Promise<EngineConfig>`.

- [ ] **Step 1: Failing test:**
  - a `world` card config → EngineConfig whose toolPort/recordsPort are the BuiltWorld and whose compiled agent came through `AgentFactory.governed` (a consent guard is present for a destructive tool);
  - a scripted model member → the seat steps the script (no mastra resolution);
  - a `liveWorld` card whose live map is missing a declared tool → the SurfaceGate CardError surfaces (loud, aggregated);
  - `assembleUngoverned` compiles the ungoverned twin with byte-identical promptParts.
- [ ] **Step 2–3:** RED, implement (~150 lines; the seat's targets for a mastra model member are one synthesized `ModelTarget` whose id is the config string — certification discipline arrives with eval).
- [ ] **Step 4:** Gate; commit — `feat(mastra): AgentAssembly — one shot from the closed config to EngineConfig`

### Task 8: LoopRunAgent + UngovernedAgent

**Files:**
- Create: `packages/next/mastra/src/loop-run-agent.ts`, `src/ungoverned-agent.ts`; rewrite `src/index.ts` exports
- Test: `packages/next/mastra/test/loop-run-agent.test.ts`

**Interfaces:**
- Produces: `class LoopRunAgent extends Agent { constructor(cfg: LoopRunConfig); generate(text, opts?: { session?: string }): Promise<{ text: string; loopRun: TurnRecord }>; stream(...): governed run-to-completion then the composed delivery streams; guards(): GuardCensus; excluded(): readonly string[]; endSession(id): void }`; `class UngovernedAgent extends Agent` same shape minus `excluded`.

- [ ] **Step 1: Failing test:**
  - construction from the closed config (assembly is async — the constructor stores a promise; every entry awaits it);
  - `generate` returns the delivery text and the TurnRecord;
  - two concurrent `generate` calls on ONE session serialize (second sees the first's sealed state); different sessions run independently;
  - `guards()` lists the installed census; `endSession` drops state (a new session re-answers fresh);
  - `UngovernedAgent.generate` runs the disarmed twin, same prompt bytes (compare via the two compiled agents' promptParts).
- [ ] **Step 2–3:** RED, implement (~200 lines: `super({ id, name, instructions: <compiled promptParts system>, model: <a mastra-acceptable placeholder — the ENGINE owns the model seat; the host Agent never generates> })` — the governed `generate`/`stream` overrides never call super's loop; a serializing per-session promise queue like the engine's own).
- [ ] **Step 4:** Gate; commit — `feat(mastra): LoopRunAgent and UngovernedAgent — the two-card class swap`

### Task 9: wire.ts + WireSessions

**Files:**
- Create: `packages/next/server/src/wire.ts`, `src/wire-sessions.ts`
- Test: `packages/next/server/test/wire.test.ts`, `test/wire-sessions.test.ts`

**Interfaces:**
- Produces: `toEnvelope(record: TurnRecord, model: string): ChatCompletion` (OpenAI wire shape; `usage.estimated: true`; `meta.loopRun` = the record); `toSse(record, model): readonly string[]` (a completed turn as SSE frames ending `data: [DONE]`); `class WireSessions { resolve(credentialHash: string, callerSessionId: string): string; idle(ttlMs: number): readonly string[]; touch(engineSessionId: string): void }` — nested map, engine ids minted `w<N>`, never a joined string key.

- [ ] **Step 1: Failing tests:** envelope carries choices[0].message.content = delivery, `usage.estimated === true`, meta rides the record; SSE frames parse and end with DONE; WireSessions: same pair → same id; same caller id under DIFFERENT credentials → different ids; `idle` returns only sessions past the TTL since last touch.
- [ ] **Step 2–3:** RED, implement (both < 100 lines, pure).
- [ ] **Step 4:** Gate; commit — `feat(server): wire envelopes + credential-scoped sessions`

### Task 10: WireHandler + Server

**Files:**
- Create: `packages/next/server/src/wire-handler.ts`, `src/server.ts`; rewrite `src/index.ts`
- Test: `packages/next/server/test/server.test.ts` (real HTTP round-trips on an ephemeral port)

**Interfaces:**
- Produces: `type ServerConfig = { agents: Readonly<Record<string, LoopRunAgent>>; auth: { apiKeys: readonly string[] } | { auth: 'disabled' }; port?: number; bind?: string; sessionTtlMs?: number }`; `class WireHandler { constructor(cfg); handle(req, res): Promise<void> }`; `class Server { static start(cfg): Promise<{ url: string; close(): Promise<void> }> }`.

- [ ] **Step 1: Failing tests (drive a scripted LoopRunAgent):**
  - `GET /v1/models` lists the agent names;
  - `POST /v1/chat/completions` with a valid key → 200 envelope; without → 401; unknown model → 404;
  - a caller session id under another key's credential → fresh session (no cross-talk), and naming a session the credential never opened still answers (it is simply new for that pair) while another credential's state is unreachable;
  - a failed turn (script runs dry) → HTTP 502-class typed body, never a 200;
  - `stream: true` → SSE of the completed turn;
  - TTL sweep ends idle sessions (observable via a fresh answer after expiry).
- [ ] **Step 2–3:** RED, implement (`node:http`, loopback default bind; auth check is constant-time-ish comparison over the declared keys; body size cap; JSON parse failure → typed 400).
- [ ] **Step 4:** Gate; commit — `feat(server): the OpenAI facade over governed agents`

### Task 11: The phase gate battery G1–G7 + merge

**Files:**
- Test: `packages/next/mastra/test/gate/g1-facade-consent.test.ts`, `g3-mcp-world.test.ts`, `g4-live-world.test.ts`, `g5-native-format.test.ts`, `g6-ungoverned.test.ts`, `g7-stream.test.ts`
- Test: `packages/next/server/test/gate/g2-http-consent.test.ts`
- Fixture: `packages/next/mastra/test/fixtures/` (the HOSTILE world card readable from next-core test fixtures is core-private — recreate the minimal hostile card locally as data)

**Steps:**
- [ ] **Step 1:** Write G1–G7 exactly as spec §2.5 states them (each names its assertion in the test title). G5 additionally replays the M6 planting: a note inside a result arrives typed and the judged defense still answers.
- [ ] **Step 2:** All green: `pnpm -C packages/next/core gate && pnpm -C packages/next/mastra gate && pnpm -C packages/next/server gate`.
- [ ] **Step 3:** Root suites: `node tests/plain-names.test.mjs` stays at exactly 130; the repo test runner shows no new `not ok`.
- [ ] **Step 4:** Merge `to-be-phase-3` → main (no push).
- [ ] **Step 5:** Record deviations discovered during build in this plan's Deviations table.

## Deviations

| planned | built | why |
|---|---|---|
| McpConnect over `@mastra/mcp` | over `@modelcontextprotocol/sdk` directly | the SDK is the protocol's own client and already in the tree; one less wrapper |
| proxy = rename only | `RemoteToolEntry.proxy` grew the compose form; `ToolFact.proxy` carries it; SurfaceGate resolves renames and validates composed reads | the blueprint's compose law needs a data home |
| SurfaceGate compares every schema | drift is skipped when the card declared none (the empty schema); the assembly then ADOPTS the live schema into the facts | an undeclared schema declares nothing to drift from; the model and the gate share one truth |
| a compose entry with no schema | a compose proxy carries an AUTHORED schema on its card entry | deny-undeclared-args blocks every arg of a schema that declares nothing — the virtual read's args are authored |
| `LoopRunConfig` = spec/contract/model/world | + `mcp` (host-env door, required for mcpWorld), `live` (required for liveWorld), `seal`, `preset` | the host env owns connection facts; the cards never carry them |
| typed `generate`/`stream` overrides | each carries one described ts-expect-error narrowing the host base's generic surface; callers stay fully typed, zero `any` | the base returns its own generic FullOutput; the governed door returns the record |
| `guards()`/`excluded()` any time | they need construction settled — a turn awaits it; before that they throw a construction sentence | assembly is async behind the closed constructor (the MCP door awaits the wire) |
| HostToolPort answer law as planned | + a rejection on a read answers 'no', on a write answers 'unknown' (the send's fate is unknowable); MCP `isError` results answer 'no' | the plan named the clean paths; the rejection paths follow the same protocol-facts law |
| tree lints unchanged | three lanes: the core export barrel (may name engine), the facade packages (their own import law), the wire door (`node:http` in server/src only) | the lints scan the whole `packages/next` border; the new packages needed their lawful lanes stated |
| ScriptedModel in eval (4b) | promoted to core src in phase 3; fixtures keep only step sugar | the scripted member of ModelChoice lives below the mastra layer |
| llmParams via constructor only | MastraModelPort merges the spec card's params UNDER `StepInput.llmParams` per field | the seat's brakes (local caps) must win over the card |
