#!/usr/bin/env node
/**
 * looprun release ritual — one command, whole flow:
 *
 *   1. preflight   git clean + on main + npm login + gh auth + pending changesets
 *   2. version     `changeset version` (linked group bumps looprun + @looprun-ai/* together),
 *                  then aligns the private root package.json to the umbrella version
 *   3. gates       pnpm -r build + typecheck + test, then the no-bench-drift gate
 *   4. commit+tag  chore(release): vX.Y.Z  +  tag vX.Y.Z
 *   5. publish     pnpm -r publish --access public   (already-published versions are skipped,
 *                  so a failed run is safe to re-run; npm 2FA prompts inline or use --otp=CODE)
 *   6. push        git push --atomic origin main vX.Y.Z
 *   7. release     gh release create vX.Y.Z (package/version table + auto-generated notes)
 *
 * Versioning discipline: `pnpm release` cuts a PATCH, directly — no changeset required
 * (package.json bakes --bump=patch). MINOR is `pnpm release-minor`; MAJOR is explicit
 * (--bump=major). ANTI-ESCALATION LAW (2026-07-18, after an accidental 0.7.0): the packages
 * are a LINKED changeset group, so `changeset version` applies the HIGHEST bump across all
 * pending changesets — therefore a pending changeset may NEVER escalate past the requested
 * bump: the release ABORTS and makes you choose (release-minor, or delete/downgrade the
 * changeset). 1.0.0 is a deliberate stability decision, never an automatic milestone.
 *
 * Usage:
 *   pnpm release                 # PATCH release, directly
 *   pnpm release-minor           # uniform MINOR bump of all packages
 *   pnpm release --otp=123456    # extra flags append: npm 2FA code non-interactively
 *   pnpm release --resume --otp=… # resume a run that failed at publish (commit+tag already local)
 *   pnpm release:dry             # preflight + gates only, no mutation
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.filter((a) => a.startsWith(`--${name}=`)).pop()?.split('=')[1]; // last wins — CLI flags override the baked package.json default
const DRY = flag('dry-run');
const BUMP = value('bump') ?? (args.includes('--bump') ? 'patch' : undefined); // bare --bump = patch
const OTP = value('otp');
const RESUME = flag('resume'); // resume a run that failed at publish (version commit+tag already local)

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : ['inherit', 'pipe', 'inherit'], ...opts }).trim();
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const die = (msg) => {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▶ ${msg}`);

const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const publishableDirs = () =>
  readdirSync(join(ROOT, 'packages'))
    .map((d) => `packages/${d}`)
    .filter((d) => existsSync(join(ROOT, d, 'package.json')) && !readJson(`${d}/package.json`).private);

// ---------- 1. preflight ----------
step('preflight');
if (sh('git status --porcelain', { quiet: true })) die('working tree not clean — commit or stash first.');
const branch = sh('git rev-parse --abbrev-ref HEAD', { quiet: true });
if (branch !== 'main') die(`on branch "${branch}" — releases cut from main.`);
const npmUser = sh('npm whoami', { quiet: true });
sh('gh auth status', { quiet: true });
const pendingChangesets = readdirSync(join(ROOT, '.changeset')).filter(
  (f) => f.endsWith('.md') && f !== 'README.md',
);
// PATCH is the baked default (package.json passes --bump=patch); release-minor bakes minor.
// ── ANTI-ESCALATION GATE (2026-07-18, after the accidental 0.7.0) ─────────────────────────────
// The packages are a LINKED group: `changeset version` applies the HIGHEST bump across ALL
// pending changesets, so a stray pending `minor` silently escalated an explicit `pnpm release`
// (patch) into a minor. A pending changeset may never escalate past the requested bump —
// abort (before ANY mutation; also on --dry-run) and make the human choose explicitly.
if (!RESUME && pendingChangesets.length) {
  const RANK = { patch: 0, minor: 1, major: 2 };
  const requested = BUMP ?? 'patch';
  const escalating = pendingChangesets
    .map((f) => {
      const src = readFileSync(join(ROOT, '.changeset', f), 'utf8');
      const fm = src.split('---')[1] ?? '';
      const levels = [...fm.matchAll(/:\s*['"]?(patch|minor|major)['"]?\s*$/gm)].map((m) => m[1]);
      const max = levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'patch');
      return { f, max };
    })
    .filter((c) => RANK[c.max] > RANK[requested]);
  if (escalating.length) {
    die(
      `pending changeset(s) would ESCALATE this ${requested} release beyond ${requested}:\n` +
        escalating.map((c) => `    .changeset/${c.f} → ${c.max}`).join('\n') +
        `\n  The linked group takes the HIGHEST bump — choose explicitly:\n` +
        `    pnpm release-minor                       # accept the higher bump\n` +
        `    (or delete/downgrade the changeset, then re-run pnpm release)`,
    );
  }
}
if (!RESUME)
  console.log(
    `  → ${BUMP ?? 'patch'} release${pendingChangesets.length ? ` + ${pendingChangesets.length} pending changeset(s) (highest bump wins)` : ''}`,
  );
console.log(`  npm: ${npmUser} · branch: ${branch}`);

// ---------- 3 (early in dry-run). gates ----------
const gates = () => {
  step('gates: build + typecheck + test + drift');
  run('pnpm -r --if-present build');
  run('pnpm -r --if-present typecheck');
  run('pnpm -r --if-present test');
  run('node tests/no-bench-drift.test.mjs');
};

if (DRY) {
  gates();
  console.log('\nrelease --dry-run: preflight + gates green. Would version, tag, publish:');
  for (const d of publishableDirs()) {
    const j = readJson(`${d}/package.json`);
    console.log(`  ${j.name}@${j.version}  (${d})`);
  }
  process.exit(0);
}

// ---------- 2. version ----------
step('version');
if (RESUME) {
  // The version/gates/commit/tag steps already ran in the failed attempt — verify and jump to publish.
  const u = readJson('packages/looprun/package.json');
  const t = `v${u.version}`;
  if (!sh(`git tag -l ${t}`, { quiet: true })) die(`--resume: tag ${t} not found — nothing to resume.`);
  const head = sh('git log -1 --format=%s', { quiet: true });
  if (head !== `chore(release): ${t}`) die(`--resume: HEAD is "${head}", expected "chore(release): ${t}".`);
  console.log(`  resuming ${t} at publish`);
}
if (!RESUME && (BUMP || !pendingChangesets.length)) {
  const bump = BUMP ?? 'patch'; // baked default is patch; the gate above forbids silent escalation
  if (!['patch', 'minor', 'major'].includes(bump)) die(`--bump must be patch|minor|major, got "${bump}"`);
  const names = publishableDirs().map((d) => readJson(`${d}/package.json`).name);
  const front = names.map((n) => `'${n}': ${bump}`).join('\n');
  writeFileSync(join(ROOT, '.changeset', 'release-adhoc.md'), `---\n${front}\n---\n\nRelease (${bump}).\n`);
}
if (!RESUME) run('pnpm exec changeset version');
const umbrella = readJson('packages/looprun/package.json');
const VERSION = umbrella.version;
const TAG = `v${VERSION}`;
if (!RESUME) {
  const rootPkg = readJson('package.json');
  rootPkg.version = VERSION;
  writeFileSync(join(ROOT, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n');
  run('pnpm install --lockfile-only');
  if (sh(`git tag -l ${TAG}`, { quiet: true })) die(`tag ${TAG} already exists.`);
  console.log(`  releasing ${TAG}`);

  // ---------- 3. gates ----------
  gates();

  // ---------- 4. commit + tag ----------
  step(`commit + tag ${TAG}`);
  run('git add -A');
  run(`git commit -m "chore(release): ${TAG}"`);
  run(`git tag ${TAG}`);
}

// ---------- 5. publish (re-runnable: pnpm skips versions already on the registry) ----------
step('publish to npm');
const publish = spawnSync('pnpm', ['-r', 'publish', '--access', 'public', ...(OTP ? [`--otp=${OTP}`] : [])], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (publish.status !== 0)
  die(`publish failed (2FA code expired?). Fix and re-run: pnpm release --resume --otp=<code> — already-published packages are skipped, the commit/tag are local until push.`);

// ---------- 6. push ----------
step('push main + tag');
run(`git push --atomic origin main ${TAG}`);

// ---------- 7. GitHub release ----------
step('GitHub release');
const table = [
  '| package | version |',
  '|---|---|',
  ...publishableDirs().map((d) => {
    const j = readJson(`${d}/package.json`);
    return `| [\`${j.name}\`](https://www.npmjs.com/package/${j.name}) | ${j.version} |`;
  }),
].join('\n');
const notes = `Published to npm:\n\n${table}\n`;
spawnSync('gh', ['release', 'create', TAG, '--title', `looprun ${VERSION}`, '--notes', notes, '--generate-notes'], {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log(`\n✓ released ${TAG} — https://github.com/looprun-ai/looprun/releases/tag/${TAG}`);
