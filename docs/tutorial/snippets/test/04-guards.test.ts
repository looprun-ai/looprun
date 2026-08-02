/**
 * Chapter 04's hand-written code, exercised: the custom guard denies exactly the case its prose
 * claims, and the `canonArgs` fingerprint behaves as §4 says. Constructing the spec is itself the
 * proof that `dim: 'run'` is legal on `preTool` — `addGuard` throws at construction otherwise.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx } from 'looprun';
import { differentCallFingerprint, lateCancelSchedulerSpec, noCancelAfterStart, sameCallFingerprint } from '../04-guards.js';
import { REFERENCE_NOW } from '../scheduler/contract.js';
import { SchedulerWorld } from '../scheduler/world.js';

const ctxFor = (eventId: string): GuardCtx => ({
  args: { eventId },
  tool: 'cancelEvent',
  world: new SchedulerWorld(),
  observed: [],
  turnIndex: 0,
  userText: '',
  history: [],
});

describe('chapter 04 · the custom guard', () => {
  it('denies a cancel of an event that already started, and allows the rest', () => {
    const guard = noCancelAfterStart('2026-03-02T10:15'); // mid-Standup (10:00–10:30)

    expect(guard.check(ctxFor('evt_101'))).toContain('too late to cancel');
    expect(guard.check(ctxFor('evt_102'))).toBeNull(); // Thursday, still ahead
    expect(guard.check(ctxFor('nope'))).toBeNull(); // unknown id is the world's error, not ours
  });

  it('is bindable on preTool, and nothing started at the reference clock', () => {
    expect(lateCancelSchedulerSpec.guards.preTool.map((b) => b.guard.kind)).toContain('noCancelAfterStart');
    expect(noCancelAfterStart(REFERENCE_NOW).check(ctxFor('evt_101'))).toBeNull();
  });

  it('fingerprints a call by value, not by key order', () => {
    expect(sameCallFingerprint).toBe(true);
    expect(differentCallFingerprint).toBe(true);
  });
});
