/**
 * @looprun-ai/mastra — the MICRO-LOOP backend (EXPERIMENTAL; a small-language-model turn driver).
 *
 * ⚠️ EXPERIMENTAL — NOT wired as a default anywhere. The certified turn driver is
 * {@link runSpecConversation} / {@link LoopRunAgent}; this is an additive arm for tiny models.
 *
 * WHY a separate driver. The certified driver lets the model run a MULTI-STEP free generation and close
 * the turn with a free-text terminal (replyToUser/askUser). A tiny model is reliable at ONE
 * grammar-forced tool call but dies in the LOOP: multi-step free generation rambles to the output cap and
 * never closes the turn, and the free-text terminal is the failing surface. This driver decomposes the
 * TURN into forced MICRO-DECISIONS: ONE tool call per generate (stepCountIs(1) + toolChoice 'required' =
 * ramble structurally impossible), plus a STRUCTURED terminal (`replyStructured`) whose user-facing text
 * is produced by a DETERMINISTIC renderer, so the model never free-writes the reply.
 *
 * ISOLATION. Shares only PURE helpers + the governed-turn primitives with the certified driver
 * (imported, never mutated). Guard hooks, ledger, chain-completion, mutators, onReply checks and the
 * honest-abstain exhaustion are the certified machinery; only the GENERATION strategy differs.
 *
 * FORCING FORM. Every forcing site uses single-`activeTools` + `toolChoice:'required'` — llama-server
 * IGNORES the named `{ type:'tool', toolName }` form and degrades to free text.
 *
 * DOMAIN-NEUTRAL. Holds ZERO business strings and NO language-specific wording: the renderer supplies
 * only separators/newlines; the model supplies every natural-language token in the user's own language.
 */
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import {
  beginTurn,
  createLedger,
  defaultExhaustionReply,
  enforcePostTool,
  normalizeModelParams,
  renderScopedSpecTrunk,
  resolveGuards,
  resolveModelSettings,
  resolveMutators,
  resultOk,
  runChainCompletionPass,
  VETO_STORM_LIMIT,
} from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, Guard, GuardCtx, ReplyViolation, TokenUsage, TrunkTheme, TurnInput, TurnRecord, RunResult } from '@looprun-ai/core';
import { jsonSchemaToZodObject } from './json-schema-zod.js';
import type { RuntimeDeps } from './run-conversation.js';

const DEFAULT_MICRO_STEPS = 6;
const DEFAULT_REDRIVES = 1;
/** Tight per-step output cap (anti-ramble). Overridable via spec.controls.sampling.maxOutputTokens. */
const MICRO_STEP_TOKENS = 320;
/** Slightly larger cap for a forced closing/redrive replyStructured step. */
const FORCE_TOKENS = 256;

/** Free-text terminals (a capable model may still use them). */
const FREE_TERMINAL = new Set(['replyToUser', 'askUser']);
/** The structured terminal — this arm only; a deterministic renderer owns the reply text. */
const STRUCTURED_TERMINAL = 'replyStructured';
/** Every tool that ends a turn in micro-loop mode. */
const MICRO_TERMINAL = new Set([...FREE_TERMINAL, STRUCTURED_TERMINAL]);

/**
 * The replyStructured schema — grammar-safe (enum + plain strings/array only; NO pattern/format so a GBNF
 * backend can enforce it). `kind` is required; every content field is optional and language-neutral.
 */
const REPLY_STRUCTURED_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['answer', 'list', 'question', 'refusal'], description: 'Shape of this reply.' },
    intro: { type: 'string', description: "Opening line in the user's language (about 200 chars max)." },
    items: {
      type: 'array',
      items: { type: 'string' },
      description: "Up to 8 short bullet lines in the user's language (about 140 chars each).",
    },
    question: { type: 'string', description: "One clarifying question in the user's language." },
    caution: { type: 'string', description: "Optional caveat line in the user's language." },
  },
  required: ['kind'],
};

