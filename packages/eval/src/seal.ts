/**
 * @looprun-ai/eval — the SHIP seal: a certification record bound to the artifact hash.
 *
 * The hash covers the governed artifacts of a subject (norms/**, gen/tools.json,
 * gen/world.ts, evals/cases.*, evals/judge-prompt.md): sha256 over the sorted list of
 * `sha256(content)  relpath`
 * lines. ANY change to a hashed artifact after certification voids the seal — verification
 * recomputes and compares; a mismatch is VOID, never re-stamped.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface SealTarget { model: string; rate: number; reps: number }
export interface Seal {
  targets: SealTarget[];
  bar: number;
  certifiedAt?: string;
  note?: string;
  artifactHash: string;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** The hashed surface, relative to the subject dir. */
export function sealedFiles(subjectDir: string): string[] {
  const files: string[] = [];
  const normsDir = join(subjectDir, 'norms');
  if (existsSync(normsDir)) files.push(...walk(normsDir));
  for (const f of ['gen/tools.json', 'gen/world.ts', 'gen/world.js']) {
    const p = join(subjectDir, f);
    if (existsSync(p)) files.push(p);
  }
  const evalsDir = join(subjectDir, 'evals');
  if (existsSync(evalsDir)) {
    for (const name of readdirSync(evalsDir).sort()) {
      // The cases AND the ruler: a certification is a claim about a score, and swapping the judge's
      // domain rules changes that score without touching a single case. Both are under seal.
      if (/^cases\./.test(name) || name === 'judge-prompt.md') files.push(join(evalsDir, name));
    }
  }
  return files.map((p) => relative(subjectDir, p)).sort();
}

export function computeArtifactHash(subjectDir: string): string {
  const lines = sealedFiles(subjectDir).map((rel) => {
    const h = createHash('sha256').update(readFileSync(join(subjectDir, rel))).digest('hex');
    return `${h}  ${rel}`;
  });
  return createHash('sha256').update(lines.join('\n') + '\n').digest('hex');
}

export function mintSeal(subjectDir: string, opts: { targets: SealTarget[]; bar: number; date?: string; note?: string }): Seal {
  const seal: Seal = {
    targets: opts.targets,
    bar: opts.bar,
    ...(opts.date ? { certifiedAt: opts.date } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    artifactHash: computeArtifactHash(subjectDir),
  };
  const shipDir = join(subjectDir, 'ship');
  mkdirSync(shipDir, { recursive: true });
  writeFileSync(join(shipDir, 'seal.json'), JSON.stringify(seal, null, 2) + '\n');
  return seal;
}

export interface SealVerification { ok: boolean; expected: string; actual: string; sealPath: string }

export function verifySeal(subjectDir: string): SealVerification {
  const sealPath = join(subjectDir, 'ship', 'seal.json');
  const seal = JSON.parse(readFileSync(sealPath, 'utf8')) as Seal;
  const actual = computeArtifactHash(subjectDir);
  return { ok: actual === seal.artifactHash, expected: seal.artifactHash, actual, sealPath };
}
