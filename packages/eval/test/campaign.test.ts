/**
 * `looprun-eval campaign` (spec 2026-08-02) — the whole measured campaign as ONE verb, driven by a
 * scripted model with NO network. This is the spec's acceptance suite: preflight → runs → judging
 * manifest PAUSE → fake verdicts → fold/sync/band; immutability; resume; band-file-as-only-number;
 * preflight failure fixtures; the monitor gate.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fakeLLM } from '@looprun-ai/mastra/testing';
import { campaignCommand } from '../src/campaign.js';
import { readJsonl } from '../src/fold.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBJECT = resolve(HERE, 'fixtures/campaign-subject');
const BADREF = resolve(HERE, 'fixtures/campaign-subject-badref');
const NEEDKEY = resolve(HERE, 'fixtures/campaign-subject-needskey');
const ADVISORY = resolve(HERE, 'fixtures/campaign-subject-advisory');

/** A fresh reply-only scripted model per rep (single turn → replyToUser → terminal). */
const modelFactory = () => fakeLLM([[{ tool: 'respond', args: { message: 'Hello! I can answer grounded questions.', did: [] } }]]).model;

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
}

/** Write a campaign.json into `dir`, returning its path. `out` defaults to `<dir>/camp`. */
function writeConfig(dir: string, cfg: Record<string, unknown>): string {
  const path = join(dir, 'campaign.json');
  writeFileSync(path, JSON.stringify({ subject: SUBJECT, reps: 2, control: 'ungoverned', perturbation: 'user-tail', bar: 0.9, chunk: 10, out: join(dir, 'camp'), ...cfg }, null, 2));
  return path;
}

/** Capture the campaign's log lines. */
function logger(): { lines: string[]; log: (l: string) => void } {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(l) };
}

/** Drive a full run → seed verdicts → return { outDir, log-capture }. Verdicts default to 'pass'. */
async function runToPause(dir: string, cfgOverrides: Record<string, unknown> = {}): Promise<string> {
  const config = writeConfig(dir, cfgOverrides);
  await campaignCommand({ action: 'run', config, modelFactory, date: '2026-08-02' });
  return join(dir, 'camp');
}

function seedVerdicts(outDir: string, verdict = 'pass'): void {
  for (const name of ['r0', 'r1', 'control']) {
    const dir = join(outDir, name);
    const dumps = readJsonl<{ caseId: string }>(readFileSync(join(dir, 'cases.jsonl'), 'utf8'));
    writeFileSync(join(dir, 'verdicts.jsonl'), dumps.map((d) => JSON.stringify({ caseId: d.caseId, verdict })).join('\n') + '\n');
  }
}

