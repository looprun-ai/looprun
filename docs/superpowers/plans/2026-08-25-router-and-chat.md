# The Front Desk and the Chat Door — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-desk subject becomes one addressable agent: a lean neutral front desk routes
every operator message on intention, a notMine door returns a misdelivery once, and
`npx looprun chat <subject-dir>` opens a terminal conversation with any generated subject.

**Architecture:** Pure window composition and decision validation in `core` (`front-desk.ts`),
the routed conversation in `mastra` (`RoutedAgent` over per-desk `LoopRunAgent`s, foreign
exchanges injected as plain text), the wire and the REPL in `server`, the CLI subcommand in the
`looprun` package under a tsx loader, the routed exam path in `eval`. The spec is
`docs/superpowers/specs/2026-08-25-router-and-chat-design.md` — read it first.

**Tech Stack:** TypeScript ESM, vitest, pnpm workspace, `ai` + `@mastra/core/llm` via the
existing `MastraModelPort`, `tsx` (new dependency of the `looprun` package only).

## Global Constraints

- Every byte written to a file is English — prompt strings, regex tokens, comments, docs.
- Comments and docs state what IS (AS-IS): no history, no evidence citations, no test names.
- NO external model, ever. The only model any run may reach is the subject's own target
  (`ask/targets.json`). Never print env values; load keys with `set -a && . ./.env.local && set +a`.
- The router window is the spec §3 text VERBATIM. Router llmParams: `{ temperature: 0 }`;
  thinking off is the engine default and the router declares no preset.
- The front desk exists only when the subject declares 2+ desks. One desk ⇒ everything
  composes exactly as today.
- Pre-1.0: rename and break freely, no compatibility shims, callers updated in the same move.
- Build order: `pnpm -F @looprun-ai/core build` (then mastra/emit builds) before any
  typecheck or generator that reads `dist`.
- Run tests per package: `pnpm -F @looprun-ai/<pkg> test` (vitest). Full sweep before the
  final task: `pnpm -r test && pnpm -r typecheck`.
- The skill (agentspec repo) ships in the same working session as the engine change, and
  nothing subject-specific (no Atlas vocabulary) enters any skill page.
- Commit style: `type(scope): sentence` in the house voice, lowercase.

## File Structure

```
packages/core/src/contract/vocabulary.ts   + ForeignExchange, TurnRouting, TurnReturned, ChatOpts; TurnRecord.routing?
packages/core/src/run/front-desk.ts        NEW — window composition + decision reading (pure)
packages/core/src/run/engine.ts            chat() gains ChatOpts overload
packages/core/src/run/turn.ts              before-injection + notMine door
packages/core/src/cards/cards.ts           AgentSpec.handles?
packages/emit/src/declaration.ts           desks[].handles read-through
packages/emit/src/against-surface.ts       handles validation (2+ desks require, 1 desk refuse)
packages/emit/src/write-cards.ts           handles rendered into emitted specs
packages/mastra/src/loop-run-agent.ts      generateRouted()
packages/mastra/src/routed-agent.ts        NEW — RoutedAgent + fromSubject
packages/server/src/wire-handler.ts        agents union type
packages/server/src/chat.ts                NEW — startChat REPL
packages/looprun/bin/looprun.mjs           chat subcommand
packages/looprun/src/chat-main.ts          NEW — CLI entry under tsx
packages/eval/src/exam-runner.ts           routed case path
packages/core/src/contract/vocabulary.ts   ExamCase.route?
agentspec/skill/references/declare.md      handles field
agentspec/skill/references/norms.md        the line law + the none law
```

---

### Task 1: Contract types and the FrontDesk window (core, pure)

**Files:**
- Modify: `packages/core/src/contract/vocabulary.ts`
- Create: `packages/core/src/run/front-desk.ts`
- Modify: `packages/core/src/index.ts` (export the new unit and types)
- Test: `packages/core/test/front-desk.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names):
  ```ts
  interface ForeignExchange { readonly desk: string; readonly userText: string; readonly replyText: string }
  interface TurnRouting { readonly desk: string | null;
                          readonly returned: null | { readonly by: string; readonly reason: string } }
  interface TurnReturned { readonly returned: { readonly reason: string } }
  interface ChatOpts { readonly before?: readonly ForeignExchange[]; readonly returnable?: boolean }
  // TurnRecord gains:  readonly routing?: TurnRouting   (absent on desk-pinned paths)
  interface FrontDeskCfg { readonly houseName: string;
    readonly handles: Readonly<Record<string, string>>;
    readonly currentDesk: string | null;
    readonly lastExchange: { readonly userText: string; readonly replyText: string } | null;
    readonly returnedFrom: { readonly by: string; readonly reason: string } | null;
    readonly userText: string }
  function composeWindow(cfg: FrontDeskCfg): StepInput
  function readDecision(step: ModelStep, desks: readonly string[]): string | null
  ```

- [ ] **Step 1: Write the failing test** — `packages/core/test/front-desk.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { composeWindow, readDecision } from '../src/run/front-desk.js';

