/**
 * RED-TEAM batch B — adversarial attempts to make the consent/confirm/world guards ALLOW what they must
 * forbid. Throwaway (not part of the proof suite). Each `it()` constructs a hostile GuardCtx and asserts
 * what the guard ACTUALLY does. A test named "BREAK" asserts the guard WRONGLY returns null (allow) on a
 * call that should be denied — a CONFIRMED bypass. A test named "HOLDS" asserts the guard correctly denies.
 *
 * Guard source is NOT modified; this only probes behaviour.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../../src/rules.js';
import {
  confirmFirst,
  destructiveThrottle,
  noActAfterAskSameTurn,
  pendingConfirmMustAsk,
} from '../../src/guards/confirmation.js';
import { precondition, resultInvariant, consentRequired } from '../../src/guards/world.js';

function ctxWith(partial: Partial<GuardCtx> & { turnIndex: number }): GuardCtx {
  return {
    args: {},
    observed: [],
    world: {} as GuardCtx['world'],
    ...partial,
  } as GuardCtx;
}

const okCall = (name: string, turn: number, args: Record<string, unknown>, extra?: Partial<ObservedCall>): ObservedCall => ({
  name,
  ok: true,
  turnIndex: turn,
  args,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// confirmFirst
// ─────────────────────────────────────────────────────────────────────────────
describe('confirmFirst — adversarial', () => {
  const g = confirmFirst(); // via:'either', flag:'confirmed', within:1

  it('BREAK: an UNDER-SPECIFIED probe (empty non-flag args) licenses a confirm of ANY record', () => {
    // Attacker: turn 1 probe deleteRecord with NO recordId (empty args except confirmed:false).
    // Its non-flag key set is [] → `.every()` over [] is vacuously true → matches ANY confirm.
    const probe = okCall('deleteRecord', 1, { confirmed: false }); // no recordId
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim-999', confirmed: true }, // a record NEVER previewed
      observed: [probe],
      turnIndex: 2,
    });
    expect(g.check(confirm)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS: a FULLY-specified probe of a DIFFERENT record does NOT license (probe not a subset)', () => {
    const probe = okCall('deleteRecord', 1, { recordId: 'A', confirmed: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'B', confirmed: true },
      observed: [probe],
      turnIndex: 2,
    });
    expect(g.check(confirm)).not.toBeNull();
  });

  it('HOLDS: a FAILED probe (ok:false) does NOT license the confirm', () => {
    const probe = okCall('deleteRecord', 1, { recordId: 'A', confirmed: false }, { ok: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'A', confirmed: true },
      observed: [probe],
      turnIndex: 2,
    });
    expect(g.check(confirm)).not.toBeNull();
  });

  it('HOLDS: a SAME-TURN probe does NOT license (recency lower bound diff>=1)', () => {
    const probe = okCall('deleteRecord', 2, { recordId: 'A', confirmed: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'A', confirmed: true },
      observed: [probe],
      turnIndex: 2,
    });
    expect(g.check(confirm)).not.toBeNull();
  });

  it('HOLDS: a STALE probe (diff 2 > within 1) does NOT license', () => {
    const probe = okCall('deleteRecord', 1, { recordId: 'A', confirmed: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'A', confirmed: true },
      observed: [probe],
      turnIndex: 3,
    });
    expect(g.check(confirm)).not.toBeNull();
  });

  it('BREAK: via:either accepts an UNRELATED earlier ask as license for a destructive confirm', () => {
    // The attacker's ask was about something else entirely — the guard does not bind the ask to the
    // record. Any recent successful ask unlocks confirmed:true on any destructive record.
    const unrelatedAsk = okCall('respond', 1, { message: 'what is your favourite colour?', did: [{ op: 'ask' }] });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim-999', confirmed: true },
      observed: [unrelatedAsk],
      turnIndex: 2,
    });
    expect(g.check(confirm)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS (via:probe): an unrelated askUser does NOT license — only a record-bound probe does', () => {
    const gp = confirmFirst({ via: 'probe' });
    const unrelatedAsk = okCall('respond', 1, { message: 'unrelated', did: [{ op: 'ask' }] });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim', confirmed: true },
      observed: [unrelatedAsk],
      turnIndex: 2,
    });
    expect(gp.check(confirm)).not.toBeNull();
  });

  it('BREAK (via:probe still): under-specified probe bypasses even the strict record-bound arm', () => {
    const gp = confirmFirst({ via: 'probe' });
    const probe = okCall('deleteRecord', 1, { confirmed: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim', confirmed: true },
      observed: [probe],
      turnIndex: 2,
    });
    expect(gp.check(confirm)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS (via:ask): a vetoed turn-1 attempt (ok:false) does NOT unlock the identical turn-2 call', () => {
    const ga = confirmFirst({ via: 'ask' });
    const vetoed = okCall('wipeAll', 1, {}, { ok: false });
    const act = ctxWith({ tool: 'wipeAll', args: {}, observed: [vetoed], turnIndex: 2 });
    expect(ga.check(act)).not.toBeNull();
  });

  it('LEAK (via:ask): a prior SUCCESSFUL run of the tool ITSELF surfaces and licenses the next run', () => {
    // A flag-less tool: its own prior OK run counts as "surfacing" → a second identical destructive run
    // in the next turn is allowed with no fresh ask. Documented, but worth flagging as a repeat-fire path.
    const ga = confirmFirst({ via: 'ask' });
    const priorRun = okCall('wipeAll', 1, {});
    const act = ctxWith({ tool: 'wipeAll', args: {}, observed: [priorRun], turnIndex: 2 });
    expect(ga.check(act)).toBeNull(); // allowed
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// destructiveThrottle
// ─────────────────────────────────────────────────────────────────────────────
describe('destructiveThrottle — adversarial', () => {
  const g = destructiveThrottle(['deleteRecord', 'wipeAll']);

  it('BREAK: two effected calls flagged confirmed:false both classify as PROBES → second slips past n:1', () => {
    // isProbe keys on args.confirmed===false and NEVER consults tookEffect. A tool that mutates while
    // confirmed:false (ignores/omits the flag semantics) produces two real effects that both look like
    // probes → the throttle counts 0 prior effects → allows the second destructive call.
    const firstEffect = okCall('deleteRecord', 5, { recordId: 'A', confirmed: false }, { tookEffect: true });
    const second = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'B', confirmed: false },
      observed: [firstEffect],
      turnIndex: 5,
    });
    expect(g.check(second)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS: a real prior effect (confirmed:true) blocks a second destructive call same turn', () => {
    const firstEffect = okCall('deleteRecord', 5, { recordId: 'A', confirmed: true }, { tookEffect: true });
    const second = ctxWith({
      tool: 'wipeAll',
      args: { confirmed: true },
      observed: [firstEffect],
      turnIndex: 5,
    });
    expect(g.check(second)).not.toBeNull();
  });

  it('HOLDS: an ok:false prior destructive call does NOT count (it never ran) — second allowed correctly', () => {
    const failed = okCall('deleteRecord', 5, { recordId: 'A', confirmed: true }, { ok: false });
    const second = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'B', confirmed: true },
      observed: [failed],
      turnIndex: 5,
    });
    expect(g.check(second)).toBeNull(); // correct: nothing effected yet
  });

  it('HOLDS: a genuine probe (requiresConfirmation) does not block the approved execute', () => {
    const probe = okCall('deleteRecord', 5, { recordId: 'A', confirmed: false }, {
      resultFlags: { requiresConfirmation: true },
    });
    const execute = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'A', confirmed: true },
      observed: [probe],
      turnIndex: 5,
    });
    expect(g.check(execute)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// noActAfterAskSameTurn
// ─────────────────────────────────────────────────────────────────────────────
describe('noActAfterAskSameTurn — adversarial', () => {
  const g = noActAfterAskSameTurn(['deleteRecord']);

  it('LEAK: a destructive tool NOT in the set acts freely in the same turn as an ask', () => {
    const asked = okCall('respond', 3, { message: 'ok?', did: [{ op: 'ask' }] });
    const act = ctxWith({ tool: 'wipeAll', args: {}, observed: [asked], turnIndex: 3 });
    expect(g.check(act)).toBeNull(); // wipeAll uncovered = LEAK (coverage gap)
  });

  it('LEAK: asking in prose (respond WITHOUT asked) is NOT detected as "asked" → listed tool acts same turn', () => {
    const asked = okCall('respond', 3, { message: 'Delete it? (yes/no)', did: [] });
    const act = ctxWith({ tool: 'deleteRecord', args: {}, observed: [asked], turnIndex: 3 });
    expect(g.check(act)).toBeNull(); // only respond+asked:true is detected = LEAK
  });

  it('HOLDS: a real same-turn ask (respond+asked) blocks the listed tool', () => {
    const asked = okCall('respond', 3, { message: 'ok?', did: [{ op: 'ask' }] });
    const act = ctxWith({ tool: 'deleteRecord', args: {}, observed: [asked], turnIndex: 3 });
    expect(g.check(act)).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// precondition
// ─────────────────────────────────────────────────────────────────────────────
describe('precondition — adversarial', () => {
  it('LEAK: predicate reads WORLD only — a per-record arg cannot be gated by a global world flag', () => {
    // Guard: allowed only while the account is verified. But "verified" is a GLOBAL world flag; the tool
    // acts on args.accountId. A call targeting an UNVERIFIED account B passes on the global flag.
    const g = precondition<any>((w) => w.accountVerified === true, 'account not verified');
    const world = { accountVerified: true } as any; // global flag true
    const act = ctxWith({
      tool: 'transfer',
      args: { accountId: 'unverified-B', amount: 9999 },
      world,
      turnIndex: 1,
    });
    expect(g.check(act)).toBeNull(); // allowed — args-derived target state invisible = LEAK
  });

  it('HOLDS: when the world flag is false the call is denied', () => {
    const g = precondition<any>((w) => w.accountVerified === true, 'account not verified');
    const act = ctxWith({ tool: 'transfer', args: {}, world: { accountVerified: false } as any, turnIndex: 1 });
    expect(g.check(act)).toBe('account not verified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// consentRequired
// ─────────────────────────────────────────────────────────────────────────────
describe('consentRequired — adversarial', () => {
  it('LEAK: consent read from a GLOBAL scope — subject B is emailed on subject A consent', () => {
    // consentOk reads a single world flag. If consent is per-subject but the flag is global, a write for a
    // different subject slips through.
    const g = consentRequired<any>({
      tools: ['sendEmail'],
      consentOk: (w) => w.consentGiven === true,
      reason: 'no consent on record',
    });
    const world = { consentGiven: true, consentSubject: 'A' } as any;
    const act = ctxWith({
      tool: 'sendEmail',
      args: { to: 'subject-B@example.com' }, // NOT the consented subject
      world,
      turnIndex: 1,
    });
    expect(g.check(act)).toBeNull(); // allowed — stale/wrong scope = LEAK
  });

  it('LEAK: a write tool NOT listed in `tools` is entirely ungated even with consent absent', () => {
    const g = consentRequired<any>({
      tools: ['sendEmail'],
      consentOk: (w) => w.consentGiven === true,
      reason: 'no consent on record',
    });
    const act = ctxWith({
      tool: 'exportContacts', // a write, but not listed
      args: {},
      world: { consentGiven: false } as any,
      turnIndex: 1,
    });
    expect(g.check(act)).toBeNull(); // uncovered tool = LEAK (coverage gap)
  });

  it('HOLDS: a listed tool with consent flag false is denied', () => {
    const g = consentRequired<any>({
      tools: ['sendEmail'],
      consentOk: (w) => w.consentGiven === true,
      reason: 'no consent on record',
    });
    const act = ctxWith({ tool: 'sendEmail', args: {}, world: { consentGiven: false } as any, turnIndex: 1 });
    expect(g.check(act)).toBe('no consent on record');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resultInvariant
// ─────────────────────────────────────────────────────────────────────────────
describe('resultInvariant — adversarial', () => {
  const g = resultInvariant<any>(
    (result: any) => Array.isArray(result?.rows) && result.rows.length > 0,
    'the report came back empty',
  );

  it('BREAK: an UNDEFINED result short-circuits to null — the invariant NEVER fires', () => {
    // A tool that returns undefined (or a path where ctx.result is unset) bypasses the invariant entirely,
    // even though undefined is the emptiest possible result.
    const ctx = ctxWith({ tool: 'runReport', args: {}, result: undefined, turnIndex: 1 });
    expect(g.check(ctx)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS: an explicit empty result (rows:[]) is denied', () => {
    const ctx = ctxWith({ tool: 'runReport', args: {}, result: { rows: [] }, turnIndex: 1 });
    expect(g.check(ctx)).toBe('the report came back empty');
  });

  it('LEAK: a NULL result passes into pred (null !== undefined) — pred must defend itself', () => {
    // null is NOT the undefined short-circuit; here pred returns false so it denies. But a laxer pred that
    // does `result == null ? true : ...` (or optional-chains to undefined and treats it truthy) would let
    // null through. Documented as a foot-gun the undefined short-circuit encourages.
    const ctx = ctxWith({ tool: 'runReport', args: {}, result: null, turnIndex: 1 });
    expect(g.check(ctx)).toBe('the report came back empty');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pendingConfirmMustAsk (consent-cluster neighbour)
// ─────────────────────────────────────────────────────────────────────────────
describe('pendingConfirmMustAsk — adversarial', () => {
  const g = pendingConfirmMustAsk();

  it('BREAK: an under-specified approved execute RESOLVES a pending probe of a different record', () => {
    // The resolver matches on record = args minus confirm flag. A probe of record {recordId:A} is marked
    // resolved by an execute {confirmed:true} carrying NO recordId only if records match — they don't here,
    // so it should stay pending. Test the inverse: probe with NO recordId, execute WITH one → records
    // differ → stays unresolved (HOLDS). Then the true break: identical empty records collide.
    const probe = okCall('deleteRecord', 4, { confirmed: false }, { resultFlags: { requiresConfirmation: true } });
    const execute = okCall('deleteRecord', 4, { recordId: 'B', confirmed: true }, { tookEffect: true });
    const ctx = ctxWith({ observed: [probe, execute], turnIndex: 4 });
    // record(probe)='{}' vs record(execute)='{"recordId":"B"}' → differ → still unresolved → must ask.
    expect(g.check(ctx)).not.toBeNull(); // HOLDS
  });

  it('HOLDS: a pending probe with no askUser this turn demands the relay', () => {
    const probe = okCall('deleteRecord', 4, { recordId: 'A', confirmed: false }, {
      resultFlags: { requiresConfirmation: true },
    });
    const ctx = ctxWith({ observed: [probe], turnIndex: 4 });
    expect(g.check(ctx)).not.toBeNull();
  });
});
