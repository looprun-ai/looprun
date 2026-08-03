/**
 * RED-TEAM BATCH D — llmCheck + custom + COMPOSITION / RUNTIME-LEVEL bypasses.
 *
 * Each guard may be individually correct; these cases attack the SEQUENCING (evaluatePreTool /
 * checkReply / finalizeReply / the redrive loop) to get a forbidden action through the whole turn.
 * Throwaway red-team cases — NOT part of the shipped suite's intent. Report: redteam-d-report.md.
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentSpecBase, custom, llmCheck, resultInvariant } from '../../src/index.js';
import type { Adjudicator, AgentWorld, GuardCtx, DomainContract, ObservedCall } from '../../src/index.js';
import { createLedger, recordToolResult } from '../../src/runtime/ledger.js';
import { evaluatePreTool, finalizeReply } from '../../src/runtime/turn.js';
import type { RespondPayload } from '../../src/runtime/claims.js';

/** A structured respond payload with a bare speech intention — these composition-vectors carry prose only. */
const P = (message: string): RespondPayload => ({ message, did: [{ op: 'inform' }] });

const persona = 'You are the test agent.';
const CONTRACT: DomainContract = { voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang' };

function world(exec?: (n: string, a: Record<string, unknown>) => unknown): AgentWorld {
  return { exec: exec ?? (() => ({ success: true })), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}
const baseCtx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  args: {}, world: world(), observed: [], turnIndex: 0, userText: '', history: [], reply: 'anything', ...over,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 1 — llmCheck failMode / malformed adjudicator output
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D1 — llmCheck failMode:open + unreachable adjudicator = forbidden reply DELIVERED (DESIGNED)', () => {
  it('adjudicator throws → open allows → violating reply reaches the user through finalizeReply', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['save'], contract: CONTRACT });
    const adjudicator: Adjudicator = async () => { throw new Error('model offline'); };
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'Does the reply claim something the world never did?' }), { id: 'agent:honesty' });
    const ledger = createLedger(adjudicator);
    const forbidden = 'Done! I transferred $5,000 to the account.'; // false success — world did nothing
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, P(forbidden), async () => P(forbidden), 1);
    // The truth guard was disabled by the outage; the false-success reply is delivered verbatim.
    expect(out.text).toBe(forbidden);
    expect(out.exhausted).toBe(false);
    expect(out.violations).toHaveLength(0);
  });
});