const cfg = {
  houseName: 'northgate-tool-hire',
  handles: { counter: 'quotes and bookings', money: 'invoices and refunds' },
  currentDesk: null, lastExchange: null, returnedFrom: null,
  userText: 'Has the invoice been paid?'
};

describe('the front desk window', () => {
  it('is the spec text verbatim on an opening message', () => {
    const step = composeWindow(cfg);
    expect(step.system).toBe(
`You are the front desk at northgate-tool-hire. Your only job is to read the
conversation and route the operator's NEW message (the last one) to the desk
that will handle it. Route on what the operator intends, never on the words
they used.

Desks:
- counter: quotes and bookings
- money: invoices and refunds

The conversation is just opening.
When more than one desk could serve, pick the most likely. When the task takes
several desks in sequence, pick the desk that acts first. When no desk's
surface performs what is asked — anything outside the house's own records and
operations — the answer is none, however close a desk's territory sounds.`);
    expect(step.messages).toEqual([{ role: 'user', text: 'Has the invoice been paid?' }]);
    expect(step.forceFinish).toBe(true);
    expect(step.llmParams).toEqual({ temperature: 0 });
    expect(step.tools).toHaveLength(1);
    expect(step.tools[0].name).toBe('route');
    expect((step.tools[0].schema as { properties: { desk: { enum: string[] } } })
      .properties.desk.enum).toEqual(['counter', 'money', 'none']);
  });

  it('carries the current desk, the tail exchange and the returned line', () => {
    const step = composeWindow({ ...cfg, currentDesk: 'counter',
      lastExchange: { userText: 'Book it.', replyText: 'Booked bk_1.' },
      returnedFrom: { by: 'money', reason: 'pricing is the counter\'s work' } });
    expect(step.system).toContain(
      'The conversation so far sits at the counter desk. A message');
    expect(step.system).toContain(
      "money returned this message: pricing is the counter's work");
    expect(step.messages).toEqual([
      { role: 'user', text: 'Book it.' },
      { role: 'assistant', text: 'Booked bk_1.' },
      { role: 'user', text: 'Has the invoice been paid?' }]);
  });

  it('reads a decision only from the declared enum', () => {
    const stepOf = (args: unknown) =>
      ({ calls: [{ tool: 'route', args: args as Record<string, unknown> }], text: '' });
    expect(readDecision(stepOf({ desk: 'money' }), ['counter', 'money'])).toBe('money');
    expect(readDecision(stepOf({ desk: 'none' }), ['counter', 'money'])).toBe('none');
    expect(readDecision(stepOf({ desk: 'kitchen' }), ['counter', 'money'])).toBe(null);
    expect(readDecision({ calls: [], text: '' }, ['counter', 'money'])).toBe(null);
  });
});
```

- [ ] **Step 2: Run it** — `pnpm -F @looprun-ai/core exec vitest run test/front-desk.test.ts`
  — expect FAIL (module not found).
- [ ] **Step 3: Add the types to `vocabulary.ts`** (beside `TurnRecord`): the four interfaces
  from the block above, and `routing?: TurnRouting` on `TurnRecord` with the comment
  `/** The front desk's decision when the turn arrived routed; absent on a desk-pinned path. */`
- [ ] **Step 4: Write `front-desk.ts`**:

```ts
/** The front desk: composes the routing window and reads the decision. The window
 *  carries the desk lines, the current-desk line, ONE prior exchange and the new
 *  message — never a persona, a card, an act or a record. */
import type { ModelStep, StepInput } from '../contract/vocabulary.js';

