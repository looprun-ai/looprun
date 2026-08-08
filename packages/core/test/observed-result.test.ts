/**
 * THE OBSERVED ROW CARRIES THE RESULT — written by the one hook that receives a tool's output whether
 * a world executed the call or the tool executed itself.
 */
import { describe, it, expect } from 'vitest';
import { createActionHistory, recordToolResult } from '../src/runtime/action-history.js';

describe('recordToolResult', () => {
  it("stores a successful call's result on the observed row", () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'ast_1' }, { asset: { id: 'ast_1', name: 'Light Tower' } });
    expect(actionHistory.observed[0].result).toEqual({ asset: { id: 'ast_1', name: 'Light Tower' } });
  });

  it('stores the result with NO world — a self-executing tool records the same row', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'ast_1' }, { asset: { id: 'ast_1' } });
    expect(actionHistory.observed[0].result).toEqual({ asset: { id: 'ast_1' } });
    expect(actionHistory.observed[0].tookEffect).toBeUndefined();
  });

  it('omits the result on a FAILED call — a refusal grounds nothing', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'nope' }, { error: 'NOT_FOUND' });
    expect(actionHistory.observed[0].ok).toBe(false);
    expect('result' in actionHistory.observed[0]).toBe(false);
  });
});
