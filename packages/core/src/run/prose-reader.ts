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
 *    2. a reply that abandons the operator's language — measured as character-trigram
 *       profile similarity between the operator's message and the reply, the
 *       conversation itself being the language sample; texts too short to profile
 *       abstain, and sibling languages sit above the cut, so the check refuses only
 *       a wholesale departure.
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

/** Lowercase with every non-letter folded to one space — the comparison form for
 *  both checks. A letter is any character with case (the test that needs no
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

/** The character-trigram frequency profile of a folded text. */
function profileOf(folded: string): ReadonlyMap<string, number> {
  const profile = new Map<string, number>();
  const padded = ` ${folded} `;
  for (let i = 0; i + 3 <= padded.length; i++) {
    const gram = padded.slice(i, i + 3);
    profile.set(gram, (profile.get(gram) ?? 0) + 1);
  }
  return profile;
}

function cosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [gram, count] of a) {
    normA += count * count;
    const other = b.get(gram);
    if (other !== undefined) dot += count * other;
  }
  for (const [, count] of b) normB += count * count;
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
}

/** Below this many folded letters a text has no stable profile — the check abstains. */
const PROFILE_FLOOR = 40;
/** Same-language pairs profile far above this; sibling languages sit above it too.
 *  Only a wholesale departure from the operator's language falls under the cut. */
const LANGUAGE_CUT = 0.15;

/** A rule shorter than this is a phrase any honest reply could carry by accident. */
const RULE_ECHO_FLOOR = 24;

/** The operator's words a reply is held against: the LATEST message of theirs that
 *  carries enough letters to profile. A turn whose whole message is an approval code
 *  carries no letters at all, and the language the conversation has been in is what
 *  the reply owes — the empty string only when the operator has never written words. */
export function languageReference(operatorTexts: readonly string[]): string {
  for (let i = operatorTexts.length - 1; i >= 0; i -= 1) {
    const text = operatorTexts[i];
    if (foldedLetters(text).length >= PROFILE_FLOOR) return text;
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

  const operator = foldedLetters(userText);
  const reply = foldedLetters(text);
  if (operator.length >= PROFILE_FLOOR && reply.length >= PROFILE_FLOOR
    && cosine(profileOf(operator), profileOf(reply)) < LANGUAGE_CUT) {
    return { check: 'language', sentence:
      'the reply is not in the language of the operator\'s own message — '
      + 'write it in the language the operator used' };
  }

  return null;
}
