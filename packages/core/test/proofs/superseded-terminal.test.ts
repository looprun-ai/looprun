/**
 * UNDELIVERED TERMINALS — emitted in a step, never seen by the user.
 *
 * The runtime delivers the LAST non-empty `respond` message, while the guard hooks record EVERY
 * terminal as an ok observation. A step of two `respond` calls — one asking "Delete X?" (an `ask`
 * intention in its `did`) and one signing off — therefore delivers only the sign-off and still leaves
 * the ok asking `respond` in the ledger — which a prior-ask confirmation arm reads as "the user was
 * asked", unlocking a destructive action off a question the user never saw.
 *
 * TWO paths produce such a ghost, and each has its own detector:
 *   · the DELIVERY CONTEST (≥2 terminals in one step)      → `supersededTerminalCalls`
 *   · the PREMATURE step (a terminal beside DOMAIN work)   → `prematureTerminalCalls` (MI-T2 / M8)
 * `prematureTerminalTools` answers a third question — "which domain tools rode along?" — used to
 * INVALIDATE the delivery. The three must not be collapsed into one; this file pins the boundaries,
 * and that BOTH ghost paths end at the same ledger prune.
 */
import { describe, expect, it } from 'vitest';
import { prematureTerminalCalls, prematureTerminalTools, supersededTerminalCalls } from '../../src/runtime/terminal.js';
import { createLedger, pruneSupersededTerminals, recordTerminalCall } from '../../src/runtime/ledger.js';

/** DELIVERY = the last terminal the runtime would ACCEPT (`terminalPayloadRejection`), not merely the
 *  last with a non-empty message (red-team r2/C5). Every fixture below therefore carries a
 *  schema-legal `did` (non-empty) unless it is deliberately proving the refused shape. */
/** One model step carrying the given `[toolName, args]` calls. */
const step = (...calls: Array<[string, Record<string, unknown>]>) => ({
  toolCalls: calls.map(([toolName, args]) => ({ toolName, args })),
});

describe('supersededTerminalCalls', () => {
  it('leaves a lone terminal alone', () => {
    expect(supersededTerminalCalls([step(['respond', { message: 'done', did: [{ op: 'inform' }] }])])).toEqual([]);
  });

  it('returns the terminal that lost the delivery contest, with its args', () => {
    const out = supersededTerminalCalls([
      step(['respond', { message: 'Delete record r_1?', did: [{ op: 'ask' }] }], ['respond', { message: 'Have a nice day.', did: [{ op: 'greet' }] }]),
    ]);
    // Both are `respond` now — the loser is identified by its message, not its name.
    expect(out.map((o) => o.name)).toEqual(['respond']);
    // The args ride along so the caller can match the exact ledger entry to prune.
    expect(out[0]?.args.message).toBe('Delete record r_1?');
    expect(out[0]?.args.did).toEqual([{ op: 'ask' }]);
  });

  it('never lets a whitespace-only terminal win delivery', () => {
    const out = supersededTerminalCalls([
      step(['respond', { message: 'the real answer', did: [{ op: 'inform' }] }], ['respond', { message: '   ', did: [{ op: 'inform' }] }]),
    ]);
    expect(out.map((o) => o.args.message)).toEqual(['   ']);
  });

  it('reads the chunk-shaped spelling a finished step uses', () => {
    const out = supersededTerminalCalls([
      {
        toolCalls: [
          { type: 'tool-call', payload: { toolName: 'respond', args: { message: 'Delete record r_1?', did: [{ op: 'ask' }] } } },
          { type: 'tool-call', payload: { toolName: 'respond', args: { message: 'Have a nice day.', did: [{ op: 'greet' }] } } },
        ],
      },
    ]);
    expect(out.map((o) => o.args.message)).toEqual(['Delete record r_1?']);
  });

  it('a REFUSED last terminal never wins delivery — the accepted earlier one is kept (r2/C5)', () => {
    // The runtime rejects a `did`-less respond before it executes, so it is not what the user received.
    // The old notion ("last non-empty message wins") classified it as delivered and pruned the entry for
    // the message the user ACTUALLY got.
    const emptyDid = supersededTerminalCalls([
      step(['respond', { message: 'Done — record r_1 removed.', did: [{ op: 'delete', target: 'r_1', outcome: 'success' }] }],
           ['respond', { message: 'Are you sure?', did: [] }]),
    ]);
    expect(emptyDid.map((o) => o.args.message)).toEqual(['Are you sure?']);
    // Same for a zero-width message the schema's minLength accepts but the delivery floor does not.
    const invisible = supersededTerminalCalls([
      step(['respond', { message: 'the real answer', did: [{ op: 'inform' }] }],
           ['respond', { message: '\u200b\u3164', did: [{ op: 'inform' }] }]),
    ]);
    expect(invisible.map((o) => o.args.message)).toEqual(['\u200b\u3164']);
    // And when NO terminal in the step is acceptable, none of them was delivered — all are pruned.
    const allRefused = supersededTerminalCalls([
      step(['respond', { message: '', did: [{ op: 'ask' }] }], ['respond', { message: 'a', did: [] }]),
    ]);
    expect(allRefused).toHaveLength(2);
  });

  it('stays distinct from the premature-terminal gate', () => {
    // Two terminals, no domain work: superseded fires, premature does NOT.
    const twoTerminals = [step(['respond', { message: 'q?', did: [{ op: 'ask' }] }], ['respond', { message: 'a', did: [{ op: 'inform' }] }])];
    expect(prematureTerminalTools(twoTerminals)).toEqual([]);
    expect(supersededTerminalCalls(twoTerminals).map((o) => o.args.message)).toEqual(['q?']);

    // Domain work + one terminal: premature fires either order, superseded does NOT.
    for (const mixed of [
      [step(['deleteItem', { id: 'r_1' }], ['respond', { message: 'a', did: [{ op: 'inform' }] }])],
      [step(['respond', { message: 'a', did: [{ op: 'inform' }] }], ['deleteItem', { id: 'r_1' }])],
    ]) {
      expect(prematureTerminalTools(mixed)).toEqual(['deleteItem']);
      expect(supersededTerminalCalls(mixed)).toEqual([]);
    }
  });
});