/**
 * Strips model `<think>…</think>` leakage from a raw text field — PURE, domain-neutral. Two passes:
 * (1) every CLOSED block anywhere (incl. an empty one) is removed whole; (2) a still-present LEADING
 * `<think>` with no close (truncated by a token cap) has just the opening tag trimmed. Exported for test.
 */
export function stripThinkBlocks(text: string): string {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*<think>\s*/i, '');
}

/**
 * Per-turn "last terminal wins" recorder — PURE. A blank/whitespace-only `next` is a no-op (keeps
 * `current`); any non-blank `next` REPLACES `current`. Never concatenates. Exported for test.
 */
export function recordTerminalReply(current: string, next: string): string {
  return next.trim() ? next : current;
}

/**
 * Final per-turn answerText assembly — PURE, exported for tests. Exactly one of: the tripwire abort
 * reason; the LAST terminal's rendered text; a defensive fallback to the last raw step text; or ''.
 */
export function assembleAnswerText(args: { tripwire: boolean; tripwireReason: string; terminalReply: string; lastText: string }): string {
  if (args.tripwire) return args.tripwireReason;
  return args.terminalReply || args.lastText || '';
}

/**
 * The DETERMINISTIC structured-reply renderer — PURE and DOMAIN-NEUTRAL. Joins whatever fields the model
 * supplied, in a stable order (intro, bullet items, question, caution), using only newlines and a "- "
 * bullet prefix. Writes NO natural-language content itself. Every field is passed through
 * {@link stripThinkBlocks} first. Exported for the unit test.
 */
export function renderStructuredReply(args: Record<string, unknown>): string {
  const asStr = (v: unknown): string => (typeof v === 'string' ? stripThinkBlocks(v).trim() : '');
  const intro = asStr(args.intro);
  const items = Array.isArray(args.items)
    ? args.items.filter((x): x is string => typeof x === 'string').map((s) => stripThinkBlocks(s).trim()).filter(Boolean).slice(0, 8)
    : [];
  const question = asStr(args.question);
  const caution = asStr(args.caution);
  const blocks: string[] = [];
  if (intro) blocks.push(intro);
  if (items.length) blocks.push(items.map((it) => `- ${it}`).join('\n'));
  if (question) blocks.push(question);
  if (caution) blocks.push(caution);
  return blocks.join('\n\n').trim();
}

/**
 * A distinctive, domain-neutral marker embedded in EVERY steering/forcing prompt this driver injects. A
 * weak local model sometimes PARROTS a steering prompt into its reply; because the marker rides along,
 * {@link scrubSteeringEcho} can drop those echoed lines. Bracketed + ASCII so it never collides with a
 * legitimate business reply and keeps the runtime language-neutral.
 */
export const STEERING_SENTINEL = '[[close-turn]]';

/**
 * Scrub runtime STEERING ECHO out of a model-produced candidate reply — PURE and DOMAIN-NEUTRAL (injects
 * no words; only drops what the model parroted from THIS driver's scaffolding). A LINE-based walk:
 *   (a) a fenced ```…``` block whose body carries a `"kind":` field is DROPPED (the model NARRATING the
 *       replyStructured schema as TEXT instead of calling the tool); a non-narration fenced block is kept;
 *   (b) any LINE containing the {@link STEERING_SENTINEL} is DROPPED (a parroted forcing prompt).
 * Removed lines are elided; a leftover run of 3+ newlines collapses to one blank line, then trimmed.
 * Returns '' when nothing survives. Exported for test.
 */
