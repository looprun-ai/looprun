/**
 * The did → operation-report RENDERER, the COMPOSED delivery, the claims-derived exhaustion
 * closure, and salvage over the structured payload.
 *
 * The user-facing OPERATION REPORT comes from the ledger-verified `did` rendered BY THE ENGINE, never from
 * the agent's free prose — so no fabricated claim reaches the user THROUGH THE REPORT, and a
 * redrive/exhaustion never announces an effect the ledger does not show. The agent's own `message` still
 * ships verbatim beside it; an operational assertion written there is the priced residual, not a blocked one.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, DomainContract } from '../src/index.js';
import { renderOperationReport, deriveClaimsFromLedger, hasAskIntent } from '../src/internal.js';
import type { Intention } from '../src/runtime/claims.js';
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

/** Seed a WRITE that RAN OK but changed nothing (a simulate: tookEffect false). */
function simulateWrite(ledger: ReturnType<typeof createLedger>, world: AgentWorld, name: string, args: Record<string, unknown>): void {
  world.toolCalls.push({ name, args, result: { success: true }, tookEffect: false });
  recordToolResult(ledger, name, args, { success: true }, world);
}

const BOOKING_CONTRACT: DomainContract = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
  writeTools: ['createBooking'],
};

const P = (message: string, did: Intention[] = []) => ({ message, did });

describe('renderOperationReport — one neutral English line per verified claim', () => {
  it('renders the target-keyed default line per core outcome', () => {
    const did: Intention[] = [
      { op: 'book', target: 'BK-1', outcome: 'success' },
      { op: 'look', target: 'ORD-9', outcome: 'not_found' },
      { op: 'cancel', target: 'BK-2', outcome: 'pending_confirmation' },
    ];
    expect(renderOperationReport(did)).toBe('BK-1: done\nORD-9: no record found\nBK-2: awaiting your confirmation\nNothing else was changed on this turn.');
  });

  it('empty did → the closure that denies every operation, never nothing at all', () => {
    expect(renderOperationReport([])).toBe('No operation was carried out on this turn.');
  });

  it('a target-less claim renders a GENERIC line — never the advisory op, never a tool name', () => {
    const did: Intention[] = [{ op: 'createBooking', outcome: 'success' }]; // op is a tool-looking token
    const out = renderOperationReport(did);
    expect(out).toBe('One action completed.\nNothing else was changed on this turn.');
    expect(out).not.toContain('createBooking');
  });

  it('resolves a DOMAIN outcome word through the outcomes map', () => {
    const did: Intention[] = [{ op: 'settle', target: 'INV-3', outcome: 'settled' }];
    expect(renderOperationReport(did, { outcomes: { settled: 'success' } })).toBe('INV-3: done\nNothing else was changed on this turn.');
  });

  it('a domain renderClaim override supplies the wording (and language)', () => {
    const did: Intention[] = [{ op: 'refund', target: 'ORD-5', outcome: 'success', amount: 50 }];
    const out = renderOperationReport(did, { renderClaim: (c, core) => `${c.target} reembolsado (${core}) €${c.amount}` });
    expect(out).toBe('ORD-5 reembolsado (success) €50\nNothing else was changed on this turn.');
  });

  it('skips a claim whose outcome does not resolve (defensive — never fabricates a line)', () => {
    const did: Intention[] = [{ op: 'x', target: 'T', outcome: 'invented' }, { op: 'y', target: 'BK-1', outcome: 'success' }];
    expect(renderOperationReport(did)).toBe('BK-1: done\nNothing else was changed on this turn.');
  });
});