// ── The PREMATURE ghost (red-team M8) ─────────────────────────────────────────────────────────────
// `supersededTerminalCalls` returns [] for a `[domainCall, respond]` step (only ONE terminal, so there
// is no delivery contest), yet that respond is invalidated by the premature policy and never reaches
// the user. Before MI-T2 nothing removed its `observed` entry, so a `did:[{op:'ask'}]` respond read as
// consent obtained — in THIS turn (pendingConfirmMustAsk) and in every later one (confirmFirst /
// askedEarlier), since `observed` is conversation-wide.
describe('prematureTerminalCalls', () => {
  it('returns the terminal that shared its step with domain work, with its args', () => {
    const out = prematureTerminalCalls([
      step(['deleteAcct', { id: 'X' }], ['respond', { message: 'Delete account X?', did: [{ op: 'ask' }] }]),
    ]);
    expect(out.map((o) => o.name)).toEqual(['respond']);
    expect(out[0]?.args.message).toBe('Delete account X?');
    expect(out[0]?.args.did).toEqual([{ op: 'ask' }]);
  });

  it('leaves a TERMINAL-ONLY step alone (that is the delivery contest, not the premature path)', () => {
    expect(prematureTerminalCalls([step(['respond', { message: 'done', did: [{ op: 'inform' }] }])])).toEqual([]);
    expect(
      prematureTerminalCalls([step(['respond', { message: 'q?', did: [{ op: 'ask' }] }], ['respond', { message: 'a', did: [{ op: 'inform' }] }])]),
    ).toEqual([]);
  });

  it('reads the chunk-shaped spelling a finished step uses', () => {
    const out = prematureTerminalCalls([
      {
        toolCalls: [
          { type: 'tool-call', payload: { toolName: 'deleteAcct', args: { id: 'X' } } },
          { type: 'tool-call', payload: { toolName: 'respond', args: { message: 'Delete account X?', did: [{ op: 'ask' }] } } },
        ],
      },
    ]);
    expect(out.map((o) => o.args.message)).toEqual(['Delete account X?']);
  });

  it('THE M8 CLOSURE: the premature ask leaves NO ghost in observed after the prune', () => {
    const steps = [step(['deleteAcct', { id: 'X' }], ['respond', { message: 'Delete account X?', did: [{ op: 'ask' }] }])];
    const ledger = createLedger();
    // What the backend's hook-time record leaves behind (the ask is visible to same-step siblings).
    recordTerminalCall(ledger, 'respond', { message: 'Delete account X?', did: [{ op: 'ask' }] });
    expect(ledger.observed).toHaveLength(1);
    const pruned = pruneSupersededTerminals(ledger, prematureTerminalCalls(steps));
    expect(pruned).toEqual(['respond']);
    expect(ledger.observed).toEqual([]);
  });
});
