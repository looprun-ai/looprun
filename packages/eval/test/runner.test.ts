/** Offline e2e of `runEval` on a toy config with a scripted model (no network, no LLM). */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLanguageModelV3 } from 'ai/test';
import { AgentSpecBase } from '@looprun-ai/core';
import type { AgentWorld, TrunkTheme } from '@looprun-ai/core';
import { runEval, buildCert, mergeVerdictFiles } from '../src/index.js';
import type { EvalConfig } from '../src/index.js';
import { writeFileSync } from 'node:fs';

const THEME: TrunkTheme = {
  voice: 'You are the assistant of Toy Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: '## Output language (ABSOLUTE)\nReply in the user language.',
};

function toyWorld(): AgentWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  return {
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'replyToUser' || name === 'askUser') return { success: true };
      const result = { success: true };
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: [],
  };
}

/** Script: every generation calls ping then replyToUser (two llm calls per turn). */
function scripted(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: (async () => {
      call++;
      const content =
        call % 2 === 1
          ? [{ type: 'tool-call', toolCallId: `c${call}`, toolName: 'ping', input: '{}' }]
          : [{ type: 'tool-call', toolCallId: `c${call}`, toolName: 'replyToUser', input: JSON.stringify({ text: 'pong' }) }];
      return { content, finishReason: 'tool-calls', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }, warnings: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  });
}

function toyConfig(outDir: string): EvalConfig {
  const spec = new AgentSpecBase({ id: 'toy', mode: 'TOY', persona: 'You are the toy agent.', tools: ['ping'], theme: THEME });
  return {
    domain: 'toy',
    specs: { toy: spec },
    worldFactory: () => toyWorld(),
    toolDefs: [
      { name: 'ping', description: 'Ping.', inputSchema: { type: 'object', properties: {} } },
      { name: 'pang', description: 'Never called.', inputSchema: { type: 'object', properties: {} } },
    ],
    cases: [
      {
        id: '01-ping',
        title: 'happy ping',
        setup: { preset: 'default' },
        turns: [{ userText: 'ping please' }],
        expectations: { invariants: { requiredToolCalls: [{ name: 'ping' }] }, rubric: [{ id: 'replies', description: 'Replies pong.' }] },
      },
      {
        id: '02-forbidden',
        title: 'invariant autofail',
        setup: { preset: 'default' },
        turns: [{ userText: 'ping please' }],
        expectations: { invariants: { forbiddenToolCalls: [{ name: 'ping' }] }, rubric: [{ id: 'never', description: 'n/a' }] },
      },
    ],
    caseMap: { toy: ['01-ping', '02-forbidden'] },
    model: { model: scripted(), label: 'scripted' },
    outDir,
  };
}

describe('runEval (offline)', () => {
  it('produces dump/autofail/tasks with the invariant gate applied', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'looprun-eval-'));
    const config = toyConfig(tmp);
    const lines: string[] = [];
    const summary = await runEval(config, { date: '2026-07-10', log: (l) => lines.push(l) });

    expect(summary.totals.cases).toBe(2);
    expect(summary.totals.invariantFails).toBe(1);
    expect(summary.totals.tokensOut).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('invariant gate'))).toBe(true);

    const dump = JSON.parse(readFileSync(summary.perAgent[0].dump, 'utf8'));
    expect(dump).toHaveLength(2);
    const ping = dump.find((r: { caseId: string }) => r.caseId === '01-ping');
    expect(ping.actualTrace).toEqual(['ping']);
    expect(ping.actualReply).toEqual(['pong']);
    expect(ping.invariantFailures).toEqual([]);

    const forbidden = dump.find((r: { caseId: string }) => r.caseId === '02-forbidden');
    expect(forbidden.invariantFailures[0]).toContain('forbiddenToolCall ping');

    const tasks = readFileSync(summary.perAgent[0].tasks, 'utf8').trim().split('\n');
    expect(tasks).toHaveLength(1); // the autofailed case gets NO judge task
    const task = JSON.parse(tasks[0]);
    expect(task).toMatchObject({ caseId: '01-ping', rep: 0 });
    expect(task.rubric[0]).toEqual({ id: 'replies', description: 'Replies pong.', critical: true });

    const autofail = JSON.parse(readFileSync(summary.perAgent[0].autofail, 'utf8'));
    expect(autofail[0]).toMatchObject({ caseId: '02-forbidden', rep: 0 });

    // Full pipeline: verdicts → judged.json → cert
    writeFileSync(join(summary.outDir, 'toy.verdicts.jsonl'),
      JSON.stringify({ caseId: '01-ping', rep: 0, verdicts: [{ id: 'replies', pass: true, reasoning: 'says pong' }], overall: 'pass' }) + '\n');
    const merge = mergeVerdictFiles(summary.perAgent[0].dump, join(summary.outDir, 'toy.verdicts.jsonl'));
    expect(merge).toMatchObject({ judged: 1, autofail: 1, missing: 0, pass: 1, total: 2 });

    const cert = buildCert(summary.outDir, { domain: 'toy', model: 'scripted', bar: 0.9, date: '2026-07-10' });
    expect(cert.overall).toEqual({ pass: 1, total: 2, rate: 0.5 });
    expect(cert.certified).toBe(false);
    expect(readFileSync(join(summary.outDir, 'CERT.md'), 'utf8')).toContain('BELOW BAR');
  });
});
