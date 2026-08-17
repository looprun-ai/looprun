import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the packages/next tree — every structural lint scans this whole border. */
export const TREE_ROOT = join(fileURLToPath(import.meta.url), '../../../..');

export interface SourceFile {
  /** Path relative to the packages/next tree root, posix separators. */
  readonly rel: string;
  readonly text: string;
}

const CODE_EXT = ['.ts', '.js'];

export function sourceFiles(): readonly SourceFile[] {
  const out: SourceFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (CODE_EXT.some(ext => entry.name.endsWith(ext))) {
        out.push({ rel: relative(TREE_ROOT, full).replaceAll('\\', '/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  visit(TREE_ROOT);
  return out;
}

export function srcFiles(): readonly SourceFile[] {
  return sourceFiles().filter(f => f.rel.includes('/src/'));
}
