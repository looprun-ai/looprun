/**
 * Chapters 05–06 are honest at runtime too: the scripted conversation really runs (and the clash
 * guard really vetoes), the eval subject really loads, and its five preflight lints are really
 * clean — so no chapter can quote a subject the CLI would reject.
 *
 * `scriptedModel` comes from `@looprun-ai/mastra/testing`, the test-only entry point. It is not one
 * of the 89 taught symbols and no chapter teaches it; it is here so the run costs nothing.
 * `renderAssembledPrompt` (from `@looprun-ai/core/internal`) is likewise test-only plumbing, used
 * here only to prove the ungoverned variant's prompt byte-identity — no chapter teaches it either.
 */
import { describe, expect, it } from 'vitest';
import { scriptedModel } from '@looprun-ai/mastra/testing';
import { createModelServer } from '@looprun-ai/server';
import { renderAssembledPrompt } from '@looprun-ai/core/internal';
import {
  SCHEDULER_TURNS,
  SUBJECT_DIR,
  executedToolNames,
  guardEvents,
  loadSchedulerSubject,
  preflight,
  routedAgent,
  runScheduler,
  ungovernedVariant,
} from '../05-running-and-eval.ts';
import { calendarStateView, nativeWorld, schedulerServerConfig } from '../06-advanced.ts';
import { SCHEDULER_TOOLS } from '../scheduler/tools.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('05 · runSpecConversation over the scheduler', () => {
  it('answers turn 1 and refuses the clashing booking in turn 2', async () => {
    const scripted = scriptedModel([
      // turn 1: read the calendar, then close the turn. ONE terminal (`respond`): the prose rides
      // `message` and `did` declares what the turn IS — here a single `inform` speech intention.
      [{ tool: 'listEvents', args: {} }],
      [{ tool: 'respond', args: { message: 'Standup on Monday 10:00 and the dentist on Wednesday 15:00.', did: [{ op: 'inform' }] } }],
      // turn 2: the clashing booking — vetoed before execution, so the model asks instead. The
      // attempt is declared honestly (`blocked`, never `success`) and asking is an `ask` intention.
      [{ tool: 'addEvent', args: { label: 'Design review', start: '2026-03-02T10:15', end: '2026-03-02T10:45' } }],
      [
        {
          tool: 'respond',
          args: {
            message: 'That clashes with Standup (10:00–10:30). Move it or replace it?',
            did: [{ op: 'addEvent', targetValue: 'Design review', outcome: 'blocked' }, { op: 'ask' }],
          },
        },
      ],
    ]);

    const result = await runScheduler(scripted.model);

    expect(result.errorMsg).toBeUndefined();
    expect(result.turnRecords).toHaveLength(SCHEDULER_TURNS.length);
    expect(executedToolNames(result.turnRecords[0]!)).toEqual(['listEvents']);
    // The vetoed call never reached the world: no addEvent in turn 2's executed calls.
    expect(executedToolNames(result.turnRecords[1]!)).toEqual([]);

    // THE DELIVERED REPLY, both turns — the chapter's whole claim is that the user READS these.
    // Asserting only guard events let a broken flow pass: when `addEvent` took its subject under
    // `title` (not an identity key) the vetoed attempt named nothing the action history recognised,
    // `claimIsGrounded` denied the honest `blocked` declaration, and the engine's exhaustion closure
    // was delivered INSTEAD of the sentence printed in the chapter — invisibly, because the four
    // recovery events still contained the one this test looked for.
    expect(result.turnRecords[0]!.assistantFinalText).toBe(
      'Standup on Monday 10:00 and the dentist on Wednesday 15:00.\n\nNo operation was carried out on this turn.',
    );
    // Turn 2 is the COMPOSED delivery: the model's `message`, then the operation report the ENGINE
    // rendered from the verified declaration. `blocked` on `Design review` grounded against the vetoed
    // attempt's own args, so the user is told the booking did not happen — by the engine, not the model.
    expect(result.turnRecords[1]!.assistantFinalText).toBe(
      'That clashes with Standup (10:00–10:30). Move it or replace it?\n\nDesign review: not permitted\nNothing else was changed on this turn.',
    );

    // The recovery-event set is EXACTLY what the chapter claims: one veto, nothing else. A redrive,
    // a salvage miss or an exhaustion terminal here means the taught flow does not close cleanly.
    expect(guardEvents(result)).toEqual(['run:noDoubleBook:addEvent']);
  });
});

