#!/usr/bin/env node
/**
 * Regenerate governance/MATRIX.md from the record files (governance/proofs/*.md), deterministically.
 *
 *   node scripts/proofs/gen-matrix.mjs            # write MATRIX.md
 *   node scripts/proofs/gen-matrix.mjs --check    # verify it is in sync (CI); exit 1 if stale
 *
 * Malformed frontmatter in any record → exit 2, naming the file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecords, renderMatrix } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PROOFS = join(ROOT, 'governance', 'proofs');
const MATRIX = join(ROOT, 'governance', 'MATRIX.md');
const check = process.argv.includes('--check');

let records;
try {
  records = readRecords(PROOFS);
} catch (e) {
  console.error(`gen-matrix: ${e.message}`);
  process.exit(2);
}

const next = renderMatrix(records);

if (check) {
  const current = existsSync(MATRIX) ? readFileSync(MATRIX, 'utf8') : '';
  if (current !== next) {
    console.error('gen-matrix --check: governance/MATRIX.md is STALE. Run `pnpm proofs:matrix` and commit the result.');
    console.error(`  (records on disk: ${records.length})`);
    process.exit(1);
  }
  console.log(`gen-matrix --check: in sync (${records.length} record(s)).`);
  process.exit(0);
}

writeFileSync(MATRIX, next);
console.log(`gen-matrix: wrote governance/MATRIX.md (${records.length} record(s)).`);