export interface FrontDeskCfg { readonly houseName: string;
  readonly handles: Readonly<Record<string, string>>;
  readonly currentDesk: string | null;
  readonly lastExchange: { readonly userText: string; readonly replyText: string } | null;
  readonly returnedFrom: { readonly by: string; readonly reason: string } | null;
  readonly userText: string }

const RULES = `When more than one desk could serve, pick the most likely. When the task takes
several desks in sequence, pick the desk that acts first. When no desk's
surface performs what is asked — anything outside the house's own records and
operations — the answer is none, however close a desk's territory sounds.`;

export function composeWindow(cfg: FrontDeskCfg): StepInput {
  const deskLines = Object.entries(cfg.handles).map(([n, d]) => `- ${n}: ${d}`).join('\n');
  const seat = cfg.currentDesk === null ? 'The conversation is just opening.'
    : `The conversation so far sits at the ${cfg.currentDesk} desk. A message
continuing that desk's work stays there; a message whose intent
belongs elsewhere moves.`;
  const returned = cfg.returnedFrom === null ? ''
    : `${cfg.returnedFrom.by} returned this message: ${cfg.returnedFrom.reason}\n`;
  const system = `You are the front desk at ${cfg.houseName}. Your only job is to read the
conversation and route the operator's NEW message (the last one) to the desk
that will handle it. Route on what the operator intends, never on the words
they used.

Desks:
${deskLines}

${seat}
${returned}${RULES}`;
  const tail = cfg.lastExchange === null ? [] : [
    { role: 'user' as const, text: cfg.lastExchange.userText },
    { role: 'assistant' as const, text: cfg.lastExchange.replyText }];
  return { system,
    messages: [...tail, { role: 'user', text: cfg.userText }],
    tools: [{ name: 'route',
      does: 'Route the new message to the desk that will handle it.',
      schema: { type: 'object', properties: {
        desk: { type: 'string', enum: [...Object.keys(cfg.handles), 'none'] } },
        required: ['desk'] } }],
    forceFinish: true, llmParams: { temperature: 0 } };
}

/** The routed desk, 'none', or null when the step carries no readable decision. */
export function readDecision(step: Pick<ModelStep, 'calls'>,
                             desks: readonly string[]): string | null {
  const call = step.calls.find(c => c.tool === 'route');
  const desk = call?.args['desk'];
  if (typeof desk !== 'string') return null;
  return desk === 'none' || desks.includes(desk) ? desk : null;
}
```

  Adjust `StepInput.tools`' element type if `ToolCard` requires more keys — mirror the
  exact `ToolCard` shape from `vocabulary.ts` (name, does, schema).
- [ ] **Step 5: Export** from `packages/core/src/index.ts`: `composeWindow`, `readDecision`,
  `FrontDeskCfg`, `ForeignExchange`, `TurnRouting`, `TurnReturned`, `ChatOpts`.
- [ ] **Step 6: Run tests + build** — `pnpm -F @looprun-ai/core exec vitest run test/front-desk.test.ts`
  PASS, then `pnpm -F @looprun-ai/core build && pnpm -F @looprun-ai/core typecheck`.
  If the verbatim-window assertion fails on whitespace, fix the IMPLEMENTATION to the spec
  text, never the assertion.
- [ ] **Step 7: Commit** — `feat(core): the front desk composes its window and reads one decision`

### Task 2: `handles` through the cards and the emitter

**Files:**
- Modify: `packages/core/src/cards/cards.ts` (AgentSpec), `packages/core/src/cards/agent-factory.ts` (normalization pass-through, if specs are normalized there)
- Modify: `packages/emit/src/declaration.ts`, `packages/emit/src/against-surface.ts`, `packages/emit/src/write-cards.ts`
- Test: `packages/emit/test/declaration.test.ts` (round-trip, beside the existing `pick` round-trip proof)

**Interfaces:**
- Produces: `AgentSpec.handles?: string` — the routing line, read by `RoutedAgent.fromSubject` (Task 5).

- [ ] **Step 1: AgentSpec gains the field** in `cards.ts`, directly after `teammates`:

```ts
  /** This desk's routing line — what the front desk reads to route a message here.
   *  Required on every desk of a multi-desk subject; never present on a single desk. */
  handles?: string;
