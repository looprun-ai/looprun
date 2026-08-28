/** The deterministic second half of the bar, computed over a run's dumps and written
 *  beside the judge inputs. Letters ask whether a fact reached the operator; these
 *  counters ask whether the replies stayed whole — and both halves must hold. The
 *  language row is an informative heuristic (tiny stopword families), never a gate. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseDump } from './run-dir.js';

export interface Counters {
  readonly emptyDeliveries: number;
  readonly framesLeaked: number;
  readonly rawJson: number;
  readonly readLinesDelivered: number;
  readonly twoOutcomes: number;
  readonly floorDeliveries: number;
  readonly proseDeliveries: number;
  readonly composerDeliveries: number;
  readonly composerRetries: number;
  readonly languageMismatches: number;
}

const STOPWORDS: readonly { readonly family: string; readonly words: readonly string[] }[] = [
  { family: 'en', words: ['the', 'of', 'and', 'is', 'to', 'a'] },
  { family: 'pt', words: ['o', 'a', 'de', 'que', 'e', 'não', 'para'] },
  { family: 'es', words: ['el', 'la', 'de', 'que', 'y', 'no', 'para'] }
];

function tokensOf(text: string): readonly string[] {
  const tokens: string[] = [];
  let current = '';
  for (const ch of text.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z' || ch >= '\u00e0' && ch <= '\u00ff') current += ch;
    else { if (current !== '') tokens.push(current); current = ''; }
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

function familyOf(text: string): string | null {
  const tokens = tokensOf(text);
  let best: string | null = null;
  let bestHits = 0;
  for (const { family, words } of STOPWORDS) {
    const hits = tokens.filter(t => words.includes(t)).length;
    if (hits > bestHits) { best = family; bestHits = hits; }
  }
  return bestHits >= 2 ? best : null;
}

export function computeCounters(dumps: readonly CaseDump[]): Counters {
  let emptyDeliveries = 0, framesLeaked = 0, rawJson = 0, readLinesDelivered = 0,
    twoOutcomes = 0, floorDeliveries = 0, proseDeliveries = 0, composerDeliveries = 0,
    composerRetries = 0, languageMismatches = 0;
  for (const dump of dumps) {
    for (const r of dump.records) {
      const text = r.text;
      // A dump sealed before the marks existed reads as the floor it was.
      const delivery = r.delivery ?? { by: 'floor' as const, retried: false, facts: [] };
      if (text.trim() === '') emptyDeliveries += 1;
      if (delivery.by === 'floor') floorDeliveries += 1;
      if (delivery.by === 'prose') proseDeliveries += 1;
      if (delivery.by === 'composer') composerDeliveries += 1;
      if (delivery.retried) composerRetries += 1;
      // A composed or prose delivery carrying an engine frame is a leak; the floor
      // prints frames lawfully and is counted by its own row instead.
      if (delivery.by !== 'floor'
        && (text.includes('— done') || text.includes('— not-done') || text.includes('— held'))) {
        framesLeaked += 1;
      }
      if (delivery.by !== 'floor' && (text.includes('{"') || text.includes('[{'))) rawJson += 1;
      if (delivery.by !== 'floor'
        && r.acts.some(a => a.effect === 'read' && a.status === 'done'
          && a.sentence !== '' && text.includes(a.sentence))) {
        readLinesDelivered += 1;
      }
      const tools = new Set(r.acts.map(a => a.call.tool));
      for (const tool of tools) {
        const words = new Set(r.acts.filter(a => a.call.tool === tool)
          .map(a => (a.status === 'done' ? 'done' : 'not-done')));
        if (words.size > 1 && text.includes(tool)) twoOutcomes += 1;
      }
      const userFamily = familyOf(r.userText);
      const replyFamily = familyOf(text);
      if (userFamily !== null && replyFamily !== null && userFamily !== replyFamily) {
        languageMismatches += 1;
      }
    }
  }
  return { emptyDeliveries, framesLeaked, rawJson, readLinesDelivered, twoOutcomes,
    floorDeliveries, proseDeliveries, composerDeliveries, composerRetries,
    languageMismatches };
}

export function writeCounters(runDir: string, dumps: readonly CaseDump[]): Counters {
  const counters = computeCounters(dumps);
  writeFileSync(join(runDir, 'counters.json'), JSON.stringify(counters, null, 1));
  return counters;
}
