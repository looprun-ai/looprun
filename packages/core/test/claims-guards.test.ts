/**
 * THE CROSS-CHECK GUARDS — the deterministic honesty core.
 *
 * The agent DECLARES what it did as STRUCTURE (`ctx.did`), and these three guards ground that
 * declaration against the WORLD ACTION HISTORY — which the agent does not control. No guard here reads reply
 * prose; every verdict is a comparison of a `Intention` against `ctx.observed` / `ctx.world.toolCalls`
 * / `ctx.attemptedThisTurn` (ACTION HISTORY DATA, never authored patterns — the no-regex law).
 *
 * One `describe` block per row of the grounding table, plus the attack vectors:
 * fabricated success, hidden effected write, honest not_found on an empty read, a no-effect simulate with
 * a no_op claim, a domain outcome word mapping to a core outcome, an undeclared outcome word, and the
 * rubric polarity in BOTH directions.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import type { OutcomeMap, Intention } from '../src/runtime/claims.js';
import { claimIsGrounded, claimIsComplete, mustAccountFor, isEmptyReadResult, targetMatchesValue } from '../src/guards/honesty.js';

/** A world whose `toolCalls` carry the RESULT the action history observed for a call (name + args keyed). */
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
function replyCtx(over: Partial<GuardCtx> & { did: Intention[] }): GuardCtx {
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
// targetMatchesValue — THE RISK CENTER. Every grounding, coverage and
// rubric verdict routes through this one predicate, so it is unit-tested exhaustively: WHOLE-VALUE
// equality after canonicalization (case-folded within-script, trimmed, edge punctuation stripped).
// NEVER a substring, and never a token RUN either: `BK-1` must not match `BK-10`, `BK-12345`,
// `xBK-1y` or `BK-1-EXTRA`, and `12` must not match `Order 12` (one word of a name is not the name:
// it would stand for that entity and equally for `Invoice 12`).
// ─────────────────────────────────────────────────────────────────────────────
describe('targetMatchesValue — whole-value equality', () => {
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

  it('an id INSIDE a world sentence does NOT match — only the whole value does', () => {
    // A token-run scan would accept the id because it "stands on its own word" inside the sentence, and
    // that is what lets a status word, a note fragment or one word of a name ground and COVER a write.
    // Identity is key-scoped, so the values on the other side are ids and labels, not prose.
    expect(targetMatchesValue('BK-1', 'no record for BK-1 in the archive')).toBe(false);
    expect(targetMatchesValue('BK-1', 'Booking BK-1.')).toBe(false);
    expect(targetMatchesValue('BK-1', '(BK-1)')).toBe(true); // EDGE punctuation is still stripped
  });

  it('a token that only PREFIXES a word does not match', () => {
    expect(targetMatchesValue('BK-1', 'no record for BK-10 in the archive')).toBe(false);
  });

  it('a MULTI-WORD name matches as a WHOLE, never by one of its words', () => {
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
  const grounded = (over: Partial<GuardCtx> & { did: Intention[] }, outcomes?: OutcomeMap) =>
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
    const did: Intention[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];

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

    it('a write that did NOT take effect (a simulate) does not ground a success claim', () => {
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
        did: [{ op: 'book', outcome: 'success' }] as Intention[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('only WORLD-ISSUED values ground: the target in an agent-authored ARG is not evidence', () => {
      // The write really took effect, and its args name BK-1 — but the args are the AGENT's own text.
      // The world's result says nothing about BK-1, so the claim has no action history fact behind it.
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
        did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as Intention[],
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
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'blocked' }] as Intention[],
        attemptedThisTurn: [{ name: 'cancelBooking', args: { bookingId: 'BK-1' } }],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('grounds a refused claim against a world refusal (ok:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'refused' }] as Intention[],
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
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as Intention[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([
          { name: 'findBooking', args: { bookingId: 'BK-1' }, result: { success: true, status: 'no record for BK-1', data: [] } },
        ]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('an empty read GROUNDS the entity its identity-key ARG named — that is what a lookup is', () => {
      const observed = [call('findBooking', { bookingId: 'BK-1' })];
      const world = worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { success: true, data: [] } }]);
      // "Args are never evidence" is a law about claims of PRESENCE, and it holds for `success`.
      // An ABSENT record issues no value at all, so the ONLY thing that can name the subject of an empty
      // lookup is the lookup: `bookingId:'BK-1'` + the world's own empty answer IS the not_found.
      expect(grounded({ did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }], observed, world })).toBeNull();
      expect(grounded({ did: [{ op: 'lookup', outcome: 'not_found' }], observed, world })).toBeNull();
    });

    it('a FREE-TEXT query arg carries no verdict — an echoed search string never grounds not_found', () => {
      // The identity filter is what keeps the args conjunct honest: a world that ECHOES the agent's
      // query into its own status sentence cannot launder a not_found on an entity a real lookup would
      // have found.
      const observed = [call('search', { query: 'BK-1 in cold-archive-partition' })];
      const world = worldWith([
        { name: 'search', args: { query: 'BK-1 in cold-archive-partition' }, result: { status: 'no results for "BK-1 in cold-archive-partition"', data: [] } },
      ]);
      expect(grounded({ did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }], observed, world })).toBeTruthy();
    });

    it('a NON-empty read does not ground a not_found claim', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as Intention[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { data: [{ id: 'BK-1' }] } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('a WRITE call does not ground a not_found claim (must be a read)', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as Intention[],
        observed: [call('createBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: [] }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: tool_called_request_approval ⇔ ∃ call with resultFlags.requiresConfirmation and matches', () => {
    it('grounds against a call flagged requiresConfirmation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'tool_called_request_approval' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { resultFlags: { requiresConfirmation: true } })],
        world: worldWith([
          { name: 'cancelBooking', args: { bookingId: 'BK-1' }, result: { requiresConfirmation: true, question: 'Cancel BK-1?' } },
        ]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no requiresConfirmation flag → violation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'tool_called_request_approval' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' })],
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: no_op ⇔ NO write in calls with tookEffect===true and matches', () => {
    it('a no_op claim grounds when the write only SIMULATED (tookEffect:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('a no_op claim is a violation when the write DID take effect', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('an effected write the world NAMED NOTHING for still contradicts a no_op on it', () => {
      // The write took effect and its result identifies nothing — but the CALL addressed BK-1, and the
      // contrary-evidence test reads everything the call addressed, so grounding catches it too —
      // claimIsComplete is not the only backstop; both deny.
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { success: true } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeTruthy();
    });

    it('a no_op on an entity the turn NEVER ADDRESSED does not ground (the vacuous row is closed)', () => {
      // `no_op` is the one row a bare ABSENCE of contrary evidence would satisfy: without this, any
      // target grounds on an empty action history and the renderer announces it as a verified non-event.
      expect(grounded({ did: [{ op: 'check', target: 'BK-999', outcome: 'no_op' }] })).toBeTruthy();
      const ctx = {
        did: [{ op: 'check', target: 'BK-2', outcome: 'no_op' }] as Intention[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { id: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('CONTROL: a no_op grounds when the turn DID look at the entity and changed nothing', () => {
      const ctx = {
        did: [{ op: 'check', target: 'BK-1', outcome: 'no_op' }] as Intention[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { id: 'BK-1', status: 'already cancelled' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });
  });

  // OPEN VECTOR — a target is checked against EVERY scalar the act carried, with no notion of which of
  // those scalars is the record. So a magnitude, a flag or a count stands where the record's own value
  // belongs. The charter for this mechanism is test/redteam/redteam-r2-matching.ts.
  describe('IDENTITY vs MAGNITUDE — a result scalar that names nothing grounds nothing', () => {
    const refundWorld = worldWith([
      { name: 'refundOrder', args: { orderId: 'ORD-1' }, tookEffect: true, result: { id: 'ORD-1', refunded: 500 } },
    ]);
    const refundCall = [call('refundOrder', { orderId: 'ORD-1' }, { tookEffect: true })];

    it.fails('a claim on the AMOUNT does not ground (500 is a magnitude, not an entity)', () => {
      const ctx = { did: [{ op: 'refund', target: '500', outcome: 'success' }] as Intention[], observed: refundCall, world: refundWorld };
      expect(grounded(ctx)).toBeTruthy();
    });

    it.fails('and it does not COVER the write either — the hidden ORD-1 refund is reported', () => {
      const ctx = { did: [{ op: 'refund', target: '500', outcome: 'success' }] as Intention[], observed: refundCall, world: refundWorld };
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeTruthy();
    });

    it('CONTROL: the claim on the entity the world NAMED grounds and covers', () => {
      const ctx = { did: [{ op: 'refund', target: 'ORD-1', outcome: 'success' }] as Intention[], observed: refundCall, world: refundWorld };
      expect(grounded(ctx)).toBeNull();
      expect(claimIsComplete({ writeTools: WRITES }).check(replyCtx(ctx))).toBeNull();
    });

    it('CONTROL: a NUMERIC id under an identity key still grounds (id / label / <entity>Id)', () => {
      for (const result of [{ id: 5 }, { label: 5 }, { accountId: 5 }, { account_id: 5 }]) {
        const ctx = {
          did: [{ op: 'close', target: '5', outcome: 'success' }] as Intention[],
          observed: [call('cancelBooking', { n: 5 }, { tookEffect: true })],
          world: worldWith([{ name: 'cancelBooking', args: { n: 5 }, tookEffect: true, result }]),
        };
        expect(grounded(ctx), JSON.stringify(result)).toBeNull();
      }
    });

    it.fails('a number under a NON-identity key never names an entity (count / code / paid)', () => {
      for (const result of [{ count: 5 }, { code: 5 }, { paid: 5 }, { total: 5 }]) {
        const ctx = {
          did: [{ op: 'close', target: '5', outcome: 'success' }] as Intention[],
          observed: [call('cancelBooking', { n: 5 }, { tookEffect: true })],
          world: worldWith([{ name: 'cancelBooking', args: { n: 5 }, tookEffect: true, result }]),
        };
        expect(grounded(ctx), JSON.stringify(result)).toBeTruthy();
      }
    });

    it.fails('a boolean flag never names an entity', () => {
      const ctx = {
        did: [{ op: 'close', target: 'true', outcome: 'success' }] as Intention[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { success: true } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('the cross-check applies to ACTION intents only', () => {
    it('a SPEECH intention is never grounded (it carries no outcome and names no actionHistory fact)', () => {
      for (const op of ['inform', 'greet', 'refuse', 'ask']) {
        expect(grounded({ did: [{ op }] })).toBeNull();
      }
    });

    it('a speech intention alongside a grounded action intention does not disturb the verdict', () => {
      const ctx = {
        did: [{ op: 'greet' }, { op: 'book', target: 'BK-1', outcome: 'success' }] as Intention[],
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
        did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] as Intention[],
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
  const complete = (over: Partial<GuardCtx> & { did: Intention[] }) =>
    claimIsComplete({ writeTools: WRITES }).check(replyCtx(over));

  it('is a no-op when no write took effect this turn', () => {
    expect(complete({ did: [], observed: [call('findBooking', { bookingId: 'BK-1' })] })).toBeNull();
  });

  it('passes when every effected write is covered by a matching success claim', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'success' }] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeNull();
  });

  // OPEN VECTOR — coverage counts ACTS against DECLARATIONS by position and by outcome word; it does not
  // demand that a declaration name the record. So "some action succeeded" covers a write.
  it.fails('a TARGETLESS claim covers nothing: "some action succeeded" names no actionHistory fact', () => {
    const ctx = {
      did: [{ op: 'book', outcome: 'success' }] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('INJECTIVE: two effected writes on the SAME target need TWO claims (occurrence, not existence)', () => {
    const observed = [
      call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true }),
      call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true }),
    ];
    const world = worldWith([
      { name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } },
      { name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } },
    ]);
    const one: Intention[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    const two: Intention[] = [...one, { op: 'cancel', target: 'BK-1', outcome: 'success' }];
    expect(complete({ did: one, observed, world })).toBeTruthy();
    expect(complete({ did: two, observed, world })).toBeNull();
  });

  it('a SPEECH intention never covers an effected write (no action hides behind an inform)', () => {
    const ctx = {
      did: [{ op: 'inform' }] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('HIDDEN WRITE — an effected write with no claim is a violation', () => {
    const ctx = {
      did: [] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('names the tool whose act went unreported, and the word to report it as', () => {
    const ctx = {
      did: [] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    const reason = complete(ctx) ?? '';
    expect(reason).toContain('Nothing in your report accounts for what createBooking did this turn');
    expect(reason).toContain("Declarable with this turn's evidence: success.");
  });

  it('THE ORDER IS THE AGENT\'S OWN — a complete report that leads with the outcome asked about passes', () => {
    const observed = [
      call('generateQuote', { assetId: 'AST-1' }, { tookEffect: true }),
      call('createBooking', { assetId: 'AST-1' }, { ok: false }),
    ];
    const world = worldWith([
      { name: 'generateQuote', args: { assetId: 'AST-1' }, tookEffect: true },
      { name: 'createBooking', args: { assetId: 'AST-1' }, ok: false },
    ]);
    const declaredLast = [
      { op: 'book', target: 'AST-1', outcome: 'blocked' },
      { op: 'quote', target: 'QT-1', outcome: 'success' },
    ] as Intention[];
    const declaredFirst = [declaredLast[1], declaredLast[0]] as Intention[];
    expect(complete({ did: declaredLast, observed, world })).toBeNull();
    expect(complete({ did: declaredFirst, observed, world })).toBeNull();
  });

  it('a report short by one act is still hiding, whatever the order', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'success' }] as Intention[],
      observed: [
        call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true }),
        call('chargeDeposit', { bookingId: 'BK-1' }, { tookEffect: true }),
      ],
      world: worldWith([
        { name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true },
        { name: 'chargeDeposit', args: { bookingId: 'BK-1' }, tookEffect: true },
      ]),
    };
    expect(complete(ctx)).toContain('chargeDeposit');
  });

  it('carries no fact the world returned — only the tool the agent called and the word for it', () => {
    const ctx = {
      did: [] as Intention[],
      observed: [call('chargeDeposit', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([
        { name: 'chargeDeposit', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'Deposit on BK-1', amount: 4200, receipt: 'rc_88' } },
      ]),
    };
    const reason = complete(ctx) ?? '';
    expect(reason).toContain('chargeDeposit');
    expect(reason).not.toContain('Deposit on BK-1');
    expect(reason).not.toContain('4200');
    expect(reason).not.toContain('rc_88');
  });

  it('a wrong word for the only act is still unaccounted for, and the deny names the right one', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    const reason = complete(ctx) ?? '';
    expect(reason).toContain('Nothing in your report accounts for what createBooking did this turn');
    expect(reason).toContain("Declarable with this turn's evidence: success.");
  });

  it('a non-success claim does not cover an effected write', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as Intention[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('a simulate (tookEffect:false) needs no claim', () => {
    const ctx = {
      did: [] as Intention[],
      observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
    };
    expect(complete(ctx)).toBeNull();
  });

  it("MAPPING LAW — a domain word claim ('settled' → 'success' via the OutcomeMap) covers an effected write, exactly like claimIsGrounded", () => {
    const outcomes: OutcomeMap = { settled: 'success' };
    const ctx = {
      did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] as Intention[],
      observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: true })],
      world: worldWith([{ name: 'refundOrder', args: { orderId: 'ORD-7' }, tookEffect: true, result: { label: 'ORD-7' } }]),
    };
    expect(claimIsComplete({ writeTools: WRITES, outcomes }).check(replyCtx(ctx))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mustAccountFor — polarity is a FIELD, so a not_found claim can never satisfy a success requirement
// ─────────────────────────────────────────────────────────────────────────────
describe('mustAccountFor', () => {
  const covers = (opts: { records: string[]; outcome: 'success' | 'not_found' | 'any' }, did: Intention[]) =>
    mustAccountFor(opts, 'Account for the record you were asked about.').check(replyCtx({ did }));

  it('passes when the target appears with the required outcome', () => {
    expect(covers({ records: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'success' }])).toBeNull();
  });

  it('POLARITY — a not_found claim FAILS a requirement of success', () => {
    expect(covers({ records: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeTruthy();
  });

  it('POLARITY — the same not_found claim PASSES a rubric requiring not_found', () => {
    expect(covers({ records: ['BK-1'], outcome: 'not_found' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it("outcome 'any' passes on any polarity as long as the target appears", () => {
    expect(covers({ records: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it('a NEAR-MISS id does not satisfy the rubric: BK-1 is not covered by a BK-10 claim', () => {
    expect(covers({ records: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-10', outcome: 'success' }])).toBeTruthy();
    expect(covers({ records: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'success' }])).toBeNull();
  });

  it('a missing target is a violation (returns the authored reason)', () => {
    expect(covers({ records: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-2', outcome: 'success' }])).toBe(
      'Account for the record you were asked about.',
    );
  });

  it('every configured target must appear', () => {
    const did: Intention[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    expect(covers({ records: ['BK-1', 'BK-2'], outcome: 'success' }, did)).toBeTruthy();
  });

  describe('mapping law — the same OutcomeMap claimIsGrounded/claimIsComplete use also threads here', () => {
    const outcomes: OutcomeMap = { settled: 'success' };
    const did: Intention[] = [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }];
    const reason = 'Account for the order you were asked about.';

    it("'settled' satisfies a rubric requiring 'success' WITH the map", () => {
      expect(mustAccountFor({ records: ['ORD-7'], outcome: 'success', outcomes }, reason).check(replyCtx({ did }))).toBeNull();
    });

    it("the same 'settled' claim FAILS the same rubric WITHOUT the map (an undeclared word grounds nothing)", () => {
      expect(mustAccountFor({ records: ['ORD-7'], outcome: 'success' }, reason).check(replyCtx({ did }))).toBe(reason);
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

  // ── a status-like KEY must not hide a RECORD ────────────────────────────────────
  // The status-key skip is for a status STRING (`status:'not_found'` is not content). Running it
  // BEFORE the nested-object check would make a found entity returned under one of those key names —
  // `{message:{booking:'BK-1'}}`, the common "envelope" read shape — read as EMPTY, so a `not_found`
  // claim about a record the world DID return would ground. Only a SCALAR/boolean under a status key
  // is skipped; a nested record is content whatever the key is called.
  it('a RECORD under a status-like key is CONTENT, not empty', () => {
    expect(isEmptyReadResult({ message: { booking: 'BK-1' } })).toBe(false);
    expect(isEmptyReadResult({ status: { id: 'BK-1' } })).toBe(false);
    expect(isEmptyReadResult({ state: { id: 'BK-1' }, success: true })).toBe(false);
  });

  it('control: a SCALAR under a status-like key is still not content', () => {
    // …but a status WORD alone is not EVIDENCE of emptiness either — see the next test.
    expect(isEmptyReadResult({ status: 'not_found', found: false })).toBe(true);
    expect(isEmptyReadResult({ message: 'no record found', data: [] })).toBe(true);
  });

  // ── emptiness needs POSITIVE evidence, and a status SENTENCE is not it ──
  // Skipping every scalar status-like field would make a result whose ONLY field is a status sentence
  // read as EMPTY — so `{status:'BK-1 is active and confirmed'}`, a read reporting the record as
  // PRESENT, would ground a `not_found` on it. That is the polarity inversion the structured
  // cross-check exists to kill, reappearing inside the emptiness heuristic. A result with no DATA
  // CHANNEL is undecidable and fails closed; a domain whose empty read has none must return one.
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