```

- [ ] **Step 2: Write the failing round-trip test** in `packages/emit/test/declaration.test.ts`
  (follow the file's existing round-trip pattern — declaration source → read → write →
  read the emitted artifact):

```ts
it('handles survives the round trip on a multi-desk declaration', () => {
  // Build a two-desk declaration inline (the file's existing minimal fixture style),
  // each desk carrying handles: 'quotes and bookings' / 'invoices and refunds'.
  // Assert: the emitted SPECS carry spec.handles verbatim for both desks.
});
it('a multi-desk declaration missing handles refuses at emit', () => {
  // Two desks, one without handles — expect the against-surface refusal naming the desk.
});
it('a single-desk declaration carrying handles refuses as unreachable words', () => {
  // One desk with handles — expect the refusal.
});
```

  Fill the fixture bodies from the file's own existing fixtures — copy the smallest
  two-desk fixture already in the test file and add the field.
- [ ] **Step 3: Run** — `pnpm -F @looprun-ai/emit exec vitest run test/declaration.test.ts` — FAIL.
- [ ] **Step 4: Implement**: `declaration.ts` reads `desks[].handles` into the desk it
  builds (exactly as `llmParams` rides today); `against-surface.ts` adds the two refusals
  (`ROUTING_LINE_MISSING`: 2+ desks and any desk lacks `handles`, naming each missing desk;
  `ROUTING_LINE_UNREACHABLE`: 1 desk carries `handles`); `write-cards.ts` renders
  `handles: '<line>'` into each emitted spec object beside `teammates`.
- [ ] **Step 5: Run to PASS**, then `pnpm -F @looprun-ai/core build && pnpm -F @looprun-ai/emit test`.
- [ ] **Step 6: Commit** — `feat(emit): every desk of a routed house declares its handles line`

### Task 3: The engine door — `before` exchanges and the notMine return (core)

**Files:**
- Modify: `packages/core/src/run/engine.ts` (chat signature), `packages/core/src/run/turn.ts`
- Test: `packages/core/test/routed-turn.test.ts` (ScriptedModel-driven, follow the harness
  style of the existing engine tests in `packages/core/test/`)

**Interfaces:**
- Consumes: `ForeignExchange`, `TurnReturned`, `ChatOpts` (Task 1).
- Produces:
  ```ts
  // Engine
  chat(sessionId: string, text: string): Promise<TurnRecord>
  chat(sessionId: string, text: string, opts: ChatOpts): Promise<TurnRecord | TurnReturned>
  ```
  The notMine tool card, offered only when `opts.returnable === true`:
  `{ name: 'notMine', does: 'Return this message to the front desk: it is not this desk\'s to perform. Valid only before any act.', schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } }`

- [ ] **Step 1: Write the failing tests** — four behaviors, each a ScriptedModel run against
  a minimal compiled agent (reuse the smallest existing engine-test fixture):

```ts
it('before exchanges ride the window as plain text between history and the new message', ...);
  // chat(s, 'msg', { before: [{ desk: 'money', userText: 'u1', replyText: 'r1' }] })
  // → ScriptedModel.seen[0].messages contains user 'u1' + assistant 'r1' before user 'msg'.
it('a returnable turn offers notMine and a first-call notMine returns without sealing', ...);
  // script: step 1 calls notMine({reason:'not mine'}) → result is { returned: { reason: 'not mine' } };
  // a following chat() on the same session sees NO extra sealed turn in its history.
it('notMine after an act is refused and the turn continues', ...);
  // script: step 1 calls a read; step 2 calls notMine; step 3 finishes.
  // → result is a TurnRecord; the notMine call surfaces as a correction/refusal, not a return.
it('a non-returnable turn never carries the notMine card', ...);
  // chat(s, 'msg', { before: [] }) → ScriptedModel.seen[0].tools has no 'notMine'.
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement in `turn.ts`**:
  - `Turn.run(session, text)` gains `opts: ChatOpts = {}` threaded from `Engine.chat`.
  - Injection at the message seed (the block that flatMaps `history.sealed()`):

```ts
    const foreign = (opts.before ?? []).flatMap(x => [
      { role: 'user' as const, text: x.userText },
      { role: 'assistant' as const, text: x.replyText }]);
    const messages: Msg[] = [
      ...history.sealed().flatMap(r => [ /* unchanged */ ]),
      ...foreign,
      { role: 'user', text: userText }
    ];
```

  - When `opts.returnable === true`, prepend the notMine card to the step tools (never
    last — the finish stays last for `forceFinish`).
  - After each model step: if a `notMine` call arrives and `draft.acts.length === 0` and no
    prior step ran, return `{ returned: { reason: String(call.args['reason'] ?? '') } }`
    WITHOUT sealing (the session tape is untouched). If a `notMine` call arrives any later,
    push the deterministic refusal correction with the sentence
    `the return door closed once work began` and drop the call — the loop continues.
