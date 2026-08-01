/**
 * `looprun-eval validate` — the three layers over a real subject on disk, plus the CLI wiring.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSubject } from '../src/subject.js';
import { checkSchema, checkReferences, validateSubjectConfig } from '../src/validate.js';
import { validateCommand } from '../src/commands.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOY = resolve(HERE, 'fixtures/toy-subject');
const BIN = join(HERE, '..', 'bin', 'looprun-eval.mjs');

describe('validate — schema + references + premise over the toy subject', () => {
  it('schema layer parses the subject JSON configs (norms/*.json)', () => {
    expect(checkSchema(TOY)).toEqual([]); // norms/front-desk.json parses; no cases.json
  });

  it('references layer: toy is coherent, reverse-coverage is advisory', async () => {
    const subject = await loadSubject(TOY);
    const { blocking, advisory } = checkReferences(subject);
    expect(blocking).toEqual([]);
    // The one authored guard no case targets is reported — but as advisory, never blocking.
    expect(advisory.join('\n')).toMatch(/agent:reserveRequiresLookup.*reverse-coverage/);
  });

  it('full report over toy is blocking-clean', async () => {
    const subject = await loadSubject(TOY);
    const report = validateSubjectConfig(TOY, subject);
    expect(report.schema).toEqual([]);
    expect(report.references).toEqual([]);
    expect(report.premise).toEqual([]);
  });

  it('validateCommand returns ok:true for the clean toy subject', async () => {
    const report = await validateCommand({ subject: TOY, log: () => {} });
    expect(report.ok).toBe(true);
  });

  it('CLI: `validate --subject` runs and exits 0 on the clean subject', () => {
    const r = spawnSync(process.execPath, [BIN, 'validate', '--subject', TOY], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/validate: clean/); // report lines stream to stderr, like `run`
  });

  it('CLI: help lists validate', () => {
    const out = execFileSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' });
    expect(out).toMatch(/^\s+validate\b/m);
  });
});
