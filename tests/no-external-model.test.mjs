#!/usr/bin/env node
/**
 * THE NO-EXTERNAL-MODEL GATE — the judge is the agent in the session. No file in this repository
 * calls a third-party model API: not to judge a run, not to score a transcript, not for one
 * exploratory call behind a script. Sending a run's transcripts to an outside provider publishes
 * them, and nobody authorized that; a verdict is also a judgement about this work, and it belongs
 * to the person doing the work and the agent they are working with. The one model a run may reach
 * is the SUBJECT under test, named in that subject's own targets file — the object of the
 * measurement, never a participant in it.
 *
 * A door and a mention are different things. The law names the hosts it forbids, so a page that
 * writes `api.openai.com` in a table is stating the rule. A door is a host something can dial:
 * written behind `://` on any page, or written at all in a file a runtime loads. This gate names
 * the hosts to look for, so it is the one file it does not read.
 *
 * Run: node tests/no-external-model.test.mjs   (part of `pnpm gates`)
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

const HOSTS = ['generativelanguage.googleapis.com', 'api.openai.com', 'api.anthropic.com'];

// A file a runtime loads. Anywhere in one of these, the bare host is already a door: the scheme
// is one template line away, and nothing in a runtime file writes a hostname to state a law.
const RUNTIME = /\.([cm]?[jt]s|json|ya?ml|sh|py)$/;
const BINARY = /\.(png|jpg|jpeg|gif|svg|ico|gguf|zip|woff2?)$/i;

/** Every file git tracks here. A tracked entry that is not a regular file is a symlink into
 *  another tree, and none of its bytes are this repository's. */
function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((rel) => rel !== '' && !BINARY.test(rel) && lstatSync(join(ROOT, rel)).isFile());
}

/** Every place in one file where a provider host is something a process can reach. */
function doorsIn(rel, text) {
  const doors = [];
  text.split('\n').forEach((line, index) => {
    for (const host of HOSTS) {
      for (let at = line.indexOf(host); at >= 0; at = line.indexOf(host, at + 1)) {
        if (RUNTIME.test(rel) || line.slice(0, at).endsWith('://')) {
          doors.push(`${rel}:${index + 1}  [${host}]  ${line.trim().slice(0, 120)}`);
        }
      }
    }
  });
  return doors;
}

// SELF-TEST: a lint that cannot fail is no law. A judge seam pointed at a provider must fire, and
// the law naming the same provider in order to forbid it must not.
const DOOR = 'const res = await fetch(`https://api.openai.com/v1/chat/completions`, init);';
const LAW = '| a script that POSTs to `api.openai.com` | the agent in the session judges |';
if (doorsIn('tools/judge-seam.ts', DOOR).length !== 1 || doorsIn('CLAUDE.md', LAW).length !== 0) {
  console.error('no-external-model SELF-TEST failed — the gate is blind to a door, or it reads the law as one');
  process.exit(2);
}

const doors = [];
for (const rel of trackedFiles()) {
  if (rel === SELF) continue;
  doors.push(...doorsIn(rel, readFileSync(join(ROOT, rel), 'utf8')));
}

if (doors.length) {
  console.error(`no-external-model: ${doors.length} door(s) to a third-party model API:`);
  for (const door of doors) console.error(`  ${door}`);
  process.exit(1);
}
console.log('no-external-model: clean');
