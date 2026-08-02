/**
 * SCG-T4 — the did → operation-report RENDERER, the COMPOSED delivery, the claims-derived exhaustion
 * closure, and salvage over the structured payload.
 *
 * The user-facing operational sentences come from the ledger-verified `did` rendered BY THE ENGINE, never
 * from the agent's free prose — so a fabricated claim cannot reach the user, and a redrive/exhaustion never
 * announces an effect the ledger does not show.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, DomainContract } from '../src/index.js';
import { renderOperationReport, deriveClaimsFromLedger } from '../src/internal.js';
import type { TurnClaim } from '../src/runtime/claims.js';
import { createLedger, recordToolResult, recordTerminalCall } from '../src/runtime/ledger.js';
import { finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

/** Seed a WRITE that TOOK EFFECT, aligning the world ledger (what resultOf reads) with the observed entry
 *  (recordToolResult copies tookEffect from the world match). `label` is the world's produced noun. */
function effectWrite(ledger: ReturnType<typeof createLedger>, world: AgentWorld, name: string, args: Record<string, unknown>, label: string): void {
  world.toolCalls.push({ name, args, result: { id: label, label }, tookEffect: true });
  recordToolResult(ledger, name, args, { id: label, label }, world);
}

/** Seed a WRITE that RAN OK but changed nothing (a probe: tookEffect false). */
function probeWrite(ledger: ReturnType<typeof createLedger>, world: AgentWorld, name: string, args: Record<string, unknown>): void {
  world.toolCalls.push({ name, args, result: { success: true }, tookEffect: false });
  recordToolResult(ledger, name, args, { success: true }, world);
}

const BOOKING_CONTRACT: DomainContract = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
  writeTools: ['createBooking'],
};

const P = (message: string, did: TurnClaim[] = [], asked = false) => ({ message, did, asked });

describe('renderOperationReport — one neutral English line per verified claim', () => {
  it('renders the target-keyed default line per core outcome', () => {
    const did: TurnClaim[] = [
      { op: 'book', target: 'BK-1', outcome: 'success' },
      { op: 'look', target: 'ORD-9', outcome: 'not_found' },
      { op: 'cancel', target: 'BK-2', outcome: 'pending_confirmation' },
    ];
    expect(renderOperationReport(did)).toBe('BK-1: done\nORD-9: no record found\nBK-2: awaiting your confirmation');
  });

  it('empty did → empty report', () => {
    expect(renderOperationReport([])).toBe('');
  });

  it('a target-less claim renders a GENERIC line — never the advisory op, never a tool name', () => {
    const did: TurnClaim[] = [{ op: 'createBooking', outcome: 'success' }]; // op is a tool-looking token
    const out = renderOperationReport(did);
    expect(out).toBe('One action completed.');
    expect(out).not.toContain('createBooking');
  });

  it('resolves a DOMAIN outcome word through the outcomes map', () => {
    const did: TurnClaim[] = [{ op: 'settle', target: 'INV-3', outcome: 'settled' }];
    expect(renderOperationReport(did, { outcomes: { settled: 'success' } })).toBe('INV-3: done');
  });

  it('a domain renderClaim override supplies the wording (and language)', () => {
    const did: TurnClaim[] = [{ op: 'refund', target: 'ORD-5', outcome: 'success', amount: 50 }];
    const out = renderOperationReport(did, { renderClaim: (c, core) => `${c.target} reembolsado (${core}) €${c.amount}` });
    expect(out).toBe('ORD-5 reembolsado (success) €50');
  });

  it('skips a claim whose outcome does not resolve (defensive — never fabricates a line)', () => {
    const did: TurnClaim[] = [{ op: 'x', target: 'T', outcome: 'invented' }, { op: 'y', target: 'BK-1', outcome: 'success' }];
    expect(renderOperationReport(did)).toBe('BK-1: done');
  });
});

describe('deriveClaimsFromLedger — the engine derives TRUTH from the world ledger', () => {
  it('effected write → success with the produced label as target; a read + a probe contribute nothing', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1'); // effected
    probeWrite(ledger, world, 'createBooking', { slot: 2 });          // probe, no effect
    recordToolResult(ledger, 'getMember', { id: 7 }, { name: 'Ana' }); // a read
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking'], ledger.producedThisTurn);
    expect(derived).toEqual([{ op: 'BK-1', target: 'BK-1', outcome: 'success' }]);
  });

  it('a write that returned ok:false → failure; a requiresConfirmation flag → pending_confirmation', () => {
    const ledger = createLedger();
    recordToolResult(ledger, 'createBooking', { a: 1 }, { success: false });
    recordToolResult(ledger, 'createBooking', { a: 2 }, { requiresConfirmation: true });
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking'], []);
    expect(derived).toEqual([{ op: 'operation', outcome: 'failure' }, { op: 'operation', outcome: 'pending_confirmation' }]);
  });
});

