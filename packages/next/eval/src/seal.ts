/** The SHIP seal: sha256 over EVERY governed artifact, enumerated from a walk of
 *  the subject directory — never a hand-kept list. verify answers the changed
 *  paths; any answer voids the seal. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface SealRecord {
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
}

function walk(dir: string, rel = ''): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules') continue;
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), childRel));
    else out.push(childRel);
  }
  return out;
}

export function seal(subjectDir: string): SealRecord {
  return { files: walk(subjectDir).map(path => ({ path,
    sha256: createHash('sha256').update(readFileSync(join(subjectDir, path))).digest('hex') })) };
}

export function verify(subjectDir: string, record: SealRecord): readonly string[] {
  const now = new Map(seal(subjectDir).files.map(f => [f.path, f.sha256]));
  const changed: string[] = [];
  for (const f of record.files) {
    if (now.get(f.path) !== f.sha256) changed.push(f.path);
    now.delete(f.path);
  }
  changed.push(...now.keys());
  return changed;
}
