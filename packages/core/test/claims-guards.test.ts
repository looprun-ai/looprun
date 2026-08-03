/**
 * THE CROSS-CHECK GUARDS — the deterministic honesty core (SCG-T3).
 *
 * The agent DECLARES what it did as STRUCTURE (`ctx.did`), and these three guards ground that
 * declaration against the WORLD LEDGER — which the agent does not control. No guard here reads reply
 * prose; every verdict is a comparison of a `TurnClaim` against `ctx.observed` / `ctx.world.toolCalls`
 * / `ctx.attemptedThisTurn` (LEDGER DATA, never authored patterns — the no-regex law).
 *
 * One `describe` block per row of the grounding table in the task brief, plus the Step-1 vectors:
 * fabricated success, hidden effected write, honest not_found on an empty read, a no-effect probe with
 * a no_op claim, a domain outcome word mapping to a core outcome, an undeclared outcome word, and the
 * rubric polarity in BOTH directions.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import type { OutcomeMap, TurnClaim } from '../src/runtime/claims.js';
import { claimIsGrounded, claimIsComplete, claimCoversRubric, isEmptyReadResult, targetMatchesValue } from '../src/guards/honesty.js';

/** A world whose `toolCalls` carry the RESULT the ledger observed for a call (name + args keyed). */
function worldWith(toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>): GuardCtx['world'] {
  return {
    exec: () => ({ success: true }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls,
    sseActions: [],
  } as GuardCtx['world'];
}

/** A reply-side GuardCtx (turnIndex 0) — the shape `checkReply` builds. */
function replyCtx(over: Partial<GuardCtx> & { did: TurnClaim[] }): GuardCtx {
  return {
    args: {},
    world: over.world ?? worldWith([]),
    observed: [],
    turnIndex: 0,
    userText: '',
    history: [],
    reply: 'anything',
    attemptedThisTurn: [],
    ...over,
  } as GuardCtx;
}

/** An observed domain call of this turn. */
const call = (
  name: string,
  args: Record<string, unknown>,
  over: Partial<ObservedCall> = {},
): ObservedCall => ({ name, args, ok: true, turnIndex: 0, ...over });

const WRITES = ['createBooking', 'cancelBooking', 'refundOrder'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// targetMatchesValue — THE RISK CENTER (MI-T3 / M1, tightened MI-T7). Every grounding, coverage and
// rubric verdict routes through this one predicate, so it is unit-tested exhaustively: WHOLE-VALUE
// equality after canonicalization (case-folded within-script, trimmed, edge punctuation stripped).
// NEVER a substring and — since red-team r2 — never a token RUN either: `BK-1` must not match `BK-10`,
// `BK-12345`, `xBK-1y` or `BK-1-EXTRA`, and `12` must not match `Order 12` (one word of a name is not
// the name: it stood for the entity, and equally for `Invoice 12`).
// ─────────────────────────────────────────────────────────────────────────────
describe('targetMatchesValue — whole-value equality (M1)', () => {
  it('EXACT value equality matches (the honest case)', () => {
    expect(targetMatchesValue('BK-1', 'BK-1')).toBe(true);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(targetMatchesValue('bk-1', 'BK-1')).toBe(true);
    expect(targetMatchesValue('  BK-1  ', 'BK-1')).toBe(true);
    expect(targetMatchesValue('BK-1', '\tBK-1\n')).toBe(true);
  });

  it('a LONGER id is a different entity — BK-1 does NOT match BK-10 / BK-12345 / BK-1-EXTRA', () => {
    expect(targetMatchesValue('BK-1', 'BK-10')).toBe(false);
    expect(targetMatchesValue('BK-1', 'BK-12345')).toBe(false);
    expect(targetMatchesValue('BK-1', 'BK-1-EXTRA')).toBe(false);
  });

  it('a SHORTER id is a different entity — BK-12345 does NOT match BK-1, and BK does not match BK-1', () => {
    expect(targetMatchesValue('BK-12345', 'BK-1')).toBe(false);
    expect(targetMatchesValue('BK', 'BK-1')).toBe(false);
  });

  it('an embedded substring never matches — BK-1 does NOT match xBK-1y', () => {
    expect(targetMatchesValue('BK-1', 'xBK-1y')).toBe(false);
    expect(targetMatchesValue('5', '50')).toBe(false);
    expect(targetMatchesValue('5', '15')).toBe(false);
  });

  it('an id INSIDE a world sentence no longer matches — only the whole value does (MI-T7)', () => {
    // WAS true: the id "stood on its own word" inside the sentence. That token-run scan is what let a
    // status word, a note fragment or one word of a name ground and COVER a write, so it is gone.
    // Identity is key-scoped now, so the values on the other side are ids and labels, not prose.
    expect(targetMatchesValue('BK-1', 'no record for BK-1 in the archive')).toBe(false);
    expect(targetMatchesValue('BK-1', 'Booking BK-1.')).toBe(false);
    expect(targetMatchesValue('BK-1', '(BK-1)')).toBe(true); // EDGE punctuation is still stripped
  });

  it('a token that only PREFIXES a word does not match', () => {
    expect(targetMatchesValue('BK-1', 'no record for BK-10 in the archive')).toBe(false);
  });

  it('a MULTI-WORD name matches as a WHOLE, never by one of its words (MI-T7 / §2.1)', () => {
    expect(targetMatchesValue('John Smith', 'John Smith')).toBe(true);
    expect(targetMatchesValue('John Smith', 'customer John Smith created')).toBe(false);
    expect(targetMatchesValue('John', 'John Smith')).toBe(false);
    expect(targetMatchesValue('John Smith', 'John Doe and Ann Smith')).toBe(false);
  });

  it('a target that canonicalizes to nothing matches NOTHING (fails closed)', () => {
    expect(targetMatchesValue('---', '--- ')).toBe(false); // no letter or digit ⇒ it names no entity
    expect(targetMatchesValue('---', 'anything at all')).toBe(false);
  });

  it('a unicode LOOKALIKE never folds onto the ASCII id (§2.4), and an invisible control never strips (§2.6)', () => {
    expect(targetMatchesValue('ORD-K1', 'ORD-K1')).toBe(false); // U+212A KELVIN SIGN
    expect(targetMatchesValue('BK-1‏', 'BK-1')).toBe(false);    // RIGHT-TO-LEFT MARK
    expect(targetMatchesValue('‮BK-1', 'BK-1')).toBe(false);    // RIGHT-TO-LEFT OVERRIDE
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimIsGrounded — the grounding table, one describe per row
// ─────────────────────────────────────────────────────────────────────────────
describe('claimIsGrounded', () => {
  const grounded = (over: Partial<GuardCtx> & { did: TurnClaim[] }, outcomes?: OutcomeMap) =>
    claimIsGrounded({ writeTools: WRITES, outcomes }).check(replyCtx(over));

  it('is a no-op when the turn declared nothing (empty did)', () => {
    expect(grounded({ did: [] })).toBeNull();
  });

  describe('row: undeclared outcome word → NEVER grounds (names the undeclared outcome)', () => {
    it('a word that is neither core nor mapped is a violation', () => {
      const reason = grounded({ did: [{ op: 'book', target: 'BK-1', outcome: 'teleported' }] });
      expect(reason).toBeTruthy();
      expect(reason).toContain('teleported');
    });
  });

  describe("row: success ⇔ ∃ write in calls with tookEffect===true and matches", () => {
    const did: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];

    it('grounds against an effected write on the same target', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('FABRICATED success — success claim with NO write is a violation', () => {
      expect(grounded({ did })).toBeTruthy();
    });

    it('a write that did NOT take effect (a probe) does not ground a success claim', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('an effected write on a DIFFERENT target does not ground (matches fails)', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-9' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-9' }, tookEffect: true, result: { label: 'BK-9' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('a targetless success claim grounds against ANY effected write', () => {
      const ctx = {
        did: [{ op: 'book', outcome: 'success' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('M2 — only WORLD-ISSUED values ground: the target in an agent-authored ARG is not evidence', () => {
      // The write really took effect, and its args name BK-1 — but the args are the AGENT's own text.
      // The world's result says nothing about BK-1, so the claim has no ledger fact behind it.
      const ctx = {
        did,
        observed: [call('createBooking', { note: 'about BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { note: 'about BK-1' }, tookEffect: true, result: { label: 'BK-77' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: failure ⇔ ∃ call with ok===false and matches', () => {
    it('grounds against a failed call on the target', () => {
      const ctx = {
        did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { ok: false })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: { error: 'BK-1 could not be created' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no failed call → a failure claim is a violation', () => {
      expect(grounded({ did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] })).toBeTruthy();
    });
  });

  describe('row: blocked/refused ⇔ ∃ vetoed attempt with matches OR ∃ ok===false call', () => {
    it('grounds a blocked claim against a guard-vetoed attempt', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'blocked' }] as TurnClaim[],
        attemptedThisTurn: [{ name: 'cancelBooking', args: { bookingId: 'BK-1' } }],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('grounds a refused claim against a world refusal (ok:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'refused' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { ok: false })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, result: { error: 'BK-1 may not be cancelled' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no veto and no failed call → blocked claim is a violation', () => {
      expect(grounded({ did: [{ op: 'cancel', target: 'BK-1', outcome: 'blocked' }] })).toBeTruthy();
    });
  });

  describe('row: not_found ⇔ ∃ read (non-write), ok, empty result, matches', () => {
    it('grounds against an empty read whose identity-key ARG names the target', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([
          { name: 'findBooking', args: { bookingId: 'BK-1' }, result: { success: true, status: 'no record for BK-1', data: [] } },
        ]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('an empty read GROUNDS the entity its identity-key ARG named — that is what a lookup is (MI-T7)', () => {
      const observed = [call('findBooking', { bookingId: 'BK-1' })];
      const world = worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { success: true, data: [] } }]);
      // M2 (args are never evidence) is a law about claims of PRESENCE and is unchanged for `success`.
      // An ABSENT record issues no value at all, so the ONLY thing that can name the subject of an empty
      // lookup is the lookup: `bookingId:'BK-1'` + the world's own empty answer IS the not_found.
      expect(grounded({ did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }], observed, world })).toBeNull();
      expect(grounded({ did: [{ op: 'lookup', outcome: 'not_found' }], observed, world })).toBeNull();
    });

    it('a FREE-TEXT query arg carries no verdict — an echoed search string never grounds not_found', () => {
      // The identity filter is what keeps the args conjunct honest: a world that ECHOES the agent's
      // query into its own status sentence cannot launder a not_found on an entity a real lookup would
      // have found (red-team r2, §6.2).
      const observed = [call('search', { query: 'BK-1 in cold-archive-partition' })];
      const world = worldWith([
        { name: 'search', args: { query: 'BK-1 in cold-archive-partition' }, result: { status: 'no results for "BK-1 in cold-archive-partition"', data: [] } },
      ]);
      expect(grounded({ did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }], observed, world })).toBeTruthy();
    });

    it('a NON-empty read does not ground a not_found claim', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { data: [{ id: 'BK-1' }] } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('a WRITE call does not ground a not_found claim (must be a read)', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: [] }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: pending_confirmation ⇔ ∃ call with resultFlags.requiresConfirmation and matches', () => {
    it('grounds against a call flagged requiresConfirmation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'pending_confirmation' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { resultFlags: { requiresConfirmation: true } })],
        world: worldWith([
          { name: 'cancelBooking', args: { bookingId: 'BK-1' }, result: { requiresConfirmation: true, question: 'Cancel BK-1?' } },
        ]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no requiresConfirmation flag → violation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'pending_confirmation' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' })],
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: no_op ⇔ NO write in calls with tookEffect===true and matches', () => {
    it('a no_op claim grounds when the write only PROBED (tookEffect:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('a no_op claim is a violation when the write DID take effect', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('an effected write the world NAMED NOTHING for still contradicts a no_op on it (MI-T7)', () => {
      // The write took effect and its result identifies nothing — but the CALL addressed BK-1, and the
      // contrary-evidence test reads everything the call addressed, so grounding catches it now too.
      // (It used to pass grounding, with claimIsComplete as the only backstop; both deny today.)
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { success: true } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeTruthy();
    });

    it('a no_op on an entity the turn NEVER ADDRESSED does not ground (the vacuous row is closed)', () => {
      // `no_op` was the one row satisfied by the ABSENCE of contrary evidence, so any target grounded on
      // an empty ledger and the renderer announced it as a verified non-event (red-team r2, §5).
      expect(grounded({ did: [{ op: 'check', target: 'BK-999', outcome: 'no_op' }] })).toBeTruthy();
      const ctx = {
        did: [{ op: 'check', target: 'BK-2', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { id: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('CONTROL: a no_op grounds when the turn DID look at the entity and changed nothing', () => {
      const ctx = {
        did: [{ op: 'check', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { id: 'BK-1', status: 'already cancelled' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });
  });

  describe('IDENTITY vs MAGNITUDE — a result scalar that names nothing grounds nothing', () => {
    // REVIEW FINDING (MI-T3): with every scalar of the result in the match set, the AMOUNT of a write
    // grounded a claim — and covered the write — so the entity acted on never reached the user.
    const refundWorld = worldWith([
      { name: 'refundOrder', args: { orderId: 'ORD-1' }, tookEffect: true, result: { id: 'ORD-1', refunded: 500 } },
    ]);
    const refundCall = [call('refundOrder', { orderId: 'ORD-1' }, { tookEffect: true })];

    it('a claim on the AMOUNT does not ground (500 is a magnitude, not an entity)', () => {
      const ctx = { did: [{ op: 'refund', target: '500', outcome: 'success' }] as TurnClaim[], observed: refundCall, world: refundWorld };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('and it does not COVER the write either — the hidden ORD-1 refund is reported', () => {
      const ctx = { did: [{ op: 'refund', target: '500', outcome: 'success' }] as TurnClaim[], observed: refundCall, world: refundWorld };
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeTruthy();
    });

    it('CONTROL: the claim on the entity the world NAMED grounds and covers', () => {
      const ctx = { did: [{ op: 'refund', target: 'ORD-1', outcome: 'success' }] as TurnClaim[], observed: refundCall, world: refundWorld };
      expect(grounded(ctx)).toBeNull();
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeNull();
    });

    it('CONTROL: a NUMERIC id under an identity key still grounds (id / label / <entity>Id)', () => {
      for (const result of [{ id: 5 }, { label: 5 }, { accountId: 5 }, { account_id: 5 }]) {
        const ctx = {
          did: [{ op: 'close', target: '5', outcome: 'success' }] as TurnClaim[],
          observed: [call('cancelBooking', { n: 5 }, { tookEffect: true })],
          world: worldWith([{ name: 'cancelBooking', args: { n: 5 }, tookEffect: true, result }]),
        };
        expect(grounded(ctx), JSON.stringify(result)).toBeNull();
      }
    });

    it('a number under a NON-identity key never names an entity (count / code / paid)', () => {
      for (const result of [{ count: 5 }, { code: 5 }, { paid: 5 }, { total: 5 }]) {
        const ctx = {
          did: [{ op: 'close', target: '5', outcome: 'success' }] as TurnClaim[],
          observed: [call('cancelBooking', { n: 5 }, { tookEffect: true })],
          world: worldWith([{ name: 'cancelBooking', args: { n: 5 }, tookEffect: true, result }]),
        };
        expect(grounded(ctx), JSON.stringify(result)).toBeTruthy();
      }
    });

    it('a boolean flag never names an entity', () => {
      const ctx = {
        did: [{ op: 'close', target: 'true', outcome: 'success' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { success: true } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('MI-D5 — the cross-check applies to ACTION intents only', () => {
    it('a SPEECH intention is never grounded (it carries no outcome and names no ledger fact)', () => {
      for (const op of ['inform', 'greet', 'refuse', 'ask']) {
        expect(grounded({ did: [{ op }] })).toBeNull();
      }
    });

    it('a speech intention alongside a grounded action intention does not disturb the verdict', () => {
      const ctx = {
        did: [{ op: 'greet' }, { op: 'book', target: 'BK-1', outcome: 'success' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('an ACTION intention still needs a recognised outcome (speech exemption does not leak)', () => {
      expect(grounded({ did: [{ op: 'book', target: 'BK-1' }] })).toBeTruthy();
    });
  });

  describe('domain outcome mapping — a mapped word resolves before grounding', () => {
    const outcomes: OutcomeMap = { settled: 'success' };

    it("'settled' → 'success' grounds against an effected write", () => {
      const ctx = {
        did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] as TurnClaim[],
        observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: true })],
        world: worldWith([{ name: 'refundOrder', args: { orderId: 'ORD-7' }, tookEffect: true, result: { label: 'ORD-7' } }]),
      };
      expect(grounded(ctx, outcomes)).toBeNull();
    });

    it("'settled' with no effected write is still a violation (resolves to success first)", () => {
      expect(grounded({ did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] }, outcomes)).toBeTruthy();
    });
  });

  describe('the deny message follows the prose-leak law', () => {
    it('names the op and target and the resolved label, never the tool name', () => {
      const reason = grounded({
        did: [{ op: 'refund the order', target: 'ORD-7', outcome: 'success' }],
        observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: false })],
      });
      expect(reason).toContain('refund the order');
      expect(reason).toContain('ORD-7');
      expect(reason).not.toContain('refundOrder');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimIsComplete — every effected write must be claimed as success
// ─────────────────────────────────────────────────────────────────────────────
describe('claimIsComplete', () => {
  const complete = (over: Partial<GuardCtx> & { did: TurnClaim[] }) =>
    claimIsComplete({ writeTools: WRITES }).check(replyCtx(over));

  it('is a no-op when no write took effect this turn', () => {
    expect(complete({ did: [], observed: [call('findBooking', { bookingId: 'BK-1' })] })).toBeNull();
  });

  it('passes when every effected write is covered by a matching success claim', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'success' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeNull();
  });

  it('M3 — a TARGETLESS claim covers nothing: "some action succeeded" names no ledger fact', () => {
    const ctx = {
      did: [{ op: 'book', outcome: 'success' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('M3 — INJECTIVE: two effected writes on the SAME target need TWO claims (occurrence, not existence)', () => {
    const observed = [
      call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true }),
      call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true }),
    ];
    const world = worldWith([
      { name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } },
      { name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } },
    ]);
    const one: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    const two: TurnClaim[] = [...one, { op: 'cancel', target: 'BK-1', outcome: 'success' }];
    expect(complete({ did: one, observed, world })).toBeTruthy();
    expect(complete({ did: two, observed, world })).toBeNull();
  });

  it('a SPEECH intention never covers an effected write (MI-D5: no action hides behind an inform)', () => {
    const ctx = {
      did: [{ op: 'inform' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('HIDDEN WRITE — an effected write with no claim is a violation', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('names the produced label when the world issued one', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'Booking BK-1' } }]),
    };
    const reason = complete(ctx);
    expect(reason).toContain('Booking BK-1');
    expect(reason).not.toContain('createBooking');
  });

  it('falls back to a generic phrase when no produced label is available', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    const reason = complete(ctx) ?? '';
    expect(reason).toMatch(/an action you did not report/);
    expect(reason).not.toContain('createBooking');
  });

  it('a non-success claim does not cover an effected write', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('a probe (tookEffect:false) needs no claim', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
    };
    expect(complete(ctx)).toBeNull();
  });

  it("MAPPING LAW — a domain word claim ('settled' → 'success' via the OutcomeMap) covers an effected write, exactly like claimIsGrounded", () => {
    const outcomes: OutcomeMap = { settled: 'success' };
    const ctx = {
      did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] as TurnClaim[],
      observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: true })],
      world: worldWith([{ name: 'refundOrder', args: { orderId: 'ORD-7' }, tookEffect: true, result: { label: 'ORD-7' } }]),
    };
    expect(claimIsComplete({ writeTools: WRITES, outcomes }).check(replyCtx(ctx))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimCoversRubric — polarity is a FIELD (replaces replyMentions)
// ─────────────────────────────────────────────────────────────────────────────
describe('claimCoversRubric', () => {
  const covers = (opts: { targets: string[]; outcome: 'success' | 'not_found' | 'any' }, did: TurnClaim[]) =>
    claimCoversRubric(opts, 'Account for the record you were asked about.').check(replyCtx({ did }));

  it('passes when the target appears with the required outcome', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'success' }])).toBeNull();
  });

  it('POLARITY — a not_found claim FAILS a rubric requiring success', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeTruthy();
  });

  it('POLARITY — the same not_found claim PASSES a rubric requiring not_found', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'not_found' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it("outcome 'any' passes on any polarity as long as the target appears", () => {
    expect(covers({ targets: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it('M1 — a NEAR-MISS id does not satisfy the rubric: BK-1 is not covered by a BK-10 claim', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-10', outcome: 'success' }])).toBeTruthy();
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'success' }])).toBeNull();
  });

  it('a missing target is a violation (returns the authored reason)', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-2', outcome: 'success' }])).toBe(
      'Account for the record you were asked about.',
    );
  });

  it('every configured target must appear', () => {
    const did: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    expect(covers({ targets: ['BK-1', 'BK-2'], outcome: 'success' }, did)).toBeTruthy();
  });

  describe('mapping law — the same OutcomeMap claimIsGrounded/claimIsComplete use also threads here', () => {
    const outcomes: OutcomeMap = { settled: 'success' };
    const did: TurnClaim[] = [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }];
    const reason = 'Account for the order you were asked about.';

    it("'settled' satisfies a rubric requiring 'success' WITH the map", () => {
      expect(claimCoversRubric({ targets: ['ORD-7'], outcome: 'success', outcomes }, reason).check(replyCtx({ did }))).toBeNull();
    });

    it("the same 'settled' claim FAILS the same rubric WITHOUT the map (an undeclared word grounds nothing)", () => {
      expect(claimCoversRubric({ targets: ['ORD-7'], outcome: 'success' }, reason).check(replyCtx({ did }))).toBe(reason);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isEmptyReadResult — the exhaustive edge table
// ─────────────────────────────────────────────────────────────────────────────
describe('isEmptyReadResult', () => {
  it('null / undefined are empty', () => {
    expect(isEmptyReadResult(null)).toBe(true);
    expect(isEmptyReadResult(undefined)).toBe(true);
  });

  it('an empty array is empty; a non-empty array is not', () => {
    expect(isEmptyReadResult([])).toBe(true);
    expect(isEmptyReadResult([{ id: 1 }])).toBe(false);
  });

  it('an empty object is empty', () => {
    expect(isEmptyReadResult({})).toBe(true);
  });

  it('the {success:true, data:[]} shape is empty (boolean + empty array)', () => {
    expect(isEmptyReadResult({ success: true, data: [] })).toBe(true);
  });

  it('a non-empty array field anywhere makes it non-empty', () => {
    expect(isEmptyReadResult({ success: true, results: [{ id: 'BK-1' }] })).toBe(false);
  });

  it('a truthy record field (a nested entity) makes it non-empty', () => {
    expect(isEmptyReadResult({ booking: { id: 'BK-1' } })).toBe(false);
  });

  it('a status-like string field does not count as content', () => {
    expect(isEmptyReadResult({ status: 'not_found', data: [] })).toBe(true);
  });

  it('a falsy scalar field (count:0) does not count as content', () => {
    expect(isEmptyReadResult({ success: true, count: 0, data: [] })).toBe(true);
  });

  it('a truthy scalar field (a plain id string) counts as content', () => {
    expect(isEmptyReadResult({ id: 'BK-1' })).toBe(false);
  });

  // ── M4 (red-team): a status-like KEY must not hide a RECORD ────────────────────────────────────
  // The status-key skip existed for a status STRING (`status:'not_found'` is not content). It ran
  // BEFORE the nested-object check, so a found entity returned under one of those key names —
  // `{message:{booking:'BK-1'}}`, the common "envelope" read shape — read as EMPTY, and a
  // `not_found` claim about a record the world DID return grounded. Only a SCALAR/boolean under a
  // status key is skipped now; a nested record is content whatever the key is called.
  it('M4: a RECORD under a status-like key is CONTENT, not empty', () => {
    expect(isEmptyReadResult({ message: { booking: 'BK-1' } })).toBe(false);
    expect(isEmptyReadResult({ status: { id: 'BK-1' } })).toBe(false);
    expect(isEmptyReadResult({ state: { id: 'BK-1' }, success: true })).toBe(false);
  });

  it('M4 control: a SCALAR under a status-like key is still not content', () => {
    // …but a status WORD alone is no longer EVIDENCE of emptiness either — see the next test.
    expect(isEmptyReadResult({ status: 'not_found', found: false })).toBe(true);
    expect(isEmptyReadResult({ message: 'no record found', data: [] })).toBe(true);
  });

  // ── MI-T7 (red-team r2 §6.1): emptiness needs POSITIVE evidence, and a status SENTENCE is not it ──
  // The old law skipped every scalar status-like field, so a result whose ONLY field was a status
  // sentence read as EMPTY — and `{status:'BK-1 is active and confirmed'}`, a read reporting the record
  // as PRESENT, grounded a `not_found` on it. That is the polarity inversion the whole structured-claims
  // redesign exists to kill, reappearing inside the emptiness heuristic. A result with no DATA CHANNEL
  // is undecidable and fails closed; a domain whose empty read has none must return one.
  it('a record with NO data channel is not empty — undecidable fails closed', () => {
    expect(isEmptyReadResult({ status: 'BK-1 is active and confirmed' })).toBe(false);
    expect(isEmptyReadResult({ message: 'no record found' })).toBe(false);
    expect(isEmptyReadResult({ success: false })).toBe(false);
    expect(isEmptyReadResult('')).toBe(false); // a bare scalar names no channel either
  });

  it('a FALSE found/exists flag IS a data channel — the envelope shape stays groundable', () => {
    expect(isEmptyReadResult({ found: false, message: 'no record for BK-1' })).toBe(true);
    expect(isEmptyReadResult({ exists: false })).toBe(true);
    expect(isEmptyReadResult({ found: true })).toBe(false); // "it is there" is not emptiness
  });

  it('an empty data channel beside a NAMED entity is not empty', () => {
    expect(isEmptyReadResult({ data: [], id: 'BK-1' })).toBe(false);
  });
});
