/**
 * COMPILED-KIT FREEZE AUDIT — replyOnly is decided at beginTurn and holds for the WHOLE turn.
 *
 * compileSpec hands the generate loop to the HOST, which reads instructions() and activeTools()
 * whenever it likes. Both derive from controls.terminal(world); if that predicate is re-evaluated
 * per read, a world mutation mid-turn makes prompt and tools DISAGREE — the prompt offers askUser
 * while the list has dropped it (or vice-versa), the same trap shape as the world-seam
 * UNKNOWN_TOOL loop: the deny says "close the turn" and the closing tool is gone. The documented
 * contract is per-turn ("The tools active THIS turn"); this proof pins the code to it.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { compileSpec } from '../../src/compile.js';

const REPLY_ONLY_MARKER = 'there is no ask tool';

function compiled(terminal: () => boolean) {
  const spec = new AgentSpecBase({
    id: 'compile-freeze-audit',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    contract: FIXTURE_DOMAIN,
    terminal,
  } as never);
  return compileSpec(spec, { world: new FixtureWorld(), toolDefs: [...FIXTURE_TOOL_DEFS], contract: FIXTURE_DOMAIN });
}

describe('compiled kit freezes replyOnly per turn', () => {
  it('a mid-turn flip changes NOTHING: prompt and tools both hold the beginTurn value', () => {
    let locked = false;
    const g = compiled(() => locked);
    g.beginTurn();

    expect(g.activeTools()).toContain('askUser');
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER);

    // The world "mutates" between the host's reads — the exact diagram shape.
    locked = true;

    expect(g.activeTools()).toContain('askUser');
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER);
  });

  it('the NEXT beginTurn re-evaluates the policy — and prompt×tools stay coherent both ways', () => {
    let locked = false;
    const g = compiled(() => locked);
    g.beginTurn();
    locked = true;

    g.beginTurn();
    expect(g.activeTools()).not.toContain('askUser');
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER);

    // Flip back mid-turn: still frozen on the reply-only side.
    locked = false;
    expect(g.activeTools()).not.toContain('askUser');
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER);

    g.beginTurn();
    expect(g.activeTools()).toContain('askUser');
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER);
  });

  it('reads BEFORE the first beginTurn see the creation-time policy', () => {
    let locked = true;
    const g = compiled(() => locked);
    expect(g.activeTools()).not.toContain('askUser');
    locked = false;
    expect(g.activeTools()).not.toContain('askUser');
  });
});
