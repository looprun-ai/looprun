/**
 * RED-TEAM batch B — adversarial attempts to make the consent/confirm/world guards ALLOW what they must
 * forbid. Throwaway (not part of the proof suite). Each `it()` constructs a hostile GuardCtx and asserts
 * what the guard ACTUALLY does. A test named "BREAK" asserts the guard WRONGLY returns null (allow) on a
 * call that should be denied — a CONFIRMED bypass. A test named "HOLDS" asserts the guard correctly denies.
 *
 * Guard source is NOT modified; this only probes behaviour.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, HistoryTurn, ObservedCall } from '../../src/rules.js';
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
    // The runtime ALWAYS seats `history` (every hook's ctx) — the consent guards read it as the
    // authoritative record of what was DELIVERED, so a hostile ctx must carry it too or it is testing a
    // shape the engine never produces.
    history: [],
    userText: '',
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

  it('HOLDS: an UNDER-SPECIFIED probe (empty non-flag args) does NOT license a confirm of ANY record', () => {
    // Attacker: turn 1 probe deleteRecord with NO recordId (empty args except confirmed:false). Its
    // non-flag key set is [] and `.every()` over [] is vacuously true, so a SUBSET test would match ANY
    // confirm. Binding by set EQUALITY is what denies it: [] ≠ ['recordId'] → the preview was not of this act.
    const probe = okCall('deleteRecord', 1, { confirmed: false }); // no recordId
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim-999', confirmed: true }, // a record NEVER previewed
      observed: [probe],
      turnIndex: 2,
    });
    expect(g.check(confirm)).not.toBeNull();
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

  it('BREAK (STILL OPEN): via:either accepts an UNRELATED earlier ask as license for a destructive confirm', () => {
    // The attacker's ask is about something else entirely — the guard does not bind the ask to the
    // record. Any recent DELIVERED ask unlocks confirmed:true on any destructive record. Binding an ask
    // to a record would need the ask to name one, which a speech intention does not.
    const asked: HistoryTurn = {
      turnIndex: 1, userText: 'chat', reply: 'what is your favourite colour?', toolCalls: [],
      did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [],
    };
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim-999', confirmed: true },
      history: [asked],
      turnIndex: 2,
    });
    expect(g.check(confirm)).toBeNull(); // allowed = BREAK
  });

  it('HOLDS (via:probe): an unrelated ask does NOT license — only a record-bound probe does', () => {
    const gp = confirmFirst({ via: 'probe' });
    const asked: HistoryTurn = {
      turnIndex: 1, userText: 'chat', reply: 'unrelated', toolCalls: [],
      did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [],
    };
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim', confirmed: true },
      history: [asked],
      turnIndex: 2,
    });
    expect(gp.check(confirm)).not.toBeNull();
  });

  it('HOLDS: an under-specified probe does not bypass the strict record-bound arm', () => {
    const gp = confirmFirst({ via: 'probe' });
    const probe = okCall('deleteRecord', 1, { confirmed: false });
    const confirm = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'victim', confirmed: true },
      observed: [probe],
      turnIndex: 2,
    });
    expect(gp.check(confirm)).not.toBeNull();
  });

  it('HOLDS (via:ask): a vetoed turn-1 attempt (ok:false) does NOT unlock the identical turn-2 call', () => {
    const ga = confirmFirst({ via: 'ask' });
    const vetoed = okCall('wipeAll', 1, {}, { ok: false });
    const act = ctxWith({ tool: 'wipeAll', args: {}, observed: [vetoed], turnIndex: 2 });
    expect(ga.check(act)).not.toBeNull();
  });

  it('HOLDS: a prior SUCCESSFUL run of the tool ITSELF does NOT surface or license the next run', () => {
    // Counting a flag-less tool's own prior OK run as "surfacing" would let a second identical
    // destructive run happen in the next turn with no fresh ask — and, chained turn by turn, carry ONE
    // consent across unbounded turns, bridging the recency law. Every repeat needs its own earlier-turn ask.
    const ga = confirmFirst({ via: 'ask' });
    const priorRun = okCall('wipeAll', 1, {});
    const act = ctxWith({ tool: 'wipeAll', args: {}, observed: [priorRun], turnIndex: 2 });
    expect(ga.check(act)).not.toBeNull();
  });

  it('CONTROL: the legitimate two-step works — a DELIVERED ask licenses the next turn', () => {
    const ga = confirmFirst({ via: 'ask' });
    const asked: HistoryTurn = {
      turnIndex: 1, userText: 'wipe everything', reply: 'This deletes every record — go ahead?', toolCalls: [],
      did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [],
    };
    expect(ga.check(ctxWith({ tool: 'wipeAll', args: {}, history: [asked], turnIndex: 2 }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// destructiveThrottle
// ─────────────────────────────────────────────────────────────────────────────
describe('destructiveThrottle — adversarial', () => {
  const g = destructiveThrottle(['deleteRecord', 'wipeAll']);

  it('CLOSED: two effected calls flagged confirmed:false are two EFFECTS — the second is denied', () => {
    // Keying `isProbe` on args.confirmed===false without consulting tookEffect would let a tool that
    // mutates while confirmed:false (it ignores the flag semantics) produce two real effects that both
    // look like probes → 0 prior effects counted → the second destructive call slips the n:1 cap. A
    // call that TOOK EFFECT is an effect, whatever flags it carries.
    const firstEffect = okCall('deleteRecord', 5, { recordId: 'A', confirmed: false }, { tookEffect: true });
    const second = ctxWith({
      tool: 'deleteRecord',
      args: { recordId: 'B', confirmed: false },
      observed: [firstEffect],
      turnIndex: 5,
    });
    expect(g.check(second)).not.toBeNull();
  });

  it('CLOSED: an effected write that ALSO returned requiresConfirmation counts as an effect', () => {
    // The other half of the same hole: `resultFlags.requiresConfirmation` alone would mark a call a probe.
    // A world that both mutates and asks (a "done, but confirm the rest" shape) must not buy a free
    // second destructive call. tookEffect is the authority.
    const firstEffect = okCall('deleteRecord', 5, { recordId: 'A' }, { tookEffect: true, resultFlags: { requiresConfirmation: true } });
    const second = ctxWith({ tool: 'wipeAll', args: {}, observed: [firstEffect], turnIndex: 5 });
    expect(g.check(second)).not.toBeNull();
  });

  it('CONTROL: a confirmed:false call that changed NOTHING is still a probe — the execute passes', () => {
    // The effect test must not break the two-step flow the throttle exists to permit: a probe that took no
    // effect stays a probe, so the approved execute in the same turn is still allowed.
    const probe = okCall('deleteRecord', 5, { recordId: 'A', confirmed: false }, { tookEffect: false });
    const execute = ctxWith({ tool: 'deleteRecord', args: { recordId: 'A', confirmed: true }, observed: [probe], turnIndex: 5 });
    expect(g.check(execute)).toBeNull();
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

  it('HOLDS: a genuine probe (recorded tookEffect:false) does not block the approved execute', () => {
    // `tookEffect:false` is POSITIVE evidence that the probe changed nothing — the backend records
    // it whenever the world keeps a ledger. Without it the call is unverified, not effect-free.
    const probe = okCall('deleteRecord', 5, { recordId: 'A', confirmed: false }, {
      tookEffect: false,
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

  it('LEAK: asking in prose (respond WITHOUT an ask intention) is NOT detected as an ask → listed tool acts same turn', () => {
    const asked = okCall('respond', 3, { message: 'Delete it? (yes/no)', did: [] });
    const act = ctxWith({ tool: 'deleteRecord', args: {}, observed: [asked], turnIndex: 3 });
    expect(g.check(act)).toBeNull(); // only a declared `ask` intention is detected = LEAK
  });

  it('HOLDS: a real same-turn ask intention blocks the listed tool', () => {
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

  it('HOLDS: a pending probe with no ask this turn demands the relay', () => {
    const probe = okCall('deleteRecord', 4, { recordId: 'A', confirmed: false }, {
      resultFlags: { requiresConfirmation: true },
    });
    const ctx = ctxWith({ observed: [probe], turnIndex: 4 });
    expect(g.check(ctx)).not.toBeNull();
  });
});