describe('deriveClaimsFromLedger — the engine derives TRUTH from the world ledger', () => {
  it('effected write → success with the produced label as target; a read + a simulate contribute nothing', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1'); // effected
    simulateWrite(ledger, world, 'createBooking', { slot: 2 });          // simulate, no effect
    recordToolResult(ledger, 'getMember', { id: 7 }, { name: 'Ana' }); // a read
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking']);
    expect(derived).toEqual([{ op: 'BK-1', target: 'BK-1', outcome: 'success' }]);
  });

  it('a write that returned ok:false → failure; a requiresConfirmation flag → pending_confirmation', () => {
    const ledger = createLedger();
    recordToolResult(ledger, 'createBooking', { a: 1 }, { success: false });
    recordToolResult(ledger, 'createBooking', { a: 2 }, { requiresConfirmation: true });
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking']);
    expect(derived).toEqual([{ op: 'operation', outcome: 'failure' }, { op: 'operation', outcome: 'pending_confirmation' }]);
  });

  // ── each produced label belongs to the CALL that produced it ──────────────────────────────────
  it('a READ that emitted a label does NOT lend it to a later effected write', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'search', args: { q: 'x' }, result: { label: 'SEARCH-RESULT' }, tookEffect: false });
    recordToolResult(ledger, 'search', { q: 'x' }, { label: 'SEARCH-RESULT' }, world); // a READ with a label
    world.toolCalls.push({ name: 'createBooking', args: { slot: 1 }, result: { ok: true }, tookEffect: true });
    recordToolResult(ledger, 'createBooking', { slot: 1 }, { ok: true }, world);       // a WRITE with none
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking']);
    // The write named nothing, so the engine's account names nothing — never the search's label.
    expect(derived).toEqual([{ op: 'operation', outcome: 'success' }]);
  });

  it('two effected writes each wear THEIR OWN label (no positional cursor to misalign)', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1');
    world.toolCalls.push({ name: 'search', args: { q: 'y' }, result: { label: 'SEARCH-RESULT' }, tookEffect: false });
    recordToolResult(ledger, 'search', { q: 'y' }, { label: 'SEARCH-RESULT' }, world); // a read in between
    effectWrite(ledger, world, 'createBooking', { slot: 2 }, 'BK-2');
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createBooking']);
    expect(derived).toEqual([
      { op: 'BK-1', target: 'BK-1', outcome: 'success' },
      { op: 'BK-2', target: 'BK-2', outcome: 'success' },
    ]);
  });

  // ── an EFFECTED write is a completed action, whatever flags it carries ────────────────────────
  it('an effected write carrying requiresConfirmation derives as SUCCESS, not pending', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'refund', args: { order: 'ORD-7' }, result: { label: 'ORD-7', requiresConfirmation: true }, tookEffect: true });
    recordToolResult(ledger, 'refund', { order: 'ORD-7' }, { label: 'ORD-7', requiresConfirmation: true }, world);
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['refund']);
    expect(derived).toEqual([{ op: 'ORD-7', target: 'ORD-7', outcome: 'success' }]);
    expect(renderOperationReport(derived)).toBe('ORD-7: done\nNothing else was changed on this turn.');
  });

  // ── the derived claim is always an ACTION claim (final review) ─────────────────────────────────
  it('a world label colliding with a SPEECH op never becomes the derived `op`', () => {
    const ledger = createLedger();
    const world = fixtureWorld();
    // A domain whose write result labels the touched entity `ask` (a ticket queue, a survey step — the
    // word is ordinary). Passing the label through as `op` made the engine's OWN derived closure seal an
    // `ask` INTENTION into history, which `askedInDeliveredTurn` reads as the user's consent next turn.
    effectWrite(ledger, world, 'createTicket', { q: 1 }, 'ask');
    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['createTicket']);
    expect(derived).toEqual([{ op: 'operation', target: 'ask', outcome: 'success' }]);
    expect(hasAskIntent(derived)).toBe(false);
  });

  it('every SPEECH op is coerced; an ordinary label is untouched', () => {
    for (const speech of ['inform', 'greet', 'refuse', 'ask']) {
      const ledger = createLedger();
      const world = fixtureWorld();
      effectWrite(ledger, world, 'createTicket', { q: 1 }, speech);
      expect(deriveClaimsFromLedger(ledger.observed, 0, ['createTicket'])).toEqual([
        { op: 'operation', target: speech, outcome: 'success' },
      ]);
    }
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createTicket', { q: 1 }, 'BK-9');
    expect(deriveClaimsFromLedger(ledger.observed, 0, ['createTicket'])).toEqual([
      { op: 'BK-9', target: 'BK-9', outcome: 'success' },
    ]);
  });
});