- [ ] **Step 4: Implement in `engine.ts`** — the overload pair; the no-opts path calls
  through with `{}` and narrows the return to `TurnRecord`.
- [ ] **Step 5: Run to PASS**; then the WHOLE core suite (`pnpm -F @looprun-ai/core test`) —
  the no-opts path must be byte-identical in behavior (every existing test green).
- [ ] **Step 6: Commit** — `feat(core): a routed turn reads foreign text and may return once through the notMine door`

### Task 4: `generateRouted` on the LoopRunAgent (mastra)

**Files:**
- Modify: `packages/mastra/src/loop-run-agent.ts`
- Test: `packages/mastra/test/loop-run-agent.test.ts` (extend the existing construction-test style)

**Interfaces:**
- Produces:
  ```ts
  generateRouted(text: string, opts: { session?: string; before?: readonly ForeignExchange[];
    returnable?: boolean }): Promise<GovernedResult | TurnReturned>
  ```
  `generate`/`stream` stay untouched — the exam's desk-pinned path does not change.

- [ ] **Step 1: Failing test**: with a scripted assembly (the file's existing pattern for
  injecting a fake engine), `generateRouted('hi', { returnable: true })` resolves the
  engine's `TurnReturned` unchanged, and resolves `{ text, loopRun }` on a sealed record.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**:

```ts
  async generateRouted(text: string, opts: { session?: string;
      before?: readonly ForeignExchange[]; returnable?: boolean }):
      Promise<GovernedResult | TurnReturned> {
    const { engine } = await this.ready;
    const out = await engine.chat(opts.session ?? 'default', text,
      { before: opts.before, returnable: opts.returnable });
    return 'returned' in out ? out : { text: out.text, loopRun: out };
  }
```

- [ ] **Step 4: Run to PASS**; `pnpm -F @looprun-ai/mastra test`.
- [ ] **Step 5: Commit** — `feat(mastra): the routed door on the governed agent`

### Task 5: The RoutedAgent (mastra)

**Files:**
- Create: `packages/mastra/src/routed-agent.ts`
- Modify: `packages/mastra/src/index.ts` (export)
- Test: `packages/mastra/test/routed-agent.test.ts`

**Interfaces:**
- Consumes: `composeWindow`, `readDecision`, `TurnRouting`, `ForeignExchange` (Task 1);
  `AgentSpec.handles` (Task 2); `generateRouted` (Task 4); `MastraModelPort`,
  `LoopRunConfig`, `assemble` (existing).
- Produces:
  ```ts
  interface RoutedSubjectCfg { readonly specs: Readonly<Record<string, AgentSpec>>;
    readonly contract?: DomainContract;
    readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
    readonly model: LoopRunModel }
  class RoutedAgent {
    static fromSubject(cfg: RoutedSubjectCfg,
      portFactory?: (params: LlmParams) => ModelPort): RoutedAgent | LoopRunAgent
    readonly name: string;                       // contract name, else the first desk's
    readonly deskNames: readonly string[];
    generate(text: string, opts?: { session?: string }): Promise<GovernedResult>
    endSession(id: string): void
  }
  ```

**Behavior (the whole §4 of the spec, in order):** per session hold
`{ ledger: { desk: string; userText: string; replyText: string }[]; currentDesk: string | null }`.
On `generate`:
1. Compose the window with `composeWindow({ houseName: this.name, handles, currentDesk,
   lastExchange: last ledger entry ?? null, returnedFrom: null, userText: text })` and run
   ONE `port.step(window)`; `readDecision`. `null` → one identical retry → still `null` →
   `throw new TurnFailure('network', 'the front desk returned no readable decision')`.
2. `'none'` → return the front refusal WITHOUT touching any desk:
   `text = 'No desk at ' + name + ' performs this. The house covers: ' + deskNames.join(', ') + '.'`
   and a synthesized record `{ turn: ledger.length + 1, servedBy: 'front-desk', userText: text_in,
   acts: [], questions: { issued: [], consumed: [], closed: [] }, finish: null, corrections: [],
   text, closedBy: 'engine', usage: <zeros + the router step's usage, modelCalls: 1>,
   routing: { desk: null, returned: null } }` (mirror the exact `TurnRecord` field set from
   `vocabulary.ts`). The ledger gains the exchange with `desk: 'front-desk'`.
