/** The deterministic second half of the bar, computed over a run's dumps and written
 *  beside the judge inputs. Letters ask whether a fact reached the operator; these
 *  counters ask whether the replies stayed whole — and both halves must hold. The
 *  language row counts the engine's own prose-reader refusals: the check runs at the
 *  seam where the delivered words exist, and the dump carries its verdicts. */
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
  readonly deskDeliveries: number;
  readonly deskRetries: number;
  readonly proseReaderRedrives: number;
  readonly languageMismatches: number;
}

export function computeCounters(dumps: readonly CaseDump[]): Counters {
  let emptyDeliveries = 0, framesLeaked = 0, rawJson = 0, readLinesDelivered = 0,
    twoOutcomes = 0, floorDeliveries = 0, proseDeliveries = 0, deskDeliveries = 0,
    deskRetries = 0, proseReaderRedrives = 0, languageMismatches = 0;
  for (const dump of dumps) {
    for (const r of dump.records) {
      const text = r.text;
      // A dump sealed before the marks existed reads as the floor it was.
      const delivery = r.delivery ?? { by: 'floor' as const, retried: false, facts: [] };
      if (text.trim() === '') emptyDeliveries += 1;
      if (delivery.by === 'floor') floorDeliveries += 1;
      if (delivery.by === 'prose') proseDeliveries += 1;
      if (delivery.by === 'desk') deskDeliveries += 1;
      if (delivery.retried) deskRetries += 1;
      // A delivery the desk wrote carrying an engine frame is a leak; the floor
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
      // The prose reader's own verdicts, read off the record: every refusal is a
      // redrive it demanded, and a language refusal is a mismatch it caught.
      for (const c of r.corrections) {
        if (c.kind !== 'proseReader') continue;
        proseReaderRedrives += 1;
        if (c.check === 'language') languageMismatches += 1;
      }
    }
  }
  return { emptyDeliveries, framesLeaked, rawJson, readLinesDelivered, twoOutcomes,
    floorDeliveries, proseDeliveries, deskDeliveries, deskRetries,
    proseReaderRedrives, languageMismatches };
}

export function writeCounters(runDir: string, dumps: readonly CaseDump[]): Counters {
  const counters = computeCounters(dumps);
  writeFileSync(join(runDir, 'counters.json'), JSON.stringify(counters, null, 1));
  return counters;
}
