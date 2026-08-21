#!/usr/bin/env node
/** The emitter on a terminal: one subject directory in, the path of every file written out, one
 *  per line. A declaration that does not fit its world card writes nothing and prints every
 *  refusal the emitter can know, one per line, on the error channel — and exits 1. */
import { emit } from './write-artifacts.js';

const subjectDir = process.argv[2];
if (subjectDir === undefined) {
  process.stderr.write('looprun-emit <subject directory>\n');
  process.exit(1);
}

try {
  for (const path of emit(subjectDir)) process.stdout.write(`${path}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
