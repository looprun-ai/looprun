import { test, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SubjectLoader } from '../src/subject-loader.js';
import { Validator } from '../src/validator.js';
import { nameGate, purity } from '../src/lints.js';

// The phase-4a gate: the ported Atlas subject in the sibling bench repo loads,
// compiles for every desk, keeps the prompt byte-identical across all presets,
// validates with zero findings and passes the static lints.
const ATLAS = join(fileURLToPath(import.meta.url),
  '../../../../../agentspec-bench/subjects/atlas-next');

test.skipIf(!existsSync(ATLAS))('the ported atlas subject validates and lints clean', async () => {
  const subject = await SubjectLoader.load(ATLAS);
  expect(Object.keys(subject.specs)).toHaveLength(6);
  expect(subject.cases).toHaveLength(100);
  expect(subject.presets).toHaveLength(22);
  expect(SubjectLoader.promptProof(subject).size).toBe(1);
  expect(new Validator().run(subject).findings).toEqual([]);
  expect(purity(ATLAS)).toEqual([]);
  expect(nameGate(ATLAS)).toEqual([]);
});
