import { test } from 'vitest';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { fold, sync } from '../src/folder.js';
import { certify } from '../src/certifier.js';
import { seal } from '../src/seal.js';

// The phase-5 closing driver — env-gated, no model, never in CI.
//   CERTIFY_ATLAS=<stamp>  [CERTIFY_ATLAS_BAR=0.85]
// Folds every rep of the stamp, certifies at the bar, and seals the subject;
// the certification and the seal land beside the reps.
const ATLAS = join(fileURLToPath(import.meta.url),
  '../../../../../../agentspec-bench/subjects/atlas-next');
const STAMP = process.env.CERTIFY_ATLAS ?? '';

test.skipIf(STAMP === '' || !existsSync(ATLAS))('atlas certify', { timeout: 0 }, () => {
  const campaign = join(ATLAS, 'test', STAMP);
  const reps = readdirSync(campaign, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('rep'))
    .map(e => e.name).sort();
  const runDirs = reps.map(r => join(campaign, r));

  for (const [i, dir] of runDirs.entries()) {
    const s = sync(dir);
    const f = fold(dir);
    process.stdout.write(`${reps[i]}: mismatches=${String(s.mismatches.length)}`
      + ` missing=${String(f.missing.length)} divergent=${String(f.divergent.length)}`
      + ` pass=${String(f.perCase.filter(r => r.verdict === 'pass').length)}/${String(f.perCase.length)}\n`);
    for (const m of [...s.mismatches, ...f.missing, ...f.divergent].slice(0, 5)) {
      process.stdout.write(`  ! ${m}\n`);
    }
  }

  const bar = Number(process.env.CERTIFY_ATLAS_BAR ?? '0.85');
  const certification = certify(runDirs, bar);
  writeFileSync(join(campaign, 'certification.json'),
    `${JSON.stringify(certification, null, 2)}\n`);
  writeFileSync(join(campaign, 'seal.json'), `${JSON.stringify(seal(ATLAS), null, 2)}\n`);
  process.stdout.write(`certified=${String(certification.pass)}`
    + ` scores=${certification.scores.map(s => s.toFixed(2)).join(',')}`
    + ` heldOut=${String(certification.heldOutIncluded)}`
    + ` failing=${certification.failingCases.length === 0 ? 'none' : certification.failingCases.join(',')}\n`);
  for (const v of certification.voided) process.stdout.write(`  VOID ${v}\n`);
});
