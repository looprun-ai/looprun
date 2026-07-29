/**
 * THE MIRROR PIN — `LoopRunResultMeta` is declared TWICE on purpose, so it is checked as one.
 *
 * `LoopRunResultMeta` is internal to `@looprun-ai/mastra` (symbol inventory §7.2) and that package
 * has no `/internal` subpath, so this server declares the shape it reads (`packages/server/src/
 * types.ts`) instead of importing it. That removed a compile-time tripwire: before the split, a
 * renamed field in mastra broke this package's build at `envelopeMeta`; a duplicated shape would let
 * the rename compile clean and the envelope would silently emit `undefined`.
 *
 * This file restores the tripwire. Tests are exempt from the surface contract, so it may deep-import
 * mastra's declaration; the assertion is MUTUAL assignability, which fails on a renamed field, a
 * changed field type, or a field added on either side. It is enforced by `pnpm typecheck`
 * (`tsc --noEmit` covers `test/**`), not by the runtime run — the `it()` below only proves the
 * sample used for the check is total.
 *
 * The deep import is type-only, so nothing crosses the package boundary at runtime, and
 * `tsconfig.build.json` excludes `test/`, so it never reaches the published build.
 */
import { describe, expect, it } from 'vitest';
import type { LoopRunResultMeta as MastraMeta } from '../../mastra/src/agent.js';
import type { LoopRunResultMeta as ServerMeta } from '../src/types.js';

// Both directions: either one alone would accept a shape that merely EXTENDS the other.
const _mastraIsAServerMeta: ServerMeta = {} as MastraMeta;
const _serverIsAMastraMeta: MastraMeta = {} as ServerMeta;
void _mastraIsAServerMeta;
void _serverIsAMastraMeta;

describe('LoopRunResultMeta mirror (server ↔ mastra)', () => {
  it('the two declarations agree field-for-field', () => {
    // Typed as the INTERSECTION: a field added on either side makes this literal incomplete and
    // `tsc --noEmit` fails; excess-property checking catches a field removed from both.
    const sample: MastraMeta & ServerMeta = {
      sessionId: 's', turnIndex: 0, corrections: [], exhausted: false, violations: [], observed: [],
    };
    expect(Object.keys(sample).sort()).toEqual([
      'corrections', 'exhausted', 'observed', 'sessionId', 'turnIndex', 'violations',
    ]);
  });
});
