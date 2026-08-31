/** The prose reader at the seal: the delivered words, read against the turn's own
 *  record, on every path that composes prose — the floor's record lines are literal
 *  and are never read. Two refusals, both mechanical and both language-free: not one
 *  word of any language lives in this file, because the engine owns no vocabulary —
 *  the declaration's own rule text and the operator's own message are the only
 *  reference material.
 *
 *    1. a guard's rule text delivered on a turn that refused nothing — a rule states
 *       a CONDITION, and delivering it bare asserts the condition holds of the world
 *       (a byte-match against the declared rule, whatever language the declaration is
 *       written in). Two things stand outside it: a turn whose record carries a
 *       refusal is stating the condition it is actually in, and a rule the turn's own
 *       OWED FACTS carry is a sentence the engine demanded the reply express — the
 *       exemption reaches that rule and no other;
 *    2. a reply written in a different SCRIPT from the operator's own message — latin
 *       against cjk, cyrillic against greek. A script is a property of the code points
 *       themselves, so this refusal reads bytes and nothing else.
 *
 *  THE ACCEPTED LIMIT of check 2: two languages that share a script are the same class
 *  here, and a latin reply to a latin operator always passes — an English operator
 *  handed a Danish receipt is not caught. Nothing in the bytes separates them: measured
 *  over the transcripts, a character-trigram score puts a correct English reply at
 *  0.1687 and a wrong-language Portuguese reply at 0.1718, so any cut refuses good
 *  replies before it catches bad ones. Telling those two apart takes vocabulary, and a
 *  class that needs vocabulary belongs to the judged channel (`lieCheck`), where a desk
 *  opts in — never to engine matching.
 *
 *  What the reader deliberately does not hold: a claim of a read or an act the
 *  record lacks, a required sentence OMITTED, a tense lie beside a true fact, a
 *  refusal for the wrong reason. Detecting a claim takes words, words belong to a
 *  language, and the engine carries none — that whole class is the judged channel's
 *  (`lieCheck`), never a word list here. */
import type { Act } from '../contract/vocabulary.js';

export type ProseCheck = 'wallEcho' | 'language';

export interface ProseRefusal {
  readonly check: ProseCheck;
  /** The correction sentence the redrive carries — it teaches, it does not scold. */
  readonly sentence: string;
}

export interface ProseReading {
  readonly text: string;
  /** The operator's own words the reply is held against — see `languageReference`. */
  readonly userText: string;
  readonly acts: readonly Act[];
  /** The text of every fact this turn owes — what the engine itself demands the
   *  reply state. */
  readonly owed: readonly string[];
  /** Every compiled guard rule, deterministic and judged alike. */
  readonly rules: readonly string[];
}

/** Lowercase with every non-letter folded to one space — the comparison form for the
 *  rule byte-match. A letter is any character with case (the test that needs no
 *  alphabet table); caseless scripts fold away and their texts abstain by length. */
function foldedLetters(text: string): string {
  let out = '';
  let inSpace = true;
  for (const ch of text.toLowerCase()) {
    if (ch.toLowerCase() !== ch.toUpperCase()) { out += ch; inSpace = false; }
    else if (!inSpace) { out += ' '; inSpace = true; }
  }
  return out.trimEnd();
}

/** The caseless scripts by code point, each name covering the ranges its texts mix.
 *  CJK is ONE name on purpose: japanese writes han beside kana and korean writes
 *  hangul beside han, so splitting them would refuse a reply to the operator who
 *  wrote it. Cased scripts need no table — they answer the case test below. */
const CASELESS_SCRIPTS: readonly { readonly name: string;
                                   readonly from: number; readonly to: number }[] = [
  { name: 'hebrew', from: 0x0590, to: 0x05ff },
  { name: 'arabic', from: 0x0600, to: 0x06ff },
  { name: 'arabic', from: 0x0750, to: 0x077f },
  { name: 'devanagari', from: 0x0900, to: 0x097f },
  { name: 'bengali', from: 0x0980, to: 0x09ff },
  { name: 'thai', from: 0x0e00, to: 0x0e7f },
  { name: 'cjk', from: 0x1100, to: 0x11ff },
  { name: 'cjk', from: 0x3040, to: 0x30ff },
  { name: 'cjk', from: 0x3400, to: 0x4dbf },
  { name: 'cjk', from: 0x4e00, to: 0x9fff },
  { name: 'cjk', from: 0xac00, to: 0xd7af }
];

