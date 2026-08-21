/** The worked template the agentspec skill hands an author, held to the gate the skill's own
 *  N6 checklist requires empty. An author copies this file to start a subject, so every finding
 *  it carries is a finding every subject starts life with.
 *
 *  The template is read as a subject directory: the lints walk the sibling repo's `references`
 *  folder, which is where the file an author copies actually lives. */
import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pairing, profile, unlicensed } from '../src/lints.js';

const REFERENCES = join(fileURLToPath(import.meta.url),
  '../../../../../agentspec/skill/references');

/** The acts the template declares that CHANGE a record — its two desk lanes minus the reads
 *  `listPlants` and `getPlant`. Every one of them owes a deterministic check. */
const ACTING = ['recordWatering', 'repot', 'discardPlant'];

describe.skipIf(!existsSync(REFERENCES))('the template the skill hands an author', () => {
  test('its WHY map licenses every rule it mints, and no rule it does not', () => {
    expect(unlicensed(REFERENCES)).toEqual([]);
  });

  test('no rule sits on the contract without an act', () => {
    expect(pairing(REFERENCES).filter(f => f.code === 'RULE_NEVER_RENDERED')).toEqual([]);
  });

  test('every acting tool it declares carries a check', () => {
    expect(profile(REFERENCES, ACTING).unchecked).toEqual([]);
  });
});
