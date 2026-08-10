/**
 * THE DISCLOSURE-SLOT LAYER — a slot naming a field no result ever carries is an authoring error,
 * caught offline; a field that exists and is empty on one record is a data condition, and passes.
 */
import { describe, it, expect } from 'vitest';
import { checkDisclosureSlots } from '../src/validate.js';
import type { Subject } from '../src/subject.js';
import type { AgentWorld } from '@looprun-ai/core';

const ASSETS: Record<string, { id: string; name: string; settlement: number | null }> = {
  ast_1: { id: 'ast_1', name: 'Light Tower', settlement: 200 },
  ast_2: { id: 'ast_2', name: 'Generator', settlement: null },
};

function makeWorld(): AgentWorld {
  return {
    exec(name: string, args: Record<string, unknown>) {
      if (name !== 'getAsset') return { error: 'UNKNOWN_TOOL' };
      const asset = ASSETS[String(args.assetId ?? '')];
      return asset ? { asset } : { error: 'NOT_FOUND' };
    },
    advanceTurn() {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
    projection: () => ({ assets: Object.values(ASSETS).map((a) => ({ id: a.id, name: a.name })) }),
  } as unknown as AgentWorld;
}

const subjectWith = (before: Record<string, string>): Subject =>
  ({
    dir: '/toy',
    specs: { fleet: { id: 'fleet', surface: { tools: ['getAsset', 'retireAsset'] } } },
    contract: { voice: '', stateBlock: () => '', coreInvariants: [], languageClause: '',
      disclose: Object.fromEntries(Object.entries(before).map(([tool, text]) => [tool, { before: text }])) },
    caseAgent: {},
    cases: [{ id: 'c1', turns: [{ userText: 'hi' }] }],
    toolDefs: [
      { name: 'getAsset', description: '', inputSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] } },
      { name: 'retireAsset', description: '', inputSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] } },
    ],
    makeWorld,
  }) as unknown as Subject;

describe('checkDisclosureSlots', () => {
  it('passes a slot that resolves on a seeded record', () => {
    expect(checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) is final.' }))).toEqual([]);
  });

  it('passes a field that exists but is empty on one record', () => {
    expect(checkDisclosureSlots(subjectWith({ retireAsset: 'Settlement: {getAsset.asset.settlement}' }))).toEqual([]);
  });

  it('fails a path no result ever carries, and names the fields the results do carry', () => {
    const issues = checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getAsset.asset.serial} is final.' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('retireAsset');
    expect(issues[0]).toContain('{getAsset.asset.serial}');
    expect(issues[0]).toContain('asset.name');
  });

  it('fails a slot whose read tool is on no lane carrying the disclosed tool', () => {
    const issues = checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getInvoice.invoice.id} is final.' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('getInvoice');
  });

  it('fails a slot that walks no path — a record is not a value', () => {
    const issues = checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getAsset} is final.' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('walks no path');
  });

  it('is silent when the contract declares no disclosure', () => {
    expect(checkDisclosureSlots(subjectWith({}))).toEqual([]);
  });
});
