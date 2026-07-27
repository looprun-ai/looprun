/**
 * SUPERSEDED TERMINALS — emitted in a step, never delivered to the user.
 *
 * The runtime delivers the LAST non-empty terminal text, while the guard hooks record EVERY terminal
 * as an ok observation. A step of `askUser("Delete X?") + replyToUser("Have a nice day.")` therefore
 * delivers only the pleasantry and still leaves an ok `askUser` in the ledger — which a prior-ask
 * confirmation arm reads as "the user was asked", unlocking a destructive action off a question the
 * user never saw.
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
    expect(supersededTerminalCalls([step(['replyToUser', { text: 'done' }])])).toEqual([]);
  });

  it('returns the terminal that lost the delivery contest, with its args', () => {
    const out = supersededTerminalCalls([
      step(['askUser', { text: 'Delete record r_1?' }], ['replyToUser', { text: 'Have a nice day.' }]),
    ]);
    expect(out.map((o) => o.name)).toEqual(['askUser']);
    // The args ride along so the caller can match the exact ledger entry to prune.
    expect(out[0]?.args.text).toBe('Delete record r_1?');
  });

  it('never lets a whitespace-only terminal win delivery', () => {
    const out = supersededTerminalCalls([
      step(['replyToUser', { text: 'the real answer' }], ['replyToUser', { text: '   ' }]),
    ]);
    expect(out.map((o) => o.args.text)).toEqual(['   ']);
  });

  it('reads the chunk-shaped spelling a finished step uses', () => {
    const out = supersededTerminalCalls([
      {
        toolCalls: [
          { type: 'tool-call', payload: { toolName: 'askUser', args: { text: 'Delete record r_1?' } } },
          { type: 'tool-call', payload: { toolName: 'replyToUser', args: { text: 'Have a nice day.' } } },
        ],
      },
    ]);
    expect(out.map((o) => o.name)).toEqual(['askUser']);
  });

  it('stays distinct from the premature-terminal gate', () => {
    // Two terminals, no domain work: superseded fires, premature does NOT.
    const twoTerminals = [step(['askUser', { text: 'q?' }], ['replyToUser', { text: 'a' }])];
    expect(prematureTerminalTools(twoTerminals)).toEqual([]);
    expect(supersededTerminalCalls(twoTerminals).map((o) => o.name)).toEqual(['askUser']);

    // Domain work + one terminal: premature fires either order, superseded does NOT.
    for (const mixed of [
      [step(['deleteItem', { id: 'r_1' }], ['replyToUser', { text: 'a' }])],
      [step(['replyToUser', { text: 'a' }], ['deleteItem', { id: 'r_1' }])],
    ]) {
      expect(prematureTerminalTools(mixed)).toEqual(['deleteItem']);
      expect(supersededTerminalCalls(mixed)).toEqual([]);
    }
  });
});