export function scrubSteeringEcho(text: string): string {
  if (!text) return text;
  const hasKind = (s: string): boolean => /"kind"\s*:/.test(s);
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const original = lines[i];
    const line = original.replace(/```[a-zA-Z0-9]*[ \t]*[^\n]*?```/g, (b) => (hasKind(b) ? '' : b));
    if (line.trim() === '' && original.trim() !== '') { i++; continue; }
    if ((line.match(/```/g)?.length ?? 0) % 2 === 1) {
      const block = [line];
      i++;
      while (i < lines.length) {
        block.push(lines[i]);
        const closed = lines[i].includes('```');
        i++;
        if (closed) break;
      }
      const joined = block.join('\n');
      if (!hasKind(joined)) out.push(joined);
      continue;
    }
    if (line.includes(STEERING_SENTINEL)) { i++; continue; }
    out.push(line);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Commit the SINGLE winning reply to the world — micro-loop mode ONLY. Every terminal ATTEMPT runs DRY
 * (records its candidate into the ledger, never touches the world). Once the driver has the FINAL text it
 * calls this EXACTLY ONCE through the SAME `replyToUser` seam the certified terminals use, so the world
 * logs one reply per turn. A blank finalText is a no-op. Exported for test.
 */
export async function commitFinalReply(world: AgentWorld, finalText: string): Promise<void> {
  if (finalText.trim()) await world.exec('replyToUser', { text: finalText });
}

// ── Micro-loop turn protocol (appended to the SAME scoped trunk the certified path renders) ──
const MICRO_PROTOCOL =
  '\n\n## Turn protocol (ABSOLUTE — one action per step)\n' +
  '- Each step you MUST call EXACTLY ONE tool. Do the domain tools you need first, one per step, reading each result before the next.\n' +
  '- To speak to the user, call **replyStructured**: set `kind` and put the message in `intro`, `items` (bullet lines), `question`, and/or `caution`. The system renders the text — never write a free-text reply.\n' +
  '- You MAY instead call **replyToUser** (final answer) or **askUser** (one question) if a single free-text field fits better.\n' +
  '- The turn ends the moment you call one terminal (replyStructured / replyToUser / askUser).';
const MICRO_PROTOCOL_REPLY_ONLY =
  '\n\n## Turn protocol (ABSOLUTE — one action per step)\n' +
  '- Each step you MUST call EXACTLY ONE tool. Do the domain tools you need first, one per step, reading each result before the next.\n' +
  '- Never ask the user a question — make the most reasonable assumption and PROCEED.\n' +
  '- To speak to the user, call **replyStructured** (set `kind` + `intro`/`items`/`caution`) or **replyToUser**. The system renders replyStructured text — never write a free-text reply.\n' +
  '- The turn ends the moment you call one terminal.';

/** Fold one generate()'s usage into the running per-turn accumulator. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accUsage(acc: TokenUsage, u: any): void {
  const add = (a: number | null, b: number | null | undefined): number | null => (b == null ? a : (a ?? 0) + b);
  acc.input = add(acc.input, u?.inputTokens);
  acc.output = add(acc.output, u?.outputTokens);
  acc.reasoning = add(acc.reasoning, u?.reasoningTokens);
  acc.cacheRead = add(acc.cacheRead, u?.cachedInputTokens);
  acc.total = add(acc.total, u?.totalTokens);
}

/**
 * Run one case (all turns) for `spec` under the MICRO-LOOP driver. SAME signature + return shape as
 * {@link runSpecConversation}, so a host can switch on a flag. Only the GENERATION strategy differs:
 * forced single-tool micro-steps + a structured terminal.
 */
export async function runSpecConversationMicroLoop(spec: AgentSpec, turns: TurnInput[], deps: RuntimeDeps): Promise<RunResult> {
  const { world, model } = deps;
  const theme: TrunkTheme | undefined = deps.theme ?? spec.theme;
  if (!theme && !spec.surface.systemPrompt) {
    throw new Error(`runSpecConversationMicroLoop: spec "${spec.id}" has no theme — pass deps.theme or set spec.theme.`);
  }
  const genParams = resolveModelSettings(normalizeModelParams(deps.modelParams ?? {}), spec.controls.sampling);
  const baseSettings = (genParams.modelSettings ?? {}) as Record<string, unknown>;
  const withCap = (cap: number) => ({ ...genParams, modelSettings: { ...baseSettings, maxOutputTokens: cap } });
  // A per-agent sampling.maxOutputTokens (if set) already flows through genParams; here it also becomes
  // the per-step cap so the anti-ramble bound is respected.
  const microStepTokens = spec.controls.sampling?.maxOutputTokens ?? MICRO_STEP_TOKENS;
  const forceTokens = spec.controls.sampling?.maxOutputTokens ?? FORCE_TOKENS;
  const maxSteps = spec.controls.maxSteps ?? deps.maxSteps ?? DEFAULT_MICRO_STEPS;
  const redrives = spec.controls.redrives ?? deps.redrives ?? DEFAULT_REDRIVES;
  const surface = new Set(spec.surface.tools);

  const ledger = createLedger();

  // Record a terminal ATTEMPT's already-scrubbed candidate text DRY — it NEVER touches the world.
  const recordDryTerminal = (cleanText: string, toolName: string, args: Record<string, unknown>): unknown => {
    if (cleanText.trim()) {
      ledger.terminalReply = recordTerminalReply(ledger.terminalReply, cleanText);
      ledger.observed.push({ name: toolName, args, ok: true, turnIndex: ledger.turnIndex });
      return { ok: true };
    }
    ledger.observed.push({ name: toolName, args, ok: false, turnIndex: ledger.turnIndex });
    return { success: false, error: `${STEERING_SENTINEL} Empty after removing internal steering text - write the actual user-facing message, then call the terminal again.` };
  };

  // Build Mastra tools: the agent's surface + the free terminals (from toolDefs) + replyStructured.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mastraTools: Record<string, any> = {};
  for (const def of deps.toolDefs) {
    if (!surface.has(def.name) && !FREE_TERMINAL.has(def.name)) continue;
    if (FREE_TERMINAL.has(def.name)) {
      mastraTools[def.name] = createTool({
        id: def.name,
        description: def.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: jsonSchemaToZodObject(def.inputSchema) as any,
        execute: async (input: unknown) => {
          const args = (input ?? {}) as Record<string, unknown>;
          const text = scrubSteeringEcho(stripThinkBlocks(typeof args.text === 'string' ? args.text : ''));
          return recordDryTerminal(text, def.name, args);
        },
      });
      continue;
    }
    mastraTools[def.name] = createTool({
      id: def.name,
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: jsonSchemaToZodObject(def.inputSchema) as any,
      execute: async (input: unknown) => world.exec(def.name, (input ?? {}) as Record<string, unknown>),
    });
  }
  mastraTools[STRUCTURED_TERMINAL] = createTool({
    id: STRUCTURED_TERMINAL,
    description: 'Send the final user-facing message as STRUCTURED fields; the system renders the text.',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: jsonSchemaToZodObject(REPLY_STRUCTURED_SCHEMA) as any,
    execute: async (input: unknown) => {
      const args = (input ?? {}) as Record<string, unknown>;
      const rendered = scrubSteeringEcho(renderStructuredReply(args));
      return recordDryTerminal(rendered, STRUCTURED_TERMINAL, args);
    },
  });

  let currentSystemPrompt = '';
  const agent = new Agent({
    name: `looprun-micro-${spec.id}`,
    instructions: () => currentSystemPrompt,
    model,
    tools: mastraTools,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const renderPrompt = spec.surface.systemPrompt ?? ((w: AgentWorld, u: string[]) => renderScopedSpecTrunk(w, spec, u, theme));

  // preTool veto hook — IDENTICAL contract to the certified path (terminals skip guards).
  const beforeToolCall = async ({ toolName, input }: { toolName: string; input: unknown }) => {
    if (MICRO_TERMINAL.has(toolName)) return undefined;
    const args = (input ?? {}) as Record<string, unknown>;
    const guards = resolveGuards(spec.guards.preTool, toolName);
    const gctx: GuardCtx = { args, tool: toolName, world, observed: ledger.observed, turnIndex: ledger.turnIndex, attachmentsThisTurn: ledger.attachments };
    for (const g of guards) {
      const reason = await g.check(gctx);
      if (reason) {
        ledger.observed.push({ name: toolName, args, ok: false, turnIndex: ledger.turnIndex });
        ledger.turnCorrections.push(`${g.dim}:${g.kind}:${toolName}`);
        ledger.vetoStreak++;
        const escalation = ledger.vetoStreak >= 2
          ? ` ${STEERING_SENTINEL} STOP: do not call any more domain tools this turn. Close NOW with replyStructured (or replyToUser), reporting only what actually succeeded.`
          : '';
        return { proceed: false as const, output: { success: false, error: reason + escalation } };
      }
    }
    ledger.vetoStreak = 0;
    return undefined;
  };

  const afterToolCall = async ({ toolName, input, output }: { toolName: string; input: unknown; output?: unknown }) => {
    if (MICRO_TERMINAL.has(toolName)) return;
    const args = (input ?? {}) as Record<string, unknown>;
    const ok = output !== undefined && resultOk(output);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requiresConfirmation = (output as any)?.requiresConfirmation === true;
    ledger.observed.push({ name: toolName, args, ok, turnIndex: ledger.turnIndex, ...(requiresConfirmation ? { resultFlags: { requiresConfirmation: true } } : {}) });
    if (ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lbl = (output as any)?.label;
      if (typeof lbl === 'string') ledger.producedThisTurn.push(lbl);
    }
    ledger.vetoStreak = 0;
    if (!spec.guards.postTool?.length) return;
    const postGuards = resolveGuards(spec.guards.postTool, toolName);
    if (!postGuards.length) return;
    const gctx: GuardCtx = { args, tool: toolName, world, observed: ledger.observed, turnIndex: ledger.turnIndex, attachmentsThisTurn: ledger.attachments, result: output };
    const { corrections, violations } = await enforcePostTool(postGuards, gctx);
    if (corrections.length) ledger.turnCorrections.push(...corrections);
    if (violations.length) ledger.postToolViolations.push(...violations);
  };

  const onInputGuards = resolveGuards(spec.guards.onInput);
  const inputProcessors = onInputGuards.length
    ? [{
        id: 'looprun-onInput',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async processInput(a: any) {
          const gctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: ledger.turnIndex };
          for (const g of onInputGuards) {
            const reason = await g.check(gctx);
            if (reason) { ledger.turnCorrections.push(`onInput:${g.kind}`); a.abort(reason); }
          }
          return a.messages;
        },
      }]
    : undefined;

  const turnRecords: TurnRecord[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];
  let errorMsg: string | undefined;

  for (let i = 0; i < turns.length; i++) {
    if (i > 0) world.advanceTurn();
    beginTurn(ledger, i);

    const attUrls = (turns[i].attachments ?? []) as string[];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    ledger.attachments = attLabels;
    const attDisplay = attLabels.map((l, k) => {
      const base = attUrls[k]?.split('/').pop();
      return base ? `${l} (${base})` : l;
    });
    const userText = turns[i].userText;

    const replyOnly = spec.controls.terminal ? spec.controls.terminal(world) === true : false;
    const protocol = replyOnly ? MICRO_PROTOCOL_REPLY_ONLY : MICRO_PROTOCOL;
    const terminalTools = replyOnly ? [STRUCTURED_TERMINAL, 'replyToUser'] : [STRUCTURED_TERMINAL, 'replyToUser', 'askUser'];
    const activeTools = [...surface, ...terminalTools];

    currentSystemPrompt = renderPrompt(world, attLabels) + protocol;

    const before = world.toolCalls.length;
    const sseBefore = world.sseActions.length;

    const stateBlock = theme ? theme.stateBlock(world) : '';
    const tailParts: string[] = [];
    if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
    if (attLabels.length) tailParts.push(`[Uploads this turn: ${attDisplay.join(', ')}]`);
    tailParts.push(userText);
    messages.push({ role: 'user', content: tailParts.join('\n\n') });
    const t0 = Date.now();

    try {
      let stepCount = 0;
      let extraCalls = 0;
      let tripwire = false;
      let tripwireReason = '';
      let lastReasoning: string | null = null;
      const usageAcc: TokenUsage = { input: null, output: null, reasoning: null, cacheRead: null, cacheWrite: null, total: null };

      // ── Micro-step loop: ONE forced tool call per generate (the anti-ramble constraint) ──
      for (let step = 0; step < maxSteps; step++) {
        if (ledger.terminalReply.trim()) break;
        if (ledger.vetoStreak >= VETO_STORM_LIMIT) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gen: any = await (agent.generate as any)(messages, {
          activeTools,
          toolChoice: 'required',
          stopWhen: [stepCountIs(1)],
          hooks: { beforeToolCall, afterToolCall },
          ...(inputProcessors && step === 0 ? { inputProcessors } : {}),
          ...withCap(microStepTokens),
        });
        if (gen.response?.messages) messages.push(...gen.response.messages);
        accUsage(usageAcc, gen.totalUsage);
        if (gen.reasoningText) lastReasoning = gen.reasoningText;
        stepCount++;
        ledger.turnCorrections.push('microloop:step');
        if (gen.tripwire) { tripwire = true; tripwireReason = String(gen.tripwireReason ?? gen.reason ?? ''); break; }
      }

      // ── Terminal forcing: if no terminal landed, ONE grammar-forced replyStructured close ──
      // EPHEMERAL steering call: `forcePrompt` is spliced into THIS generate's message array only (never
      // pushed to the persistent `messages`), and the response is not pushed either — the tool call's SIDE
      // EFFECT (ledger.terminalReply) already survives regardless.
      if (!tripwire && !ledger.terminalReply.trim()) {
        const forcePrompt = replyOnly
          ? `${STEERING_SENTINEL} Close the turn now: call replyStructured. Set \`kind\` and put what you did in \`intro\`/\`items\`. Do NOT ask a question.`
          : `${STEERING_SENTINEL} Close the turn now: call replyStructured. Set \`kind\` and put the complete user-facing message in \`intro\`/\`items\` (or \`question\` to ask one thing).`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fb: any = await (agent.generate as any)([...messages, { role: 'user', content: forcePrompt }], {
          activeTools: [STRUCTURED_TERMINAL],
          toolChoice: 'required', // single active tool + required = effective forcing (llama-server ignores the named form)
          stopWhen: [stepCountIs(1)],
          hooks: { beforeToolCall, afterToolCall },
          ...withCap(forceTokens),
        });
        accUsage(usageAcc, fb.totalUsage);
        extraCalls++;
        ledger.turnCorrections.push('microloop:forced-terminal');
      }

      // ── flowChain completion — IDENTICAL contract to the certified path ──
      if (spec.controls.chains?.length) {
        const chainPass = await runChainCompletionPass(spec.controls.chains, {
          world,
          observed: ledger.observed,
          turnIndex: i,
          terminalReplyPresent: ledger.terminalReply.trim().length > 0,
          beforeToolCall,
          afterToolCall,
          forceLlmCall: async (call: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cc: any = await (agent.generate as any)(
              [...messages, { role: 'user', content: `Complete the required follow-up now: call ${call} with the correct arguments for what the user asked. Do not reply in text.` }],
              { activeTools: [call], toolChoice: 'required', stopWhen: [stepCountIs(2)], hooks: { beforeToolCall, afterToolCall }, ...genParams },
            );
            if (cc.response?.messages) messages.push(...cc.response.messages);
          },
        });
        if (chainPass.corrections.length) ledger.turnCorrections.push(...chainPass.corrections);
        if (chainPass.replyViolations.length) ledger.postToolViolations.push(...chainPass.replyViolations);
        extraCalls += chainPass.llmCalls;
      }

      // Micro-loop terminals are MANDATORY: raw step text is never a deliverable reply. Empty → emptyReply
      // violation → forced redrive → deterministic exhaustion.
      let answerText = assembleAnswerText({ tripwire, tripwireReason, terminalReply: ledger.terminalReply, lastText: '' });

      // Deterministic egress: jargonScrub mutators, applied before the final checks (as certified).
      for (const m of resolveMutators(spec.guards.onReplyMutate)) {
        const mctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: i, reply: answerText, producedThisTurn: ledger.producedThisTurn };
        const out = m.apply(answerText, mctx);
        if (out !== answerText) { ledger.turnCorrections.push(`mutate:${m.kind}`); answerText = out; }
      }

      // onReply checks — a redrive here is ONE MORE forced replyStructured step (not free text).
      const replyChecks = resolveGuards(spec.guards.onReply);
      const checkReply = async (text: string): Promise<ReplyViolation[]> => {
        const rctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: i, reply: text, producedThisTurn: ledger.producedThisTurn, attachmentsThisTurn: ledger.attachments, notes: ledger.turnCorrections };
        const out: ReplyViolation[] = [];
        for (const g of replyChecks) { const r = await g.check(rctx); if (r) out.push({ guard: g, reason: r }); }
        return out;
      };
      let violations = await checkReply(answerText);
      if (ledger.postToolViolations.length) violations = [...ledger.postToolViolations, ...violations];
      for (let r = 0; r < redrives && violations.length; r++) {
        const correction = violations.map((v) => `- ${v.reason}`).join('\n');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const re: any = await (agent.generate as any)(
          [...messages, { role: 'user', content: `${STEERING_SENTINEL} Your last reply needs fixing:\n${correction}\n${STEERING_SENTINEL} Call replyStructured now with the corrected message in the user's language.` }],
          {
            activeTools: [STRUCTURED_TERMINAL],
            toolChoice: 'required', // single active tool + required = effective forcing (llama-server ignores the named form)
            stopWhen: [stepCountIs(1)],
            hooks: { beforeToolCall, afterToolCall },
            ...withCap(forceTokens),
          },
        );
        accUsage(usageAcc, re.totalUsage);
        extraCalls++;
        for (const v of violations) ledger.turnCorrections.push(`redrive:${v.guard.kind}`);
        ledger.turnCorrections.push('microloop:redrive');
        answerText = recordTerminalReply(answerText, ledger.terminalReply);
        violations = await checkReply(answerText);
      }
      const finalViolations = violations.map((v) => v.guard.kind);
      if (finalViolations.length) {
        const okTools = ledger.observed.filter((o) => o.turnIndex === i && o.ok).map((o) => o.name);
        const closure = spec.controls.exhaustionReply
          ? spec.controls.exhaustionReply(world, okTools, ledger.producedThisTurn, finalViolations)
          : defaultExhaustionReply(theme, world, okTools, ledger.producedThisTurn, finalViolations);
        ledger.turnCorrections.push('exhaustion-terminal');
        answerText = closure;
      }

      // SINGLE world commit: every terminal ATTEMPT ran DRY. Now that answerText is final, send it to the
      // world EXACTLY once through the replyToUser seam. Placed BEFORE the toolCalls slice below.
      await commitFinalReply(world, answerText);

      const durationMs = Date.now() - t0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newCalls = world.toolCalls.slice(before).map((tc: any) => ({
        name: tc.name, args: tc.args, resultSummary: JSON.stringify(tc.result ?? null).slice(0, 800), tookEffect: tc.tookEffect, latencyMs: 0,
      }));
      const totalSteps = stepCount + extraCalls;

      turnRecords.push({
        userText, assistantFinalText: answerText, finalMode: spec.mode, assistantMsgCount: 1,
        iters: totalSteps, llmCalls: totalSteps, toolCalls: newCalls, thoughts: lastReasoning,
        tokens: usageAcc, llmCallLatenciesMs: [durationMs], durationMs, maxIterHit: stepCount >= maxSteps,
        recoveryEvents: ledger.turnCorrections.length ? ledger.turnCorrections.slice() : [],
        sseActions: world.sseActions.slice(sseBefore), attachments: attLabels,
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      errorMsg = String(e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (process.env.DEBUG_ERR) console.error('\n[looprun-micro ERR]', (e as any)?.message ?? String(e));
      turnRecords.push({
        userText, assistantFinalText: '', finalMode: spec.mode, assistantMsgCount: 0,
        iters: 0, llmCalls: 1, toolCalls: [], thoughts: null,
        tokens: { input: null, output: null, reasoning: null, cacheRead: null, cacheWrite: null, total: null },
        llmCallLatenciesMs: [durationMs], durationMs, maxIterHit: false, recoveryEvents: ['error'],
      });
      break;
    }
  }

  return { turnRecords, messages, errorMsg };
}