/** The cased scripts by code point. A character in one of these ranges that also has
 *  case is a letter of that script; the symbols sitting between the letters do not. */
const CASED_SCRIPTS: readonly { readonly name: string;
                                readonly from: number; readonly to: number }[] = [
  { name: 'latin', from: 0x0041, to: 0x024f },
  { name: 'greek', from: 0x0370, to: 0x03ff },
  { name: 'greek', from: 0x1f00, to: 0x1fff },
  { name: 'cyrillic', from: 0x0400, to: 0x052f },
  { name: 'georgian', from: 0x10a0, to: 0x10ff }
];

/** The script one character is written in, or null where it carries none — a digit, a
 *  space, a mark of punctuation, an emoji. */
function scriptOf(ch: string): string | null {
  const code = ch.codePointAt(0) ?? 0;
  const cased = ch.toLowerCase() !== ch.toUpperCase();
  if (cased) {
    for (const range of CASED_SCRIPTS) {
      if (code >= range.from && code <= range.to) return range.name;
    }
    return null;
  }
  for (const range of CASELESS_SCRIPTS) {
    if (code >= range.from && code <= range.to) return range.name;
  }
  return null;
}

/** Below this many letters a text names no script — the check abstains. */
const SCRIPT_FLOOR = 40;

/** The script a text is written in: the one carrying the most of its letters. Null
 *  where the text carries too few letters of any script to say — a bare code, an
 *  identifier, a figure. */
function dominantScript(text: string): string | null {
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of text) {
    const script = scriptOf(ch);
    if (script === null) continue;
    counts.set(script, (counts.get(script) ?? 0) + 1);
    letters += 1;
  }
  if (letters < SCRIPT_FLOOR) return null;
  let winner: string | null = null;
  let most = 0;
  for (const [script, count] of counts) {
    if (count > most) { winner = script; most = count; }
  }
  return winner;
}

/** A rule shorter than this is a phrase any honest reply could carry by accident. */
const RULE_ECHO_FLOOR = 24;

/** The operator's words a reply is held against: the LATEST message of theirs that
 *  carries enough letters to name a script. A turn whose whole message is an approval
 *  code carries no letters at all, and the script the conversation has been in is what
 *  the reply owes — the empty string only when the operator has never written words. */
export function languageReference(operatorTexts: readonly string[]): string {
  for (let i = operatorTexts.length - 1; i >= 0; i -= 1) {
    const text = operatorTexts[i];
    if (dominantScript(text) !== null) return text;
  }
  return '';
}

export function readProse(reading: ProseReading): ProseRefusal | null {
  const { text, userText, acts, owed, rules } = reading;
  if (text.trim() === '') return null;

  const refusalFrame = acts.some(a => a.status === 'not-done');
  if (!refusalFrame) {
    const prose = foldedLetters(text);
    const demanded = owed.map(foldedLetters);
    for (const rule of rules) {
      const bare = foldedLetters(rule);
      if (bare.length < RULE_ECHO_FLOOR || !prose.includes(bare)) continue;
      // The engine owes the desk this very sentence — an ask fact IS a guard's rule
      // text — so carrying it is obedience, not an assertion about the world.
      if (demanded.some(fact => fact.includes(bare))) continue;
      return { check: 'wallEcho', sentence:
        'the reply delivers a standing rule as if it described the current record — '
        + 'a rule states a condition; state only what the records of this turn show' };
    }
  }

  const operator = dominantScript(userText);
  const reply = dominantScript(text);
  if (operator !== null && reply !== null && operator !== reply) {
    return { check: 'language', sentence:
      'the reply is not written in the script of the operator\'s own message — '
      + 'write it in the language the operator used' };
  }

  return null;
}
