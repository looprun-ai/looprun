/**
 * Proof — structural introspection metadata (`Guard.meta`).
 *
 * The eval lint's order-cycle and unsat-pair checks read `meta.before` / `meta.requiredStrings`
 * instead of re-encoding the kinds' internals. Two laws are proven here:
 *   1. the three kinds attach the exact params they were constructed with;
 *   2. `meta` SURVIVES the spec's attribution wrapper (AgentSpecBase.addGuard wraps every guard in
 *      attributeGuard, which returns a plain object — if it dropped `meta`, every spec-installed
 *      guard would read as introspection-free and the lint would silently check nothing).
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, replyConfirmsLabels, replyMustMention, requiresBefore } from '../../src/index.js';

describe('guard meta introspection', () => {
  it('requiresBefore attaches meta.before; reply kinds attach meta.requiredStrings', () => {
    expect(requiresBefore(['a', 'b']).meta).toEqual({ before: ['a', 'b'] });
    expect(replyMustMention(['x', 'y'], 'r').meta).toEqual({ requiredStrings: ['x', 'y'] });
    expect(replyConfirmsLabels(['L-1'], 'r').meta).toEqual({ requiredStrings: ['L-1'] });
  });

  it('meta survives the attributeGuard wrapper installed by AgentSpecBase.addGuard', () => {
    const spec = new AgentSpecBase({ id: 's', mode: 'M', persona: 'You are s.', tools: ['t1', 't2'] });
    spec.addGuard('preTool', ['t2'], requiresBefore(['t1']), { id: 'agent:order' });
    spec.addReplyCheck(replyConfirmsLabels(['L-9'], 'name it'), { id: 'agent:labels' });
    const pre = spec.guards.preTool.find((b) => b.id === 'agent:order')!;
    const rep = spec.guards.onReply.find((b) => b.id === 'agent:labels')!;
    expect(pre.guard.meta?.before).toEqual(['t1']);
    expect(rep.guard.meta?.requiredStrings).toEqual(['L-9']);
  });
});
