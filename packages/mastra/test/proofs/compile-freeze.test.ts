/**
 * COMPILED-KIT FREEZE AUDIT — replyOnly is decided at beginTurn and holds for the WHOLE turn.
 *
 * compileSpec hands the generate loop to the HOST, which reads instructions() whenever it likes. Under
 * SCG there is ONE terminal (`respond`) — "asked" is a field, not a tool — so the reply-only policy no
 * longer changes the tool SET (activeTools always carries `respond`); it rides the PROMPT alone
 * (terminalProtocol(replyOnly) swaps in the "NEVER ask a question" prose). If controls.terminal(world)
 * were re-evaluated per read, a world mutation mid-turn would flip the prompt's stance mid-turn. The
 * documented contract is per-turn ("The tools active THIS turn"); this proof pins the code to it.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { compileSpec } from '../../src/compile.js';

/** A phrase present ONLY in the reply-only terminal protocol prose (the normal protocol invites an `ask` intention). */
const REPLY_ONLY_MARKER = 'NEVER ask the user a question';

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
  it('a mid-turn flip changes NOTHING: the prompt holds the beginTurn value (tools always carry respond)', () => {
    let locked = false;
    const g = compiled(() => locked);
    g.beginTurn();

    expect(g.activeTools()).toContain('respond');
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER);

    // The world "mutates" between the host's reads — the exact diagram shape.
    locked = true;

    expect(g.activeTools()).toContain('respond'); // the tool set never encodes the policy now
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER); // frozen: still the beginTurn stance
  });

  it('the NEXT beginTurn re-evaluates the policy — and the prompt stays coherent both ways', () => {
    let locked = false;
    const g = compiled(() => locked);
    g.beginTurn();
    locked = true;

    g.beginTurn();
    expect(g.activeTools()).toContain('respond');
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER);

    // Flip back mid-turn: still frozen on the reply-only side.
    locked = false;
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER);

    g.beginTurn();
    expect(g.instructions()).not.toContain(REPLY_ONLY_MARKER);
  });

  it('reads BEFORE the first beginTurn see the creation-time policy', () => {
    let locked = true;
    const g = compiled(() => locked);
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER);
    locked = false;
    expect(g.instructions()).toContain(REPLY_ONLY_MARKER); // frozen at creation until the first beginTurn
  });
});
