/**
 * THE MATCHING LAW — the one comparison every verdict that must decide "is this string THAT string"
 * routes through: claim-to-ledger grounding, consent-token consumption, and a value the agent records on
 * the user's behalf.
 *
 * Two shapes over one canonical form. {@link targetMatchesValue} compares a target to ONE value.
 * {@link valueSpokenBy} looks for a value inside a person's sentence, as a CONTIGUOUS run of whole
 * tokens — never as a substring, because a substring lets one identifier stand for another:
 *
 * ```
 *   user says      "cancel the BK-12"
 *   pending token  CONFIRM BK-1
 *   substring      "BK-1" occurs inside "BK-12" → consent accepted for the wrong record
 * ```
 */

/** EDGE punctuation — everything that is neither a letter, a digit, nor an INVISIBLE format character.
 *  Format characters (`\p{Cf}`: bidi controls, zero-width marks) are deliberately NOT stripped: stripping
 *  them would let an agent decorate a real id with an invisible control that the renderer then prints
 *  into the user-facing report while the match still succeeds. They fail CLOSED, exactly like a unicode
 *  lookalike dash. */
const LEADING_PUNCT = /^[^\p{L}\p{N}\p{Cf}]+/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}\p{Cf}]+$/u;

/** Is this single code point ASCII? */
function isAscii(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) < 128;
}

/**
 * CASE FOLD that never changes SCRIPT. `String.prototype.toLowerCase` maps some non-ASCII lookalikes
 * ONTO ASCII — KELVIN SIGN U+212A folds to `k` — so under a plain lowercase a target spelled with the
 * lookalike would match the real ASCII id while the renderer printed the lookalike back to the user. A
 * fold that would cross into ASCII keeps the original character instead, so lookalikes fail closed like
 * the unicode dashes, and ordinary case folding (`BK-1` ⇄ `bk-1`, and every non-ASCII letter with its own
 * lowercase in the same script) is untouched.
 */
function foldCase(v: string): string {
  let out = '';
  for (const ch of v) {
    const lower = ch.toLowerCase();
    out += lower.length === 1 && isAscii(lower) && !isAscii(ch) ? ch : lower;
  }
  return out;
}

/** The CANONICAL comparison form of one value: trimmed, case-folded, EDGE punctuation stripped — so
 *  `"(BK-1)"`, `"BK-1."` and `"  bk-1  "` all canonicalize to `bk-1`, while `BK-1-EXTRA` does not. */
export function canonValue(v: string): string {
  return foldCase(v.trim()).replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/**
 * THE BOUNDARY — is `target` the WHOLE of `value`? The one boundary predicate every grounding, coverage
 * and rubric verdict routes through.
 *
 * Match ⇔ the canonical forms are EQUAL. Nothing else: no substring, no authored pattern, no token-run
 * scan. A token run would match an id the world named inside its own SENTENCE, and that is precisely
 * what lets one word of an entity stand for the entity (`'12'` grounding and COVERING `Order 12`, and
 * equally `Invoice 12`) and what lets a status word or a note fragment cover a write. Identity is
 * key-scoped, so the values on the other side are ids and labels rather than prose, and whole-value
 * equality is the honest comparison for them. A target that canonicalizes to nothing (punctuation only)
 * matches nothing.
 */
export function targetMatchesValue(target: string, value: string): boolean {
  const t = canonValue(target);
  if (!t) return false;
  return t === canonValue(value);
}

/** A person's sentence reduced to canonical tokens: split on WHITESPACE — never on punctuation, which
 *  would tear `marcos@x.com` into three pieces — each token canonicalized, empties dropped. */
function speechTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/u)) {
    const t = canonValue(raw);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Did the person SAY this value?
 *
 * True when the value's token sequence appears CONTIGUOUS in the text, each token equal as a WHOLE. The
 * other side of this comparison is a person's free sentence rather than a world-issued id, so the value
 * may span several words — but every one of them must be whole and they must be adjacent, which is what
 * keeps `BK-1` out of `BK-12` and keeps a scattered coincidence of words from counting as something the
 * person said.
 *
 * ```
 *   "my email is marcos@x.com."       marcos@x.com          ✅
 *   "cancel the BK-12"                BK-1                  ❌
 *   "the engine, I think, locked up"  the engine locked up  ❌  (not contiguous)
 * ```
 *
 * A value that canonicalizes to no tokens is said by nothing.
 */
export function valueSpokenBy(value: string, text: string): boolean {
  const want = speechTokens(value);
  if (!want.length) return false;
  const said = speechTokens(text);
  for (let i = 0; i + want.length <= said.length; i += 1) {
    let all = true;
    for (let j = 0; j < want.length; j += 1) {
      if (said[i + j] !== want[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}
