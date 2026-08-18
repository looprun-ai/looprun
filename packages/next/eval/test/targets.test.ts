import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTargets } from '../src/targets.js';

function targetsFile(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'targets-'));
  const path = join(dir, 'targets.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

test('every serving fact is DECLARED — provider, model, key env, brakes', () => {
  const path = targetsFile({ targets: [{
    provider: 'google', model: 'gemini-3.1-flash-lite',
    keyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', brakes: { maxTurns: 12 }
  }] });
  const rows = loadTargets(path);
  expect(rows).toHaveLength(1);
  expect(rows[0].target).toMatchObject({
    id: 'gemini-3.1-flash-lite', provider: 'google',
    keyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', tier: 'cloud', certified: true });
  expect(rows[0].brakes).toEqual({ maxTurns: 12 });
});

test('the bench spelling apiKeyEnv is accepted as the declared key env', () => {
  const path = targetsFile({ targets: [{
    provider: 'google', model: 'gemini-3.1-flash-lite', apiKeyEnv: 'GOOGLE_KEY' }] });
  expect(loadTargets(path)[0].target.keyEnv).toBe('GOOGLE_KEY');
});

test('a local target declares its tier — never inferred from an id or a url', () => {
  const path = targetsFile({ targets: [{
    provider: 'local', model: 'qwen3-a3b', keyEnv: null, tier: { local: 'a3b' } }] });
  expect(loadTargets(path)[0].target.tier).toEqual({ local: 'a3b' });
});

test('a target with no declared provider fails loud, naming the file', () => {
  const path = targetsFile({ targets: [{ model: 'mystery' }] });
  expect(() => loadTargets(path)).toThrow(/provider/);
  expect(() => loadTargets(path)).toThrow('targets.json');
});

test('a malformed file fails loud with the path named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'targets-'));
  const path = join(dir, 'targets.json');
  writeFileSync(path, '{ not json');
  expect(() => loadTargets(path)).toThrow(/targets.json/);
});
