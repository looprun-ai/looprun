/**
 * The CLI WRAPPER, executed as a process.
 *
 * The library functions were covered; the argv plumbing around them was not — so a command could
 * reference an undeclared variable and fail with a ReferenceError on its first line while every
 * unit test stayed green. These tests run the binary the way a user does.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'looprun-eval.mjs');

/** Run the binary; returns { out, code } — stderr is folded in, nothing throws on a non-zero exit. */
function cli(...args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', stdio: 'pipe' }), code: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}

function toySubject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'looprun-cli-'));
  for (const d of ['norms', 'gen', 'evals']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'norms', 'contract.ts'), 'export const C = 1\n');
  writeFileSync(join(dir, 'gen', 'tools.json'), '{"tools":[]}\n');
  writeFileSync(join(dir, 'evals', 'cases.ts'), 'export default []\n');
  writeFileSync(join(dir, 'evals', 'judge-prompt.md'), '- An honest empty result passes.\n');
  return dir;
}

test('cli: every command resolves its own arguments (no ReferenceError)', () => {
  const help = cli('help');
  assert.equal(help.code, 0);
  for (const cmd of ['run', 'fold', 'cert', 'seal', 'lint']) {
    assert.match(help.out, new RegExp(`^\\s+${cmd}\\b`, 'm'), `${cmd} missing from help`);
  }
  // A command invoked with no arguments must fail on its OWN validation, never on a bad reference.
  for (const cmd of ['run', 'fold', 'cert', 'seal']) {
    const r = cli(cmd);
    assert.doesNotMatch(r.out, /is not defined/, `${cmd}: ReferenceError — ${r.out.trim()}`);
    assert.notEqual(r.code, 0, `${cmd} should refuse an empty invocation`);
  }
});

test('cli: seal mints from a positional subject, verifies, and voids on tamper', () => {
  const dir = toySubject();

  const mint = cli('seal', dir, '--target', 'm:1:3');
  assert.equal(mint.code, 0, mint.out);
  assert.match(mint.out, /seal minted/);

  const ok = cli('seal', dir, '--verify');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /seal VALID/);

  // The ruler is under seal: rewriting the judge's rules voids it without touching a case.
  writeFileSync(join(dir, 'evals', 'judge-prompt.md'), '- An honest empty result fails.\n');
  const voided = cli('seal', dir, '--verify');
  assert.equal(voided.code, 1);
  assert.match(voided.out, /seal VOID/);
});

test('cli: seal also accepts --subject, and refuses a mint with no target', () => {
  const dir = toySubject();
  assert.equal(cli('seal', '--subject', dir, '--target', 'm:1:3').code, 0);

  const noTarget = cli('seal', dir);
  assert.equal(noTarget.code, 2);
  assert.match(noTarget.out, /--target/);
});
