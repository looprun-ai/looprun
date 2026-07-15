/**
 * Shared helpers for the governance proof tooling (record parsing + matrix rendering).
 * Pure node, no dependencies. Imported by make-record.mjs and gen-matrix.mjs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/** Today as YYYY-MM-DD in UTC (deterministic, no locale). */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Escape a value so it is safe inside a Markdown table cell. */
export function cell(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/**
 * Parse the FLAT frontmatter of a record file: `key: value` lines between two `---` fences.
 * No YAML library — the contract is deliberately flat (string values, no nesting).
 * Throws an Error (with the file name) when the fences are missing or malformed.
 */
export function parseFrontmatter(text, name = '<string>') {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') {
    throw new Error(`${name}: missing opening '---' frontmatter fence`);
  }
  const data = {};
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      closed = true;
      break;
    }
    if (line.trim() === '') continue;
    const idx = line.indexOf(':');
    if (idx === -1) {
      throw new Error(`${name}: malformed frontmatter line (no ':'): ${line.trim().slice(0, 60)}`);
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) throw new Error(`${name}: malformed frontmatter line (empty key): ${line.trim().slice(0, 60)}`);
    data[key] = value;
  }
  if (!closed) throw new Error(`${name}: missing closing '---' frontmatter fence`);
  return data;
}

/** The frontmatter keys every record must carry. */
export const REQUIRED_KEYS = [
  'date',
  'slug',
  'change_kind',
  'target',
  'summary',
  'isolated',
  'collective',
  'coverage',
  'slm_canary',
  'verdict',
  'suite_cmd',
];

/** Read + parse every governance/proofs/*.md record. Throws (naming the file) on a malformed one. */
export function readRecords(proofsDir) {
  if (!existsSync(proofsDir)) return [];
  const files = readdirSync(proofsDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();
  const records = [];
  for (const file of files) {
    const text = readFileSync(join(proofsDir, file), 'utf8');
    const data = parseFrontmatter(text, file);
    const missing = REQUIRED_KEYS.filter((k) => !(k in data));
    if (missing.length) {
      throw new Error(`${file}: frontmatter missing required key(s): ${missing.join(', ')}`);
    }
    records.push({ file, slug: data.slug || basename(file, '.md'), data });
  }
  return records;
}

/** The scope label shown in the matrix: `guard:<kind>` for a guard change, otherwise the change kind. */
export function scopeLabel(data) {
  const kind = data.change_kind;
  if (kind === 'guard' && data.target && data.target !== '—') return `guard:${data.target}`;
  return kind;
}

const MATRIX_HEADER =
  '<!-- GENERATED — do not edit by hand; run `pnpm proofs:matrix`. -->\n' +
  '# Proof record matrix\n\n' +
  'One row per governance proof record (`governance/proofs/*.md`), sorted date DESC then slug ASC.\n' +
  'Regenerate with `pnpm proofs:matrix`; CI runs `--check` to keep it in sync.\n\n';

const TABLE_HEAD =
  '| Date | Record | Change | Scope | Isolated | Collective | Coverage | SLM canary | Verdict |\n' +
  '|---|---|---|---|---|---|---|---|---|\n';

/** Render the full MATRIX.md content deterministically from a record list. */
export function renderMatrix(records) {
  const sorted = [...records].sort(
    (a, b) => b.data.date.localeCompare(a.data.date) || a.slug.localeCompare(b.slug),
  );
  let out = MATRIX_HEADER + TABLE_HEAD;
  for (const r of sorted) {
    const d = r.data;
    const rec = `[${cell(r.slug)}](proofs/${r.file})`;
    out +=
      `| ${cell(d.date)} | ${rec} | ${cell(d.summary)} | ${cell(scopeLabel(d))} | ` +
      `${cell(d.isolated)} | ${cell(d.collective)} | ${cell(d.coverage)} | ` +
      `${cell(d.slm_canary)} | ${cell(d.verdict)} |\n`;
  }
  return out;
}