describe('05 · the scheduler eval subject', () => {
  it('loads the fixed layout and routes its cases', async () => {
    const subject = await loadSchedulerSubject();

    expect(Object.keys(subject.specs)).toEqual(['scheduler']);
    expect(subject.toolDefs.map((t) => t.name)).toEqual(SCHEDULER_TOOLS.map((t) => t.name));
    expect(subject.cases.map((c) => c.id)).toEqual([
      '01-double-book-refused',
      '02-cancel-asks-first',
      '03-empty-day-is-read-once',
    ]);
    // One spec ⇒ every case routes to it, with no CASE_AGENT map.
    expect(routedAgent(subject, '01-double-book-refused')).toBe('scheduler');
  });

  it('keeps gen/tools.json byte-faithful to the authored ToolDef[]', async () => {
    const onDisk = JSON.parse(readFileSync(join(SUBJECT_DIR, 'gen', 'tools.json'), 'utf8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(SCHEDULER_TOOLS)));
  });

  it('passes every preflight lint the CLI runs', async () => {
    const subject = await loadSchedulerSubject();
    expect(await preflight(subject)).toEqual([]);
  });

  it('ungoverned variant: prompt byte-identical, enforcement disarmed', async () => {
    const subject = await loadSchedulerSubject();
    const original = subject.specs.scheduler!;
    const { spec, contract } = ungovernedVariant(subject, '01-double-book-refused');

    // enforcement disarmed: every guard hook empty, no chains/exhaustion reply, no route detector
    expect(spec.guards.preTool).toEqual([]);
    expect(spec.guards.onReply).toEqual([]);
    expect(spec.controls.chains).toBeUndefined();
    expect(spec.controls.exhaustionReply).toBeUndefined();
    expect(spec.simulatableToolNames).toBeUndefined();

    // prompt kept byte-identical to the governed assembled prompt: prose (rules, invariants) survives
    const world = subject.makeWorld('default');
    const governedPrompt = renderAssembledPrompt(world, original, [], subject.contract);
    expect(spec.surface.systemPrompt).toBeDefined();
    expect(spec.surface.systemPrompt!(world, [])).toBe(governedPrompt);

    // …while the tool surface stays: only enforcement is removed.
    expect(spec.surface.tools).toEqual(original.surface.tools);
    expect(original.guards.preTool.length).toBeGreaterThan(0); // never mutated
  });
});

describe('06 · the served agent', () => {
  it('answers a governed turn over the OpenAI-compatible route, with the looprun envelope', async () => {
    const scripted = scriptedModel([
      [{ tool: 'listEvents', args: {} }],
      [{ tool: 'respond', args: { message: 'Standup on Monday 10:00 and the dentist on Wednesday 15:00.', did: [{ op: 'inform' }] } }],
    ]);
    // Port 0 (ephemeral) so the suite never fights the chapter's 8099 or a parallel run.
    const server = await createModelServer({ ...schedulerServerConfig(scripted.model, () => {}), port: 0 });
    try {
      const res = await fetch(`${server.url}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-looprun-session': 'demo' },
        body: JSON.stringify({ model: 'scheduler', messages: [{ role: 'user', content: 'What is on my calendar this week?' }] }),
      });
      const body = (await res.json()) as { choices: Array<{ message: { content: string } }>; looprun: Record<string, unknown> };

      expect(body.choices[0]!.message.content).toContain('Standup');
      // The wire envelope carries the governance metadata MINUS the observed action history (server-side only).
      expect(Object.keys(body.looprun).sort()).toEqual(['corrections', 'exhausted', 'sessionId', 'turnIndex', 'violations']);
      expect(body.looprun.sessionId).toBe('demo');
    } finally {
      await server.close();
    }
  });
});

describe('06 · the native-tools world', () => {
  it('serves state reads and throws on exec', () => {
    expect(calendarStateView.snapshot()).toEqual([]);
    expect(nativeWorld.snapshot()).toEqual([]);
    expect(() => nativeWorld.exec('addEvent', {})).toThrow(/native-tools mode/);
  });
});
