/**
 * B4 (bankdesk 2026-07-23) — deterministic proof for `AgentSpecBase.assertDestructiveConfirmable`.
 *
 * A destructiveTool left on the DEFAULT 'arg' confirm mechanism but WITHOUT the confirm flag in its
 * schema makes the auto-installed confirmFirst a permanent no-op AND renders a "confirm first, act in a
 * later turn" ritual the tool can never honour → the model asks forever (measured: freezeAccount, one-step
 * schema, in destructiveTools; N6-1 caught it only by READING the rendered trunk). The schema is known
 * only where toolDefs are injected, so the cross-check runs at run start (the backend run entry) and throws.
 *
 * Fixtures: `deleteItem` declares `confirmed` (a valid arg-mechanism destructive tool); `purgeAll` and
 * `updateItem` do NOT (`purgeAll` is meant for the 'prior-ask' mechanism, `updateItem` is not destructive
 * at all — the two flag-less shapes the gate must reject when mis-listed as 'arg' destructive).
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import { FIXTURE_TOOL_DEFS, FIXTURE_LEXICON, FIXTURE_TOOL_NAMES } from '../../src/testing/fixture-world.js';

function spec(cfg: { destructiveTools?: string[]; confirmMechanism?: Record<string, 'arg' | 'prior-ask'> }): AgentSpecBase {
  return new AgentSpecBase({
    id: 'proof-b4',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    lexicon: { falseFailureClaimRe: FIXTURE_LEXICON.falseFailureClaimRe },
    ...cfg,
  });
}

describe('B4 · assertDestructiveConfirmable — an arg-mechanism destructive tool must carry its confirm flag', () => {
  it('PASSES: deleteItem declares `confirmed` in its schema', () => {
    expect(() => spec({ destructiveTools: ['deleteItem'] }).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS)).not.toThrow();
  });

  it('THROWS: purgeAll on the default `arg` mechanism has no `confirmed` flag', () => {
    expect(() => spec({ destructiveTools: ['purgeAll'] }).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS)).toThrow(/purgeAll/);
  });

  it('THROWS: a non-destructive-shaped tool (updateItem) mis-listed as arg-destructive with no flag', () => {
    expect(() => spec({ destructiveTools: ['updateItem'] }).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS)).toThrow(
      /must declare a 'confirmed' flag/,
    );
  });

  it('EXEMPT: purgeAll on the `prior-ask` mechanism (a zero-arg confirm) is not required to carry a flag', () => {
    expect(() =>
      spec({ destructiveTools: ['purgeAll'], confirmMechanism: { purgeAll: 'prior-ask' } }).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS),
    ).not.toThrow();
  });

  it('MIXED: deleteItem (arg, ok) + purgeAll (prior-ask, exempt) together pass; the message names ONLY the broken tool', () => {
    // deleteItem arg-ok, purgeAll prior-ask exempt → clean.
    expect(() =>
      spec({ destructiveTools: ['deleteItem', 'purgeAll'], confirmMechanism: { purgeAll: 'prior-ask' } }).assertDestructiveConfirmable(
        FIXTURE_TOOL_DEFS,
      ),
    ).not.toThrow();
    // Flip purgeAll back to the default arg mechanism → only purgeAll is named.
    try {
      spec({ destructiveTools: ['deleteItem', 'purgeAll'] }).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS);
      throw new Error('expected a throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('purgeAll');
      expect(msg).not.toContain('deleteItem');
    }
  });

  it('no destructiveTools → a no-op (every non-destructive spec is clean)', () => {
    expect(() => spec({}).assertDestructiveConfirmable(FIXTURE_TOOL_DEFS)).not.toThrow();
  });
});
