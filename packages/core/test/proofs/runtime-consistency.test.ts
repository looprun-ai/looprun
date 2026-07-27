/**
 * RUNTIME CONSISTENCY — the spec layer refuses incoherent wiring, loudly and at authoring time.
 *
 * Three families, all decided without a model:
 *
 *  · hook × dim — a guard reads a specific slice of `GuardCtx`. Installing one on a hook that never
 *    populates that slice yields a check that silently never fires; the install throws instead.
 *  · confirmMechanism keys are validated against `destructiveTools`, so a typo or a renamed tool
 *    cannot quietly disarm a destructive-safety protocol.
 *  · a guard that THROWS is an AUTHOR BUG: it surfaces as an attributed error naming the binding,
 *    the kind and the hook — never swallowed, never converted into a deny.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, GuardExecutionError, custom, emptyReply, precondition, renderScopedSpecTrunk, resolveGuards, resultInvariant } from '../../src/index.js';
import type { Dim, Guard } from '../../src/index.js';
import { craftCtx, FIXTURE_DOMAIN, FIXTURE_TOOL_NAMES, FixtureWorld } from '../../src/testing/index.js';

const baseCfg = () => ({
  id: 'consistency-proof',
  mode: 'PROOF',
  persona: 'You are the proof agent.',
  tools: [...FIXTURE_TOOL_NAMES],
  contract: FIXTURE_DOMAIN,
});

const spec = () => new AgentSpecBase(baseCfg() as never);

describe('hook x dim install matrix', () => {
  it('refuses a guard whose ctx slice the hook never populates', () => {
    // A result invariant reads ctx.result — onReply and onInput have none.
    expect(() => spec().addReplyCheck(resultInvariant(() => false, 'result must be ok'))).toThrow(/cannot be installed on 'onReply'/);
    expect(() => spec().addGuard('onInput', 'any', resultInvariant(() => false, 'nope'))).toThrow(/ctx\.result/);
    // A precondition decides a pending CALL — there is none at reply time.
    expect(() => spec().addReplyCheck(precondition(() => false, 'denied', 'the condition'))).toThrow(/cannot be installed on 'onReply'/);
    // A reply check reads ctx.reply — preTool, postTool and onInput have none.
    expect(() => spec().addGuard('postTool', ['createItem'], emptyReply())).toThrow(/ctx\.reply/);
    expect(() => spec().addGuard('onInput', 'any', emptyReply())).toThrow(/ctx\.reply/);
    expect(() => spec().addGuard('preTool', ['createItem'], emptyReply())).toThrow(/cannot be installed on 'preTool'/);
  });

  it('refuses an unknown dim', () => {
    expect(() => spec().addReplyCheck(custom({ kind: 'x', dim: 'llm' as unknown as Dim, check: () => null, prose: () => '' }))).toThrow(/unknown dim 'llm'/);
  });

  it('accepts every legal combination', () => {
    expect(() => spec().addGuard('preTool', ['createItem'], precondition(() => true, 'denied', 'the condition'))).not.toThrow();
    expect(() => spec().addGuard('postTool', ['createItem'], resultInvariant(() => true, 'result must be ok'))).not.toThrow();
    expect(() => spec().addReplyCheck(emptyReply())).not.toThrow();
  });
});

describe('confirmMechanism keys are validated against destructiveTools', () => {
  const withMech = (over: Record<string, unknown>) => () => new AgentSpecBase({ ...baseCfg(), ...over } as never);

  it('rejects a key that is not a destructive tool', () => {
    expect(withMech({ destructiveTools: ['deleteItem'], confirmMechanism: { deleteitem: 'prior-ask' } })).toThrow(/confirmMechanism names tool\(s\) that are not in destructiveTools/);
    expect(withMech({ confirmMechanism: { deleteItem: 'prior-ask' } })).toThrow(/not in destructiveTools/);
  });

  it('accepts a correctly keyed mechanism', () => {
    expect(withMech({ destructiveTools: ['deleteItem'], confirmMechanism: { deleteItem: 'prior-ask' } })).not.toThrow();
  });
});

describe('a guard that throws is an author bug', () => {
  const boom = (where: 'check' | 'prose'): Guard =>
    custom({
      kind: where === 'check' ? 'boomGuard' : 'boomProse',
      dim: 'run',
      check: () => {
        if (where === 'check') throw new Error('kaboom');
        return null;
      },
      prose: () => {
        if (where === 'prose') throw new Error('kaboom');
        return 'ok';
      },
    });

  it('attributes a throw in check() to its binding, kind and hook', async () => {
    const s = spec();
    s.addGuard('preTool', ['createItem'], boom('check'), { id: 'agent:boom' });
    const g = resolveGuards(s.guards.preTool, 'createItem').find((x) => x.kind === 'boomGuard')!;
    await expect(async () => g.check(craftCtx({ tool: 'createItem' }))).rejects.toThrow(GuardExecutionError);
    await expect(async () => g.check(craftCtx({ tool: 'createItem' }))).rejects.toThrow(
      /Guard "agent:boom" \(kind boomGuard, hook preTool \(tool "createItem"\)\) THREW in check\(\)/,
    );
  });

  it('attributes a throw in prose() at render time', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem'], boom('prose'), { id: 'agent:boomProse' });
    expect(() => renderScopedSpecTrunk(new FixtureWorld(), s, [], FIXTURE_DOMAIN)).toThrow(
      /Guard "agent:boomProse" \(kind boomProse, hook preTool\) THREW in prose\(\)/,
    );
  });
});
