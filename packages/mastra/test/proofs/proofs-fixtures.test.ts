/**
 * Smoke test for the testing kit — proves the kit works end-to-end:
 *  - FixtureWorld determinism (identical exec sequences → identical toolCalls),
 *  - resultOk shapes for the fixture tool results,
 *  - the scripted model pops steps + reports the right finishReason,
 *  - a full runProofLoop clean pass (assistantFinalText correct, recoveryEvents empty),
 *  - a full runProofLoop preTool veto (recoveryEvents carries the `${dim}:${kind}:${tool}` tag).
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, requiresBefore, resultOk } from '@looprun-ai/core';
import {
  FixtureWorld,
  FIXTURE_TOOL_NAMES,
  FIXTURE_LABEL_SCHEME,
  FIXTURE_THEME,
} from '@looprun-ai/core/testing';
import { fakeLLM, runProofLoop } from '../../src/testing/index.js';

const trivialSpec = () =>
  new AgentSpecBase({ id: 'smoke', mode: 'PROOF', persona: 'You are the proof agent.', tools: [...FIXTURE_TOOL_NAMES], theme: FIXTURE_THEME });

describe('FixtureWorld — deterministic', () => {
  const drive = (w: FixtureWorld) => {
    w.exec('createItem', { title: 'a' });
    w.exec('createMedia', { prompt: 'p' });
    w.exec('deleteItem', { id: 'p001' });
    w.exec('deleteItem', { id: 'p001', confirmed: true });
    return w.toolCalls;
  };

  it('two identical exec sequences produce identical toolCalls', () => {
    const a = drive(new FixtureWorld('empty'));
    const b = drive(new FixtureWorld('empty'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seeds media labels per preset and follows the business-free label scheme', () => {
    const seeded = new FixtureWorld('seeded-media');
    expect(seeded.hasMediaLabel('u900')).toBe(true);
    expect(seeded.hasMediaLabel('g001')).toBe(true);
    // next generated label is g002, next upload is u901
    expect((seeded.exec('createMedia', { prompt: 'x' }) as { label: string }).label).toBe('g002');
    expect(seeded.ingestAttachment('http://x/a.png')).toBe('u901');
    expect(FIXTURE_LABEL_SCHEME.uploadRe.test('u900')).toBe(true);
    expect(FIXTURE_LABEL_SCHEME.uploadRe.test('g001')).toBe(false);
  });

  it('quota-exhausted → createMedia fails; has-primary → hasPrimary true', () => {
    expect(new FixtureWorld('quota-exhausted').quotaRemaining()).toBe(0);
    expect(new FixtureWorld('has-primary').hasPrimary()).toBe(true);
  });
});

describe('resultOk — fixture tool result shapes', () => {
  const w = new FixtureWorld('seeded-media');
  it('ok results pass, failure/probe shapes classify correctly', () => {
    expect(resultOk(w.exec('createItem', { title: 'a' }))).toBe(true);
    expect(resultOk(w.exec('listItems', {}))).toBe(true);
    // a deleteItem probe is an OK result (requiresConfirmation), not a failure
    expect(resultOk(w.exec('deleteItem', { id: 'p001' }))).toBe(true);
    // quota-exhausted createMedia → { success:false } → failure
    const exhausted = new FixtureWorld('quota-exhausted');
    expect(resultOk(exhausted.exec('createMedia', { prompt: 'x' }))).toBe(false);
  });
});

describe('fakeLLM — scripted model', () => {
  it('pops steps and reports finishReason', async () => {
    const scripted = fakeLLM([[{ tool: 'listItems', args: {} }], [{ text: 'done' }]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g1: any = await (scripted.model as any).doGenerate({});
    expect(g1.finishReason).toBe('tool-calls');
    expect(g1.content[0].type).toBe('tool-call');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g2: any = await (scripted.model as any).doGenerate({});
    expect(g2.finishReason).toBe('stop');
    expect(g2.content[0]).toMatchObject({ type: 'text', text: 'done' });
    expect(scripted.calls()).toBe(2);
  });
});

describe('runProofLoop — full loop', () => {
  it('clean pass: domain tool then replyToUser, no recovery events', async () => {
    const res = await runProofLoop(trivialSpec(), {
      preset: 'empty',
      turns: [{ userText: 'list my items' }],
      script: [[{ tool: 'listItems', args: {} }], [{ tool: 'replyToUser', args: { text: 'Here are your items.' } }]],
      expect: 'pass',
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(1);
    expect(res.turnRecords[0].assistantFinalText).toBe('Here are your items.');
    expect(res.turnRecords[0].recoveryEvents).toEqual([]);
  });

  it('preTool veto: requiresBefore fires with the spatial tag', async () => {
    const spec = trivialSpec();
    spec.addGuard('preTool', ['createItem'], requiresBefore(['searchItem']), { id: 'agent:requiresBefore' });
    const res = await runProofLoop(spec, {
      preset: 'empty',
      turns: [{ userText: 'create an item' }],
      script: [
        [{ tool: 'createItem', args: { title: 'x' } }],
        [{ tool: 'replyToUser', args: { text: 'I need to search first.' } }],
      ],
      expect: 'veto',
      tool: 'createItem',
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).toContain('spatial:requiresBefore:createItem');
  });
});