3. A desk → `desks[desk].generateRouted(text, { session, before: foreignSince(desk),
   returnable: true })` where `foreignSince(desk)` maps the ledger entries after that desk's
   last entry into `ForeignExchange[]`.
4. A `TurnReturned` → re-route ONCE: same window plus
   `returnedFrom: { by: desk, reason }`; the re-routed desk gets `returnable: false`
   (a second return is structurally impossible). A re-route that lands on the SAME desk
   re-delivers with `returnable: false` too.
5. Merge the routing into the returned record:
   `loopRun = { ...out.loopRun, routing: { desk: finalDesk, returned }, usage: { ...out.loopRun.usage, inputTokens: +router tokens, outputTokens: +router tokens, modelCalls: +router calls } }`.
   Append `{ desk: finalDesk, userText: text, replyText: out.text }` to the ledger; set
   `currentDesk = finalDesk`.
- `fromSubject`: 2+ specs → one `LoopRunAgent` per spec (the exam-runner's own cfg shape:
  `{ spec, contract, model, world }`), `handles` from each spec (a missing `handles` throws
  `CardError`-style at construction — emit already refuses, this is the belt), router port
  from `portFactory ?? (p => new MastraModelPort(model, p))` with `{ temperature: 0 }`.
  1 spec → return `new LoopRunAgent(cfg)` unchanged.
- `endSession(id)` forwards to every desk agent and drops the session state.

- [ ] **Step 1: Write the failing tests** — drive the router with a scripted `portFactory`
  and desks whose assembly is faked (the Task 4 test's injection pattern). Cover: route to a
  desk (record carries `routing.desk`); continuation uses `currentDesk` + tail in the window
  (assert on the port's seen `StepInput`); `none` front refusal (no desk touched, ledger
  grows); notMine return re-routes once with the reason line in the second window and
  `returnable: false` on the re-delivery; `before` carries exactly the foreign entries since
  the desk's last visit; `fromSubject` with one spec returns a `LoopRunAgent`; missing
  `handles` on a spec throws at construction.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** per the behavior block.
  **Step 4: Run to PASS**; `pnpm -F @looprun-ai/mastra test && pnpm -F @looprun-ai/mastra typecheck`.
- [ ] **Step 5: Commit** — `feat(mastra): the routed house — one agent, many desks, every message routed on intention`

### Task 6: The wire union and the chat REPL (server)

**Files:**
- Modify: `packages/server/src/wire-handler.ts` (`ServerConfig.agents:
  Readonly<Record<string, LoopRunAgent | RoutedAgent>>` — the handler already only calls
  `generate(text, { session })`, so the body is type-only)
- Create: `packages/server/src/chat.ts`
- Modify: `packages/server/src/index.ts` (export `startChat`)
- Test: `packages/server/test/chat.test.ts`

**Interfaces:**
- Produces: `startChat(cfg: { agent: { generate(text: string, opts?: { session?: string }): Promise<GovernedResult> }; name: string; deskNames: readonly string[]; input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream }): Promise<void>`

**Behavior:** print `${name} · ${deskNames.length} desks: ${deskNames.join(' ')}`; readline
loop `you > `; on a line: `/exit` ends, `/desks` prints the desk list, anything else calls
`agent.generate(line, { session: 'chat' })`, prints the routing dim line from
`loopRun.routing` when present (`[router → ${desk}]`, plus
`[${returned.by} returned → ${desk}]` when `returned` is set, `[none]` when desk is null),
then the reply text. A `TurnFailure` prints `turn failed: ${kind} — ${detail}` and the loop
continues. Injectable `input`/`output` streams make it testable.

- [ ] **Step 1: Failing test**: feed a scripted agent + a PassThrough input carrying
  `"hello\n/exit\n"`; assert the output contains the header, `[router → counter]` and the
  reply text.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `node:readline`.
  **Step 4: PASS**; `pnpm -F @looprun-ai/server test && pnpm -F @looprun-ai/server typecheck`.
- [ ] **Step 5: Commit** — `feat(server): the chat door prints from the record`

### Task 7: `looprun chat <subject-dir>` (looprun package)

**Files:**
- Modify: `packages/looprun/package.json` (deps gain `tsx`, `@looprun-ai/eval`,
  `@looprun-ai/server`: `workspace:^`), `packages/looprun/bin/looprun.mjs` (subcommand + HELP row)
- Create: `packages/looprun/src/chat-main.ts` (compiled to `dist/chat-main.js`)

**Interfaces:**
- Consumes: `SubjectLoader.load(dir): Promise<Subject>` (eval), `RoutedAgent.fromSubject`
  (Task 5), `startChat` (Task 6).

**Mechanism (verified):** plain node cannot load `subject.ts` (`.js`-suffixed relative
imports); under `node --import tsx` the full `SubjectLoader.load` chain loads a generated
subject. The CLI therefore spawns itself under the tsx loader it ships.

- [ ] **Step 1: `chat-main.ts`**:

```ts
/** The chat door's entry, always run under the tsx loader: loads the subject door,
 *  composes the routed house, and hands the terminal to the REPL. */
import { SubjectLoader } from '@looprun-ai/eval';
import { RoutedAgent, LoopRunAgent } from '@looprun-ai/mastra';
import { startChat } from '@looprun-ai/server';

const dir = process.argv[2];
if (dir === undefined) { console.error('usage: looprun chat <subject-dir>'); process.exit(2); }
const subject = await SubjectLoader.load(dir);
const target = subject.targets[0];
if (process.env[target.apiKeyEnv] === undefined) {
  console.error(`the subject's key is not in the environment: ${target.apiKeyEnv}`);
  process.exit(2);
}
const agent = RoutedAgent.fromSubject({ specs: subject.specs, contract: subject.contract,
  world: subject.world, model: `${target.provider}/${target.model}` });
