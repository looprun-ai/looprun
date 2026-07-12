/**
 * DOMAIN-NEUTRALITY LAW (P8a) — the runtime packages (@looprun-ai/core + @looprun-ai/mastra src) carry
 * ZERO language-specific content. No generic guard may hardcode a linguistic regex (claim verbs,
 * confirm-language) or a label scheme; those STRINGS/REGEXES live in the business bundle's OWN lexicon
 * and are injected as required params. This lint scans the runtime source for (a) accented Latin letters
 * and (b) a stem list of the language words that a pre-P8a default would carry — it FIRES on the
 * pre-port guards.ts (gerando / confirma / quiser / apagad / í / ã …) and passes once they are gone.
 *
 * NOTE the × / ÷ symbols are NOT letters, so "~100× slower" in a doc comment is fine. This scans ONLY
 * the two runtime packages — example bundles legitimately own their language lexicons.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = join(HERE, '..', 'src');
const MASTRA_SRC = join(HERE, '..', '..', 'mastra', 'src');

const ACCENTED_LETTER = /[áàâãéêíóôõúüçñÁÀÂÃÉÊÍÓÔÕÚÜÇÑ]/;
// Language stems that a hardcoded pt/es default guard would carry (the words moved OUT of guards.ts).
const LINGUISTIC_STEM =
  /\b(exclu[íi]\w*|apagad\w*|apaguei|removid\w*|removi|gerand\w*|gerei|gerad\w*|criand\w*|criei|criad\w*|confirma|confirmar|quiser|desejar?|deseje|preferir|prefira|gostaria|infelizmente|poss[íi]vel|posso|podemos|atualiz\w*|aprend\w*)\b/i;

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('runtime domain-neutrality (P8a law)', () => {
  const files = [...listTs(CORE_SRC), ...listTs(MASTRA_SRC)];

  it('scans a non-empty runtime surface', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('the runtime packages carry no accented letter or language stem — inject those as guard params', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const a = ACCENTED_LETTER.exec(line);
        const s = LINGUISTIC_STEM.exec(line);
        if (a || s) offenders.push(`${relative(join(HERE, '..', '..'), f)}:${i + 1} ${a ? `accent "${a[0]}"` : ''}${s ? ` stem "${s[0]}"` : ''}`);
      });
    }
    expect(
      offenders,
      `linguistic content in the runtime — move the regex/wording to an example-owned lexicon and inject it as a guard param:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  // SELF-TEST: the lint must FIRE (a lint that cannot fail is no law).
  it('flags accents + language stems (self-test)', () => {
    expect(ACCENTED_LETTER.test('não foi possível')).toBe(true);
    expect(LINGUISTIC_STEM.test('gerando a imagem')).toBe(true);
    expect(LINGUISTIC_STEM.test('confirma a exclusão')).toBe(true);
    expect(ACCENTED_LETTER.test('a clean english sentence')).toBe(false);
    expect(LINGUISTIC_STEM.test('a clean english sentence')).toBe(false);
  });
});