describe('finalizeReply — composed delivery over the structured payload', () => {
  it('empty did → the message alone (no report appended)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [], contract: BOOKING_CONTRACT });
    const out = await finalizeReply(spec, BOOKING_CONTRACT, fixtureWorld(), createLedger(), P('Hello there.'), async () => P(''), 0);
    expect(out.text).toBe('Hello there.');
    expect(out.exhausted).toBe(false);
    expect(out.did).toEqual([]);
  });

  it('non-empty VERIFIED did → message + the engine-rendered operation report', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1');
    const did: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    const out = await finalizeReply(spec, BOOKING_CONTRACT, world, ledger, P('All booked.', did), async () => P(''), 0);
    expect(out.text).toBe('All booked.\n\nBK-1: done');
    expect(out.exhausted).toBe(false);
    expect(out.did).toEqual(did);
    // History keeps the VERIFIED set: finalizeReply synced the ledger to what it delivered.
    expect(ledger.did).toEqual(did);
  });
});

describe('finalizeReply — the claims-derived exhaustion closure never fabricates and never leaks a tool name', () => {
  it('an effected write the model FAILED to declare → engine derives the truth (produced label, not tool name)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1');
    // The model omitted the effected write from `did` → claimIsComplete fires → redrives exhaust.
    const out = await finalizeReply(spec, BOOKING_CONTRACT, world, ledger, P('Anything else?'), async () => P('Anything else?'), 0);
    expect(out.exhausted).toBe(true);
    expect(out.text).toContain('BK-1: done');
    expect(out.text).toContain('how would you like to proceed');
    expect(out.text).not.toContain('createBooking'); // NEVER the tool name (Abstain tool-name leak closed)
    expect(out.did).toEqual([{ op: 'BK-1', target: 'BK-1', outcome: 'success' }]);
    expect(ledger.did).toEqual(out.did); // history retains the derived truth
  });

  it('a probe-only turn → the "nothing was changed" shape, no fabricated success', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    spec.addReplyCheck(custom({ kind: 'alwaysDeny', dim: 'behavior', check: () => 'nope', prose: () => '' }), { id: 'agent:deny' });
    const ledger = createLedger();
    const world = fixtureWorld();
    probeWrite(ledger, world, 'createBooking', { slot: 9 }); // ran, changed nothing
    const out = await finalizeReply(spec, BOOKING_CONTRACT, world, ledger, P('Working on it.'), async () => P('Working on it.'), 0);
    expect(out.exhausted).toBe(true);
    expect(out.text).toBe('I could not complete this safely — nothing was changed. Could you rephrase or add detail?');
    expect(out.text).not.toContain('createBooking');
    expect(out.did).toEqual([]); // nothing landed → no claim
  });
});

describe('finalizeReply — redrive returns a whole payload, re-checked against the ledger', () => {
  it('the correction reaches the redrive and its returned payload is re-validated and delivered', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1');
    const seen: string[] = [];
    // Initial payload omits the effected write → claimIsComplete fires; the redrive supplies the true did.
    const out = await finalizeReply(
      spec, BOOKING_CONTRACT, world, ledger,
      P('Done.'),
      async (msg) => { seen.push(msg); return P('Booked your slot.', [{ op: 'book', target: 'BK-1', outcome: 'success' }]); },
      1,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('report every action that takes effect'); // the claimIsComplete correction
    expect(out.exhausted).toBe(false);
    expect(out.text).toBe('Booked your slot.\n\nBK-1: done');
    expect(out.did).toEqual([{ op: 'book', target: 'BK-1', outcome: 'success' }]);
  });
});

describe('finalizeReply — salvage re-validates the FULL payload, so a fabricated did is never salvaged', () => {
  it('rejects a salvage candidate whose did fails claimIsGrounded → falls through to the honest closure', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld(); // NO effected write — nothing grounds a success on BK-9
    // A prior ok respond in the ledger fabricated a success it never made.
    recordTerminalCall(ledger, 'respond', { message: 'Done! Booked BK-9.', did: [{ op: 'book', target: 'BK-9', outcome: 'success' }], asked: false });
    // The current (different) payload also fabricates → claimIsGrounded fires → we reach the salvage branch.
    const out = await finalizeReply(
      spec, BOOKING_CONTRACT, world, ledger,
      P('Retrying.', [{ op: 'book', target: 'BK-9', outcome: 'success' }]),
      async () => P('Retrying.', [{ op: 'book', target: 'BK-9', outcome: 'success' }]),
      0,
    );
    expect(out.exhausted).toBe(true);
    expect(out.text).not.toContain('BK-9'); // the fabricated success is NEVER delivered
    expect(out.text).toBe('I could not complete this safely — nothing was changed. Could you rephrase or add detail?');
    expect(ledger.turnCorrections.some((c) => c.startsWith('salvage-miss:checks:claimIsGrounded'))).toBe(true);
  });
});
