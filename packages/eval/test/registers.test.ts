import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(`/Users/marcos/Dev/js/looprun/looprun/${p}`, 'utf8');
const SPEC = read('docs/superpowers/specs/2026-08-20-declaration-and-emitter-design.md');
const PLAN = read('docs/superpowers/plans/2026-08-20-declaration-and-emitter.md');
const BACKLOG = read('docs/analysis/2026-08-20-skill-backlog.md');
const TRACE = read('docs/analysis/2026-08-20-finding-trace.md');

/** Ids are read from the FIRST COLUMN of a table row, never from prose: a row describing the
 *  SHIP sub-stage S2 contains that literal, and a checker reading free text invents a duplicate
 *  that is not there. */
const firstColumn = (block: string): Set<string> => {
  const out = new Set<string>();
  for (const line of block.split('\n')) {
    const m = /^\| ([A-Za-z0-9 -]+?) \|/.exec(line);
    if (!m) continue;
    for (const id of m[1].split(' ')) if (/^([A-Z]+\d+[a-z]?|G-[A-H])$/.test(id)) out.add(id);
  }
  return out;
};

const IN = firstColumn(SPEC.split('### 8.1')[1].split('### 8.2')[0]);
const OUT = firstColumn(SPEC.split('### 8.2')[1].split('### 8.3')[0]);

describe('the registers', () => {
  test('no id sits in both columns', () => {
    expect([...IN].filter(id => OUT.has(id))).toEqual([]);
  });

  test('every IN id has a plan task', () => {
    expect([...IN].filter(id => !new RegExp(`\\b${id}\\b`).test(PLAN))).toEqual([]);
  });

  test('every OUT id is in the backlog\'s deferred section', () => {
    const deferred = BACKLOG.split('## Deferred by the declaration spec')[1] ?? '';
    expect([...OUT].filter(id => !new RegExp(`\\b${id}\\b`).test(deferred))).toEqual([]);
  });

  test('every finding in the map carries an id from one of the two columns', () => {
    const headings = [...TRACE.matchAll(/^## ([A-Z]+\d+[a-z]?|G-[A-H]|W\d) —/gm)].map(m => m[1]);
    expect(headings.filter(id => !IN.has(id) && !OUT.has(id))).toEqual([]);
  });

  test('the map accounts for all eighty survivors', () => {
    expect(TRACE.split('\n').filter(l => /^\| \d+ \|/.test(l))).toHaveLength(80);
  });
});