const deskNames = Object.keys(subject.specs);
await startChat({ agent, name: agent instanceof LoopRunAgent ? deskNames[0] : agent.name,
  deskNames });
```

  Mirror `DeclaredTarget`'s real field names from `packages/eval/src/targets.ts` when they
  differ from `provider`/`model`/`apiKeyEnv`.
- [ ] **Step 2: the subcommand in `bin/looprun.mjs`** (beside `init`/`models`; add the HELP row
  `chat <subject-dir>              Talk to a generated subject in the terminal.`):

```js
if (cmd === 'chat') {
  const { createRequire } = await import('node:module');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const here = createRequire(import.meta.url);
  const loader = here.resolve('tsx');
  const main = fileURLToPath(new URL('../dist/chat-main.js', import.meta.url));
  const child = spawn(process.execPath, ['--import', loader, main, ...args],
    { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 1));
}
```

  If `here.resolve('tsx')` yields a CJS entry that `--import` rejects, resolve
  `'tsx/dist/loader.mjs'` instead — the loader path proven in the session's micro-test.
- [ ] **Step 3: Verify by hand** (the one manual gate; from the bench root, key loaded):
  `set -a && . ./.env.local && set +a && npx looprun chat subjects/atlas-c17` — the header
  lists 6 desks; one message routes and answers; `/exit` ends. Record the transcript line
  in the commit body.
- [ ] **Step 4: `pnpm -F looprun build && pnpm -r typecheck`.**
- [ ] **Step 5: Commit** — `feat(looprun): npx looprun chat opens any subject from its own door`

### Task 8: The routed exam path (eval + contract)

**Files:**
- Modify: `packages/core/src/contract/vocabulary.ts` (`ExamCase.route?`),
  `packages/eval/src/exam-runner.ts`, `packages/eval/src/validator.ts`
- Test: `packages/eval/test/exam-runner.test.ts` (extend in the file's existing style)

**Interfaces:**
- Produces: `ExamCase.route?: readonly (string | readonly string[])[]` — the expected desk
  per operator turn (`'none'` allowed; an array is a defensible set). A case with `route`
  and no `agent` runs through `RoutedAgent.fromSubject`; the dump's `invariantFailures`
  gains one row per turn whose `records[i].routing?.desk` misses the expectation.

- [ ] **Step 1: Failing tests**: a routed case over a scripted two-desk subject records
  `routing.desk` per turn; a mismatch lands in `invariantFailures` as
  `{ kind: 'route', turn, expected, got }`; a desk-pinned case (`agent` set) runs exactly
  as before (no routing field, no new checks).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**: `runCase` composes
  `RoutedAgent.fromSubject` when `c.agent === undefined && c.route !== undefined`;
  the route check walks `c.route` against the sealed records. `validator.ts` refuses a
  `route` whose length differs from the case's operator-turn count, and a `route` naming an
  undeclared desk.
- [ ] **Step 4: PASS**; `pnpm -F @looprun-ai/eval test`. **Step 5: Commit** —
  `feat(eval): a routed case pins the lane of every message`

### Task 9: The skill (agentspec repo — same session, nothing subject-specific)

**Files:**
- Modify: `agentspec/skill/references/declare.md` (the desks table gains `handles`),
  `agentspec/skill/references/norms.md` (the line law + the none law)

- [ ] **Step 1: `declare.md`** — in the desk-fields section, add the row: `handles` —
  one line the front desk reads to route a message here; REQUIRED on every desk when the
  declaration carries two or more desks, REFUSED on a single desk.
- [ ] **Step 2: `norms.md`** — a short section, invented-domain example only:

```markdown
## The routing line

