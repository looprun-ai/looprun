#!/usr/bin/env node
/**
 * THE NO-SECRETS GATE — a key committed once is a key leaked forever: the file can be deleted, the
 * history cannot, and every clone already has it. Keys reach a run one way, the environment, read
 * by name at the moment of use — so `process.env.GOOGLE_GENERATIVE_AI_API_KEY` is the shape a
 * repository is allowed to carry, and `AIza…` is not.
 *
 * What is read is the value's shape, never the variable's name: a provider stamps its keys with a
 * prefix and a length, and that stamp is what a scan can recognise without knowing which strings
 * are secret. This gate carries the stamps, so it is the one file it does not read.
 *
 * Run: node tests/no-secrets.test.mjs   (part of `pnpm gates`)
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

const SHAPES = [
  { of: 'an OpenAI key', stamp: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { of: 'a Google API key', stamp: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { of: 'a GitHub token', stamp: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { of: 'a GitHub fine-grained token', stamp: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { of: 'an AWS access key id', stamp: /\bAKIA[A-Z0-9]{16}\b/ },
  { of: 'a Slack token', stamp: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { of: 'a private key block', stamp: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const BINARY = /\.(png|jpg|jpeg|gif|svg|ico|gguf|zip|woff2?)$/i;

/** Every file git tracks here. A tracked entry that is not a regular file is a symlink into
 *  another tree, and none of its bytes are this repository's. */
function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((rel) => rel !== '' && !BINARY.test(rel) && lstatSync(join(ROOT, rel)).isFile());
}

/** Every place in one file where a literal wears a provider's key stamp. */
function keysIn(rel, text) {
  const keys = [];
  text.split('\n').forEach((line, index) => {
    for (const shape of SHAPES) {
      if (shape.stamp.test(line)) keys.push(`${rel}:${index + 1}  [${shape.of}]`);
    }
  });
  return keys;
}

// SELF-TEST: a lint that cannot fail is no law. The key written into a file must fire, and the
// name a run reads one by must not.
const LITERAL = "const model = google({ apiKey: 'AIzaSyD-0123456789abcdefghijklmnopqrstu' });";
const BY_NAME = 'const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;';
if (keysIn('gen/model.ts', LITERAL).length !== 1 || keysIn('gen/model.ts', BY_NAME).length !== 0) {
  console.error('no-secrets SELF-TEST failed — the gate is blind to a key, or it reads a name as one');
  process.exit(2);
}

const keys = [];
for (const rel of trackedFiles()) {
  if (rel === SELF) continue;
  keys.push(...keysIn(rel, readFileSync(join(ROOT, rel), 'utf8')));
}

if (keys.length) {
  console.error(`no-secrets: ${keys.length} key-shaped literal(s) in tracked files:`);
  for (const key of keys) console.error(`  ${key}`);
  process.exit(1);
}
console.log('no-secrets: clean');
