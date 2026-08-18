import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CardError } from '@looprun-ai/next-core';
import { SubjectLoader } from '../src/subject-loader.js';

const MINI = join(fileURLToPath(import.meta.url), '../fixtures/mini-subject');

test('load returns the whole subject: specs, contract, world, presets, cases, targets', async () => {
  const subject = await SubjectLoader.load(MINI);
  expect(Object.keys(subject.specs)).toEqual(['concierge']);
  expect(subject.contract?.name).toBe('minihotel');
  expect('card' in subject.world && Object.keys(subject.world.card.records)).toEqual(['bookings']);
  expect(subject.presets).toEqual([undefined, 'quiet']);
  expect(subject.cases.map(c => c.id)).toEqual(['mini-01', 'mini-02']);
  expect(subject.targets[0].target.id).toBe('gemini-3.1-flash-lite');
});

test('the prompt is byte-identical across EVERY preset', async () => {
  const subject = await SubjectLoader.load(MINI);
  const prints = SubjectLoader.promptProof(subject);
  expect(prints.size).toBe(1);                       // one fingerprint, every preset
});

test('structural preflight aggregates loud problems', async () => {
  const dir = join(fileURLToPath(import.meta.url), '../fixtures/broken-subject');
  const failed = await SubjectLoader.load(dir).catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(CardError);
  const codes = (failed as CardError).problems.map(p => p.code);
  expect(codes).toContain('SUBJECT_CASE_AGENT_UNKNOWN');
  expect(codes).toContain('SUBJECT_CASE_DUPLICATE');
});

test('provenance names every next package with its resolved build', () => {
  const build = SubjectLoader.provenance();
  expect(Object.keys(build)).toContain('@looprun-ai/next-core');
  expect(Object.values(build).every(v => v.length > 0)).toBe(true);
});