A `handles` line names the ACTS the desk performs, never its nouns. The front desk
routes on this line alone — a noun list loses the messages whose verb is the intent.

| | line | "who is assigned to tomorrow's delivery?" |
|---|---|---|
| fails | `the depot: drivers, crates and returns` | routed to the staff roster |
| holds | `the depot: delivery schedules, driver assignments, crates and returns` | routed to the depot |

The outside world routes nowhere: a question no desk's surface performs — however close a
desk's territory sounds — is the front desk's own refusal, and the declaration owes no
desk for it.
```

- [ ] **Step 3: Commit in agentspec** — `docs(skill): the handles line — name the acts, not the nouns`

### Task 10: Docs and the full sweep (looprun)

**Files:**
- Modify: `README.md` (the routed door: one model id per multi-desk subject; the chat:
  `npx looprun chat <subject-dir>`; both in the file's existing voice and depth)
- Verify: file headers of `front-desk.ts`, `routed-agent.ts`, `chat.ts`, `chat-main.ts`
  state their law AS-IS (written in their tasks; this step audits them)

- [ ] **Step 1: README section.** **Step 2: header audit.**
- [ ] **Step 3: The full sweep** — `pnpm -F @looprun-ai/core build && pnpm -r test && pnpm -r typecheck`
  — all green, including every pre-existing suite (the no-regression rule).
- [ ] **Step 4: Commit** — `docs: the routed house and its chat door`

### Task 11: The closing measurement — first rung only

The measurement runs on the ladder **12 → 40 → 100** with a judged checkpoint shown after
EVERY rung — this task executes ONLY the 12 and stops for the user's checkpoint.

- [ ] **Step 1: Author the routed case set** in the bench (`subjects/atlas-c17/cases.ts`,
  additive): the four spec §1.2 sequences as routed cases (`route` per turn, defensible sets
  where §1.2 marks them), two word-lure rows, two none-traps, and one opening per desk —
  12+ routed cases. The `handles` lines enter the c17 declaration THROUGH THE SKILL's T-loop,
  never by hand (the standing rule: subject fixes only through the skill).
- [ ] **Step 2: Run the 12** — from the bench root:
  `set -a && . ./.env.local && set +a && SUBJECT_DIR=subjects/atlas-c17 RUN_DIR=<run> CASE_IDS=<the 12> npx vitest run tools/run-cases.test.ts`
- [ ] **Step 3: Judge in session** — the agent reads the dumps and writes the verdicts
  itself (NO external judge, ever); deterministic counters via the run's own dumps; route
  mismatches from `invariantFailures`.
- [ ] **Step 4: STOP.** Show the 12-rung scoreboard and wait for the user before the 40.

## Self-Review Notes

- Spec §3 window text is asserted byte-for-byte in Task 1 — the one place the verbatim law
  is machine-checked.
- Every §12 ruling has a home: per-message routing (T5), tail-1 (T1/T5), notMine cap (T3/T5),
  2+ desks only (T2/T5), temp 0 + no preset (T1), CLI (T7).
- `TurnRecord.routing` is written by the RoutedAgent, never by the engine — the engine seals
  desk turns exactly as today; desk-pinned exam paths are untouched (asserted in T3/T8).
- The tsx mechanism, the tail-window accuracy, and the forced-enum call are all measured
  facts, not assumptions.
