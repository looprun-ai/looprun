/**
 * BEST-ATTEMPT FINALIZATION — the TRUTH/SAFETY ↔ FORM frontier.
 *
 * When the bounded redrive cannot repair a reply, the finalizer looks for a candidate the turn
 * already produced: the `text` arg of a successful terminal call. What it may do with that candidate
 * is exactly what this file pins.
 *
 *  (a) a candidate that trips a TRUTH guard is NEVER delivered — the canned closure wins;
 *  (b) a candidate that trips only a FORM contract IS delivered — a true answer beats a stub;
 *  (c) no candidate at all ⇒ the closure, and a non-empty reply regardless.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import type { RunResult } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import type { ScriptStep } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';

/** A behavior-dim `custom` TRUTH guard arms the check the (a) case needs. Under the no-regex law, text
 *  judgment is a `custom`/`llmCheck` job, and a behavior-dim guard is TRUTH by construction (never
 *  salvaged over). This one denies an "I can't/unable to" claim — a deterministic stand-in for a text
 *  honesty rubric in this salvage proof. */
const truthCheck = () =>
  custom({
    kind: 'falseFailureTruth',
    dim: 'behavior',
    check: (ctx) => (/\b(?:can(?:no|')t|unable to)\b/i.test(ctx.reply ?? '') ? 'do not claim inability' : null),
    prose: () => 'never claim you could not do something your tools actually did',
  });

const spec = (): AgentSpecBase => {
  const s = new AgentSpecBase({
    id: 'proof-salvage',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    contract: FIXTURE_DOMAIN,
  });
  s.addGuard('onReply', 'any', truthCheck(), { id: 'agent:falseFailureTruth' });
  return s;
};

const run = (s: AgentSpecBase, script: ScriptStep[]): Promise<RunResult> =>
  runSpecConversation(s, [{ userText: 'do the thing' }], {
    model: fakeLLM(script).model,
    modelParams: {},
    world: new FixtureWorld('seeded-media'),
    toolDefs: FIXTURE_TOOL_DEFS,
    contract: FIXTURE_DOMAIN,
    redrives: 1,
  });

describe('best-attempt finalization', () => {
  it('never delivers a candidate that trips a TRUTH guard', async () => {
    const res = await run(spec(), [
      [{ tool: 'createItem', args: { title: 'Gamma' } }],
      // The create SUCCEEDED; this claims it did not.
      [{ tool: 'respond', args: { message: "I can't create that item right now.", did: [{ op: 'inform' }] } }],
      [{ text: 'Sorry, I was unable to do it.' }],
    ]);

    const rec = res.turnRecords[0];
    expect(res.errorMsg).toBeUndefined();
    expect(rec?.recoveryEvents).toContain('exhaustion-terminal');
    expect(rec?.recoveryEvents?.some((e) => e.startsWith('salvage:form-only:'))).toBe(false);
    expect(rec?.recoveryEvents?.some((e) => e.startsWith('salvage-miss:checks:falseFailureTruth'))).toBe(true);
    expect(rec?.assistantFinalText).not.toContain("can't create that item");
  });

  it('delivers a true candidate that trips only a FORM contract', async () => {
    // `degenerationGuard` is the SOLE salvageable FORM contract — an artifact-shape lint, and the only
    // shipped guard kind that reads the reply at all. It is AUTO-installed (minimal layer), so `spec()`
    // already carries it; a run-away repeated-line message trips it on FORM while stating nothing false,
    // so the candidate is delivered over the generic closure.
    const s = spec();
    const LINE = 'I listed your items: Alpha and Beta.';
    const CANDIDATE = `${LINE}\n${LINE}\n${LINE}`;

    const REDRAFT = 'Alpha and Beta.\nAlpha and Beta.\nAlpha and Beta.'; // differs from CANDIDATE, still degenerates
    const res = await run(s, [
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'respond', args: { message: CANDIDATE, did: [{ op: 'inform' }] } }],
      [{ text: REDRAFT }], // the redrive still degenerates (and ≠ candidate) → salvage the true candidate
    ]);

    const rec = res.turnRecords[0];
    expect(res.errorMsg).toBeUndefined();
    expect(rec?.recoveryEvents).not.toContain('exhaustion-terminal');
    expect(rec?.recoveryEvents).toContain('salvage:form-only:degenerationGuard');
    // The VERIFIED terminal arg wins over the redrive draft.
    expect(rec?.assistantFinalText).toBe(CANDIDATE);
  });

  it('falls back to the closure when the turn produced no candidate', async () => {
    // A free-text turn that trips the TRUTH guard and NEVER emits a `respond`: the forced-terminal
    // fallback also yields no terminal, so the salvage has no candidate to recover and the engine-derived
    // closure wins (non-empty by construction).
    const res = await run(spec(), [
      [{ tool: 'listItems', args: {} }],
      [{ text: 'I cannot do it.' }], // repeats — trips falseFailureTruth, and no respond is ever captured
    ]);

    const rec = res.turnRecords[0];
    expect(res.errorMsg).toBeUndefined();
    expect(rec?.recoveryEvents).toContain('salvage-miss:no-terminal-observed');
    expect(rec?.recoveryEvents).toContain('exhaustion-terminal');
    expect(rec?.recoveryEvents?.some((e) => e.startsWith('salvage:form-only:'))).toBe(false);
    expect((rec?.assistantFinalText ?? '').length).toBeGreaterThan(0);
  });
});