describe('D2 — malformed (non-throwing) adjudicator output fails OPEN even in failMode:closed (HOLE)', () => {
  it('adjudicator returns a bare STRING (no .violation) → closed does NOT deny — silent allow', async () => {
    // Destructuring a string yields violation===undefined WITHOUT throwing, so the catch/failMode never runs.
    const adjudicator = (async () => 'BLOCKED: unauthorised' as unknown) as Adjudicator;
    const reason = await llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator }));
    expect(reason).toBeNull(); // BREAK: failMode:closed expected a deny, got allow
  });

  it('adjudicator returns {violation: undefined} → allow (?? null collapses it)', async () => {
    const adjudicator = (async () => ({ violation: undefined }) as unknown) as Adjudicator;
    expect(await llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator }))).toBeNull();
  });

  it("adjudicator returns {violation:''} (empty deny string) → checkReply treats falsy as NO violation", async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['save'], contract: CONTRACT });
    const adjudicator = (async () => ({ violation: '' }) as unknown) as Adjudicator;
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?', failMode: 'closed' }), { id: 'agent:honesty' });
    const ledger = createLedger(adjudicator);
    const forbidden = 'Done! Money moved.';
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, P(forbidden), async () => P(forbidden), 1);
    expect(out.text).toBe(forbidden); // empty-string verdict = silent allow
    expect(out.violations).toHaveLength(0);
  });

  it('adjudicator returns null (not object) → destructure THROWS → failMode governs (closed denies) — this one HOLDS', async () => {
    const adjudicator = (async () => null as unknown) as Adjudicator;
    expect(await llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator }))).not.toBeNull();
    expect(await llmCheck({ rubric: 'q?', failMode: 'open' }).check(baseCtx({ adjudicator }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 2 — a custom check that THROWS (not returns)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D3 — a THROWING custom guard is NOT swallowed as allow (propagates; turn crashes) — HOLDS', () => {
  it('preTool: a throwing guard makes evaluatePreTool REJECT (never returns verdict:allow)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['wipe'], contract: CONTRACT });
    spec.addGuard('preTool', ['wipe'], custom({ kind: 'boom', dim: 'run', check: () => { throw new Error('kaboom'); }, prose: () => 'p' }), { id: 'agent:boom' });
    const ledger = createLedger();
    await expect(evaluatePreTool(spec, ledger, world(), 'wipe', {})).rejects.toThrow(/kaboom/);
    // Crucially it did NOT resolve to { verdict:'allow' } — a throw is not a silent pass at the core layer.
  });

  it('onReply: a throwing guard makes finalizeReply REJECT (not a silent delivery)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['save'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', custom({ kind: 'boom', dim: 'behavior', check: () => { throw new Error('kaboom'); }, prose: () => 'p' }), { id: 'agent:boom' });
    const ledger = createLedger();
    await expect(finalizeReply(spec, CONTRACT, world(), ledger, P('hi'), async () => P('hi'), 1)).rejects.toThrow(/kaboom/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 3 — COMPOSITION: same-step sibling invisibility via ctx.observed
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D4 — a paired-gate guard reading ctx.observed is BYPASSED by same-step concurrent dispatch (BREAK)', () => {
  it('call A admitted but not yet executed; call B (same step) does not see A in observed → B passes', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['A', 'B'], contract: CONTRACT });
    // Intended pairing: "never do B if A already happened this turn". Naively authored against ctx.observed.
    const pairGate = custom({
      kind: 'noBAfterA', dim: 'run',
      check: (ctx) => (ctx.observed.some((o) => o.name === 'A' && o.turnIndex === ctx.turnIndex) ? 'A already happened — B is forbidden.' : null),
      prose: () => 'p',
    });
    spec.addGuard('preTool', ['B'], pairGate, { id: 'agent:pair' });
    const ledger = createLedger();
    // Same step: A's preTool runs and is admitted (pushed to inFlightCalls, NOT observed until execute).
    const va = await evaluatePreTool(spec, ledger, world(), 'A', {});
    expect(va.verdict).toBe('allow');
    // B's preTool runs BEFORE A's afterToolCall records A into observed (concurrent same-step dispatch).
    const vb = await evaluatePreTool(spec, ledger, world(), 'B', {});
    expect(vb.verdict).toBe('allow'); // BREAK: A is invisible via observed; the pairing is defeated.
    // The seam the guard SHOULD have read carries A — proving the info was available, just not on observed.
    // (siblingCallsThisStep is the runtime's provided channel; ctx.observed is not it.)
  });

  it('the SAME pairing authored against siblingCallsThisStep DOES catch A — the correct seam holds', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['A', 'B'], contract: CONTRACT });
    const pairGate = custom({
      kind: 'noBAfterA', dim: 'run',
      check: (ctx) => (ctx.siblingCallsThisStep?.some((o) => o.name === 'A') ? 'A this step — B forbidden.' : null),
      prose: () => 'p',
    });
    spec.addGuard('preTool', ['B'], pairGate, { id: 'agent:pair' });
    const ledger = createLedger();
    await evaluatePreTool(spec, ledger, world(), 'A', {});
    const vb = await evaluatePreTool(spec, ledger, world(), 'B', {});
    expect(vb.verdict).toBe('deny');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 3b — postTool violation dropped after the first redrive round
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D5 — a postTool result-invariant violation is relayed ONCE then DROPPED; an unfaithful reply ships (BREAK)', () => {
  it('regenerated reply IGNORES the postTool correction → delivered as success (exhausted:false, no violations)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['charge'], contract: CONTRACT });
    const ledger = createLedger();
    // A postTool invariant failed: the charge did not actually settle. It joins the redrive set…
    ledger.postToolViolations.push({
      guard: resultInvariant(() => false, 'The charge did NOT settle — tell the user it failed.'),
      reason: 'The charge did NOT settle — tell the user it failed.',
    });
    // …the model's regenerated reply still falsely claims success and mentions nothing of the failure.
    const liar = 'All set — your card was charged successfully.';
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, P(liar), async () => P(liar), 1);
    expect(out.text).toBe(liar);        // false success reaches the user
    expect(out.exhausted).toBe(false);  // treated as clean — postTool was dropped after round 1
    expect(out.violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 4 — ordering: does a benign guard firing first MASK a real one (let the call through)?
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D6 — short-circuit ordering only changes the CORRECTION shown, never lets the call through — HOLDS', () => {
  it('benign guard denies first; the destructive call is still BLOCKED (no world reach)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['wipe'], contract: CONTRACT });
    const benign = custom({ kind: 'style', dim: 'run', check: () => 'Please add a note field.', prose: () => 'p' });
    const critical = custom({ kind: 'safety', dim: 'run', check: () => 'Destructive action needs confirmation.', prose: () => 'p' });
    spec.addGuard('preTool', ['wipe'], benign, { id: 'agent:benign' });
    spec.addGuard('preTool', ['wipe'], critical, { id: 'agent:critical' });
    const ledger = createLedger();
    const v = await evaluatePreTool(spec, ledger, world(), 'wipe', {});
    expect(v.verdict).toBe('deny'); // blocked regardless of which guard fired first
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 3c — a redrive that regenerates a reply carrying a NEW violation: is it re-checked?
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('D7 — checkReply RE-RUNS on the regenerated reply, so a redrive cannot smuggle a new violation — HOLDS', () => {
  it('redrive returns a reply that fails an onReply guard → caught → exhaustion closure, not delivered', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['save'], contract: CONTRACT });
    let calls = 0;
    const adjudicator: Adjudicator = async () => ({ violation: 'still dishonest' });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'honest?' }), { id: 'agent:honesty' });
    const ledger = createLedger(adjudicator);
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, P('lie v1'), async () => { calls++; return P('lie v2'); }, 1);
    expect(calls).toBe(1);
    expect(out.exhausted).toBe(true);           // never delivered the dishonest text
    expect(out.text).not.toBe('lie v2');
    expect(out.violations).toContain('llmCheck');
  });
});
