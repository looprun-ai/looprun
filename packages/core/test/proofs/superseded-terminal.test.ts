/**
 * SUPERSEDED TERMINALS — emitted in a step, never delivered to the user.
 *
 * The runtime delivers the LAST non-empty `respond` message, while the guard hooks record EVERY
 * terminal as an ok observation. A step of two `respond` calls — one asking "Delete X?"
 * (`asked:true`) and one signing off — therefore delivers only the sign-off and still leaves the ok
 * asking `respond` in the ledger — which a prior-ask confirmation arm reads as "the user was asked",
 * unlocking a destructive action off a question the user never saw.
 *
 * This file also pins the boundary with `prematureTerminalTools`: the two answer different questions
 * and must not be collapsed into one. `prematureTerminalTools` asks "did a terminal ride along with
 * DOMAIN work?"; `supersededTerminalCalls` asks "which terminals lost the delivery contest?".
 */
import { describe, expect, it } from 'vitest';
import { prematureTerminalTools, supersededTerminalCalls } from '../../src/runtime/terminal.js';

/** One model step carrying the given `[toolName, args]` calls. */
const step = (...calls: Array<[string, Record<string, unknown>]>) => ({
  toolCalls: calls.map(([toolName, args]) => ({ toolName, args })),
});

describe('supersededTerminalCalls', () => {
  it('leaves a lone terminal alone', () => {
    expect(supersededTerminalCalls([step(['respond', { message: 'done', did: [] }])])).toEqual([]);
  });

  it('returns the terminal that lost the delivery contest, with its args', () => {
    const out = supersededTerminalCalls([
      step(['respond', { message: 'Delete record r_1?', did: [{ op: 'ask' }] }], ['respond', { message: 'Have a nice day.', did: [] }]),
    ]);
    // Both are `respond` now — the loser is identified by its message, not its name.
    expect(out.map((o) => o.name)).toEqual(['respond']);
    // The args ride along so the caller can match the exact ledger entry to prune.
    expect(out[0]?.args.message).toBe('Delete record r_1?');
    expect(out[0]?.args.did).toEqual([{ op: 'ask' }]);
  });

  it('never lets a whitespace-only terminal win delivery', () => {
    const out = supersededTerminalCalls([
      step(['respond', { message: 'the real answer', did: [] }], ['respond', { message: '   ', did: [] }]),
    ]);
    expect(out.map((o) => o.args.message)).toEqual(['   ']);
  });

  it('reads the chunk-shaped spelling a finished step uses', () => {
    const out = supersededTerminalCalls([
      {
        toolCalls: [
          { type: 'tool-call', payload: { toolName: 'respond', args: { message: 'Delete record r_1?', did: [{ op: 'ask' }] } } },
          { type: 'tool-call', payload: { toolName: 'respond', args: { message: 'Have a nice day.', did: [] } } },
        ],
      },
    ]);
    expect(out.map((o) => o.args.message)).toEqual(['Delete record r_1?']);
  });

  it('stays distinct from the premature-terminal gate', () => {
    // Two terminals, no domain work: superseded fires, premature does NOT.
    const twoTerminals = [step(['respond', { message: 'q?', did: [{ op: 'ask' }] }], ['respond', { message: 'a', did: [] }])];
    expect(prematureTerminalTools(twoTerminals)).toEqual([]);
    expect(supersededTerminalCalls(twoTerminals).map((o) => o.args.message)).toEqual(['q?']);

    // Domain work + one terminal: premature fires either order, superseded does NOT.
    for (const mixed of [
      [step(['deleteItem', { id: 'r_1' }], ['respond', { message: 'a', did: [] }])],
      [step(['respond', { message: 'a', did: [] }], ['deleteItem', { id: 'r_1' }])],
    ]) {
      expect(prematureTerminalTools(mixed)).toEqual(['deleteItem']);
      expect(supersededTerminalCalls(mixed)).toEqual([]);
    }
  });
});