describe('finalizeReply — composed delivery over the structured payload', () => {
  // An EMPTY `did` is not deliverable. The route into it is one schema-legal malformed intention,
  // dropped by validateClaims, which would otherwise reduce the declaration to nothing and deliver the
  // message alone. The engine's declaration floor denies the candidate; a model that still declares
  // nothing gets the engine-derived closure, which declares its OWN speech intention rather than
  // sealing an empty turn.
  it('empty did → NOT deliverable: the declaration floor drives the turn to the engine closure', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [], contract: BOOKING_CONTRACT });
    const out = await finalizeReply(spec, BOOKING_CONTRACT, fixtureWorld(), createLedger(), P('Hello there.'), async () => P(''), 0);
    expect(out.text).not.toBe('Hello there.');
    expect(out.exhausted).toBe(true);
    expect(out.violations).toContain('declarationPresent');
    expect(out.did).toEqual([{ op: 'inform' }]);
  });

  // CONTROL (availability): a SPEECH intention is all an ordinary conversational turn needs — the floor
  // costs a well-behaved agent nothing, and adds no operation line.
  it('CONTROL: a speech-only did delivers the message under the empty-case closure, unexhausted', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [], contract: BOOKING_CONTRACT });
    const out = await finalizeReply(spec, BOOKING_CONTRACT, fixtureWorld(), createLedger(), P('Hello there.', [{ op: 'greet' }]), async () => P(''), 0);
    expect(out.text).toBe('Hello there.\n\nNo operation was carried out on this turn.');
    expect(out.exhausted).toBe(false);
    expect(out.did).toEqual([{ op: 'greet' }]);
  });

  it('non-empty VERIFIED did → message + the engine-rendered operation report', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld();
    effectWrite(ledger, world, 'createBooking', { slot: 1 }, 'BK-1');
    const did: Intention[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    const out = await finalizeReply(spec, BOOKING_CONTRACT, world, ledger, P('All booked.', did), async () => P(''), 0);
    expect(out.text).toBe('All booked.\n\nBK-1: done\nNothing else was changed on this turn.');
    expect(out.exhausted).toBe(false);
    expect(out.did).toEqual(did);
    // History keeps the VERIFIED set: finalizeReply synced the ledger to what it delivered.
    expect(ledger.did).toEqual(did);
  });

  // PIN: the `ask` intention is BOTH the claim record and the CONSENT record — the delivered `did` is
  // what a later turn's consent guards read as "the user was asked". A verified/derived path that
  // dropped it would silently delete a genuine cross-turn licence, so the accepted payload's `ask`
  // must survive into `out.did` AND `ledger.did` (history).
  it('an accepted payload KEEPS its ask intention in the verified did (the consent record)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const did: Intention[] = [{ op: 'ask' }];
    const out = await finalizeReply(spec, BOOKING_CONTRACT, fixtureWorld(), ledger, P('Shall I cancel it?', did), async () => P(''), 0);
    expect(out.text).toBe('Shall I cancel it?\n\nNo operation was carried out on this turn.'); // a speech intention adds no operation line
    expect(out.did).toEqual([{ op: 'ask' }]);
    expect(ledger.did).toEqual([{ op: 'ask' }]);
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

  it('a simulate-only turn → the "nothing was changed" shape, no fabricated success', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    spec.addReplyCheck(custom({ kind: 'alwaysDeny', dim: 'behavior', check: () => 'nope', prose: () => '' }), { id: 'agent:deny' });
    const ledger = createLedger();
    const world = fixtureWorld();
    simulateWrite(ledger, world, 'createBooking', { slot: 9 }); // ran, changed nothing
    const out = await finalizeReply(spec, BOOKING_CONTRACT, world, ledger, P('Working on it.'), async () => P('Working on it.'), 0);
    expect(out.exhausted).toBe(true);
    expect(out.text).toBe('No operation was carried out on this turn.\n\nI could not complete this safely — nothing was changed. Could you rephrase or add detail?');
    expect(out.text).not.toContain('createBooking');
    // Nothing landed → no ACTION claim is derived. The closure is still a delivered turn, so the engine
    // declares it as the speech act it is (no delivered turn carries zero intentions) — an
    // `inform` renders no operation line, which is why the text is the bare sentence above.
    expect(out.did).toEqual([{ op: 'inform' }]);
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
    expect(out.text).toBe('Booked your slot.\n\nBK-1: done\nNothing else was changed on this turn.');
    expect(out.did).toEqual([{ op: 'book', target: 'BK-1', outcome: 'success' }]);
  });
});

describe('finalizeReply — salvage re-validates the FULL payload, so a fabricated did is never salvaged', () => {
  it('rejects a salvage candidate whose did fails claimIsGrounded → falls through to the honest closure', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['createBooking'], contract: BOOKING_CONTRACT });
    const ledger = createLedger();
    const world = fixtureWorld(); // NO effected write — nothing grounds a success on BK-9
    // A prior ok respond in the ledger fabricated a success it never made.
    recordTerminalCall(ledger, 'respond', { message: 'Done! Booked BK-9.', did: [{ op: 'book', target: 'BK-9', outcome: 'success' }] });
    // The current (different) payload also fabricates → claimIsGrounded fires → we reach the salvage branch.
    const out = await finalizeReply(
      spec, BOOKING_CONTRACT, world, ledger,
      P('Retrying.', [{ op: 'book', target: 'BK-9', outcome: 'success' }]),
      async () => P('Retrying.', [{ op: 'book', target: 'BK-9', outcome: 'success' }]),
      0,
    );
    expect(out.exhausted).toBe(true);
    expect(out.text).not.toContain('BK-9'); // the fabricated success is NEVER delivered
    expect(out.text).toBe('No operation was carried out on this turn.\n\nI could not complete this safely — nothing was changed. Could you rephrase or add detail?');
    expect(ledger.turnCorrections.some((c) => c.startsWith('salvage-miss:checks:claimIsGrounded'))).toBe(true);
  });
});