describe('campaign — end-to-end, scripted model, no network', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmp();
  });

  it('run: preflight → immutable rep + control dirs → judging.json PAUSE', async () => {
    const cap = logger();
    const config = writeConfig(dir, {});
    await campaignCommand({ action: 'run', config, modelFactory, date: '2026-08-02', log: cap.log });
    const outDir = join(dir, 'camp');

    for (const name of ['r0', 'r1', 'control']) {
      expect(existsSync(join(outDir, name, 'cases.jsonl')), `${name} ran`).toBe(true);
      expect(existsSync(join(outDir, name, 'DONE')), `${name} DONE marker`).toBe(true);
      expect(existsSync(join(outDir, name, 'MONITOR.md')), `${name} monitored`).toBe(true);
      expect(existsSync(join(outDir, name, 'judge-input.part1.jsonl')), `${name} judge input`).toBe(true);
    }
    // The manifest exists and PAUSED — no cert yet.
    const manifest = JSON.parse(readFileSync(join(outDir, 'judging.json'), 'utf8'));
    expect(manifest.reps).toEqual(['r0', 'r1']);
    expect(manifest.control).toBe('control');
    expect(manifest.judgeModel).toBe(null); // the host fills it
    expect(manifest.dirs).toHaveLength(3);
    expect(manifest.dirs.every((d: { expectedVerdicts: number }) => d.expectedVerdicts === 1)).toBe(true);
    expect(existsSync(join(outDir, 'cert-band.json'))).toBe(false);
    expect(cap.lines.some((l) => /PAUSED for judging/.test(l))).toBe(true);
  });

  it('immutability: a second run over a finished out dir REFUSES', async () => {
    await runToPause(dir);
    // Same config, no --resume → the non-empty out dir is refused.
    await expect(campaignCommand({ action: 'run', config: join(dir, 'campaign.json'), modelFactory })).rejects.toThrow(/not empty|resume/);
  });

  it('resume: verifies verdict counts, folds/syncs, and certifies off the band', async () => {
    const outDir = await runToPause(dir);

    // Resume BEFORE verdicts exist → refuses (judging incomplete).
    await expect(campaignCommand({ action: 'resume', out: outDir })).rejects.toThrow(/verdicts.*missing|incomplete/i);

    seedVerdicts(outDir, 'pass');
    const cap = logger();
    await campaignCommand({ action: 'resume', out: outDir, judgeModel: 'test-ruler', date: '2026-08-02', log: cap.log });

    // The band file is written and certified (floor 100% ≥ bar 90%).
    const band = JSON.parse(readFileSync(join(outDir, 'cert-band.json'), 'utf8'));
    expect(band.certified).toBe(true);
    expect(band.reps).toBe(2);
    expect(band.floor).toBe(1);
    // Synced verdicts were produced per governed rep and cert read them.
    expect(existsSync(join(outDir, 'r0', 'verdicts.synced.jsonl'))).toBe(true);
    expect(existsSync(join(outDir, 'SYNC.md'))).toBe(true);
    // Control arm folded to its own RESULTS.md (A/B), never into the band.
    expect(existsSync(join(outDir, 'control', 'RESULTS.md'))).toBe(true);
    expect(cap.lines.some((l) => /CERTIFIED/.test(l))).toBe(true);
  });

  it('short-count: a verdicts file that EXISTS but is short of expectedVerdicts → resume refuses, naming the short dir', async () => {
    const outDir = await runToPause(dir);
    // r0 complete; r1 present but short (an empty verdicts.jsonl is a file that exists yet counts 0).
    seedVerdicts(outDir, 'pass');
    writeFileSync(join(outDir, 'r1', 'verdicts.jsonl'), '');
    await expect(campaignCommand({ action: 'resume', out: outDir })).rejects.toThrow(/r1 has 0 verdict\(s\), expected 1/);
    expect(existsSync(join(outDir, 'cert-band.json'))).toBe(false);
  });

  it('the band file is the ONLY number source — CAMPAIGN.md quotes cert-band.json verbatim', async () => {
    const outDir = await runToPause(dir);
    seedVerdicts(outDir, 'pass');
    await campaignCommand({ action: 'resume', out: outDir, judgeModel: 'test-ruler', date: '2026-08-02' });

    const bandJson = readFileSync(join(outDir, 'cert-band.json'), 'utf8').trimEnd();
    const report = readFileSync(join(outDir, 'CAMPAIGN.md'), 'utf8');
    expect(report).toContain(bandJson); // verbatim, not recomputed
    expect(report).toContain('judged by: test-ruler');
  });

  it('below-bar: a FAIL verdict drops the floor and resume refuses to certify', async () => {
    const outDir = await runToPause(dir);
    seedVerdicts(outDir, 'FAIL');
    await expect(campaignCommand({ action: 'resume', out: outDir })).rejects.toThrow(/BELOW BAR/);
    const band = JSON.parse(readFileSync(join(outDir, 'cert-band.json'), 'utf8'));
    expect(band.certified).toBe(false);
  });

  it('status: prints per-phase progress from the dirs alone', async () => {
    const outDir = await runToPause(dir);
    const cap = logger();
    await campaignCommand({ action: 'status', out: outDir, log: cap.log });
    const text = cap.lines.join('\n');
    expect(text).toMatch(/PAUSED for judging/);
    expect(text).toMatch(/\| r0 \| 1 \| 0 \| yes \| 0 \|/); // 1 case, 0 verdicts, done, 0 incidents
    expect(text).toMatch(/\| control \|/);
  });
});

describe('campaign — preflight failure fixtures', () => {
  it('missing env key: the target needs a key that is unset → refuse before spend', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
    // NEEDKEY's ask/targets.json requires an env key we do NOT provide, and NO scripted model → the
    // env-key gate is live. (Guard against a leaked env from another test.)
    delete process.env.DEFINITELY_UNSET_KEY_XYZ;
    const config = join(dir, 'campaign.json');
    writeFileSync(config, JSON.stringify({ subject: NEEDKEY, reps: 2, control: 'ungoverned', bar: 0.9, chunk: 10, out: join(dir, 'camp') }));
    await expect(campaignCommand({ action: 'run', config })).rejects.toThrow(/env key DEFINITELY_UNSET_KEY_XYZ/);
  });

  it('dirty out dir: a non-empty out dir without --resume → refuse', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
    const outDir = join(dir, 'camp');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'stale.txt'), 'leftover');
    const config = join(dir, 'campaign.json');
    writeFileSync(config, JSON.stringify({ subject: SUBJECT, reps: 2, control: 'ungoverned', bar: 0.9, chunk: 10, out: outDir }));
    await expect(campaignCommand({ action: 'run', config, modelFactory })).rejects.toThrow(/not empty/);
  });

  it('validate red: a subject whose references layer is RED → refuse before spend', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
    const config = join(dir, 'campaign.json');
    writeFileSync(config, JSON.stringify({ subject: BADREF, reps: 2, control: 'ungoverned', bar: 0.9, chunk: 10, out: join(dir, 'camp') }));
    await expect(campaignCommand({ action: 'run', config, modelFactory })).rejects.toThrow(/validate is RED/);
  });

  it('advisory-only premise: a multi-turn SKIP with a green floor does NOT block preflight (defect 1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
    const { lines, log } = logger();
    const config = join(dir, 'campaign.json');
    writeFileSync(config, JSON.stringify({ subject: ADVISORY, reps: 2, control: 'ungoverned', bar: 0.9, chunk: 10, out: join(dir, 'camp') }));
    // Preflight passes (no RED throw) even though the premise layer emits a SKIP line — it lands as
    // advisory, and the campaign proceeds to the judging PAUSE.
    await campaignCommand({ action: 'run', config, modelFactory, date: '2026-08-02', log });
    const joined = lines.join('\n');
    expect(joined).toMatch(/preflight: ADVISORY .*SKIPPED "02-followup": multi-turn/);
    expect(joined).toMatch(/advisory line\(s\) \(non-blocking\)/);
    expect(joined).not.toMatch(/validate is RED/);
    expect(existsSync(join(dir, 'camp', 'judging.json'))).toBe(true);
  });
});

describe('campaign — monitor gate', () => {
  it('a seeded network incident blocks cert until a MONITOR.resolved marker is dropped', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-campaign-'));
    const outDir = await (async () => {
      const config = writeConfig(dir, {});
      await campaignCommand({ action: 'run', config, modelFactory, date: '2026-08-02' });
      return join(dir, 'camp');
    })();
    seedVerdicts(outDir, 'pass');

    // Seed a network incident into r0's monitor log (as the always-armed vigil would have).
    writeFileSync(
      join(outDir, 'r0', 'monitor.json'),
      JSON.stringify({ dir: join(outDir, 'r0'), network: [{ caseId: '01-greet', detail: 'fetch failed' }], holes: [], incidents: 1 }),
    );

    // Cert is gated: the campaign refuses over the unresolved incident.
    await expect(campaignCommand({ action: 'resume', out: outDir })).rejects.toThrow(/unresolved incident/);
    expect(existsSync(join(outDir, 'cert-band.json'))).toBe(false);

    // Operator marks it resolved → cert proceeds.
    writeFileSync(join(outDir, 'r0', 'MONITOR.resolved'), 'reviewed: transient network blip, re-run clean\n');
    await campaignCommand({ action: 'resume', out: outDir, date: '2026-08-02' });
    expect(JSON.parse(readFileSync(join(outDir, 'cert-band.json'), 'utf8')).certified).toBe(true);
  });
});
