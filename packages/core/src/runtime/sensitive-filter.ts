/**
 * @looprun-ai/core runtime — the SENSITIVE-DATA FILTER.
 *
 * The executor is not trusted to hide anything from the model's context — this filter runs on our
 * side of the boundary, over whatever a tool call returns or sends. Two independent shapes of
 * removal:
 *
 *   · {@link filterSensitiveFields} — a DECLARED field, deleted or masked wherever its dot-suffix
 *     path matches, regardless of the value's shape. For a field the caller named on purpose.
 *   · {@link scrubText} — a PATTERN scrub over free text, for the field nobody named because its
 *     purpose is prose, not contact data (a note, a description) but which drifts into carrying an
 *     email or a card number anyway. Names and addresses are the assumed residue: no pattern here
 *     claims to catch them.
 *
 * Both are pure: neither reads nor mutates anything outside its argument.
 */

export type SensitiveMode = 'omit' | 'mask';

/** The stub a removal leaves behind: enough to say "a value was here", never enough to carry it. */
const MASKED = '•••';

/** `s[0]•••` with the domain preserved for an email-shaped value: `'o•••@northside.example'`. A
 *  value with no `@` masks to its first character plus the same three dots, so the shape stays
 *  recognizable as "a value was here" without carrying any of it. */
export function maskValue(s: string): string {
  const at = s.indexOf('@');
  if (at > 0) return `${s[0]}${MASKED}${s.slice(at)}`;
  return s.length > 0 ? `${s[0]}${MASKED}` : s;
}

/**
 * Immutable deep walk over `value`: returns a NEW value with every field whose path matches a
 * `fields` entry omitted or masked. `fields` keys are dot-suffix paths over object keys —
 * `'customer.phone'` matches a `phone` key directly under a `customer` object anywhere in the
 * result (array indices are not part of the path, so the same rule reaches a `phone` inside
 * `items[].customer.phone` too); a bare `'phone'` matches any `phone` key at any depth.
 *
 * A masked field is masked WHATEVER IT HOLDS. Only a string has a shape worth preserving, so only a
 * string keeps its first character and its domain; every other value — a number, a list, a nested
 * object — becomes the bare stub, and the walk stops there rather than descending into it.
 *
 * ```
 *   filterSensitiveFields(
 *     { customer: { phone: '555-0199', name: 'Ana' } },
 *     { 'customer.phone': 'omit' },
 *   )
 *   → { customer: { name: 'Ana' } }
 *
 *   filterSensitiveFields({ phone: 4155550199 }, { phone: 'mask' })
 *   → { phone: '•••' }
 * ```
 */
export function filterSensitiveFields(value: unknown, fields: Record<string, SensitiveMode>): unknown {
  const rules = Object.entries(fields).map(([path, mode]) => ({ parts: path.split('.'), mode }));
  const matches = (path: string[]) =>
    rules.find(
      (r) => r.parts.length <= path.length && r.parts.every((p, i) => p === path[path.length - r.parts.length + i]),
    );
  const walk = (v: unknown, path: string[]): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, path));
    if (v === null || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const hit = matches([...path, k]);
      if (hit?.mode === 'omit') continue;
      if (hit?.mode === 'mask') {
        out[k] = typeof x === 'string' ? maskValue(x) : MASKED;
        continue;
      }
      out[k] = walk(x, [...path, k]);
    }
    return out;
  };
  return walk(value, []);
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// An ISO-shaped date (`2026-08-03`) has the same digit-group-separator shape as a phone number —
// excluded so a date is never read as one.
const DATE_SHAPE = /^\d{4}[-./]\d{2}[-./]\d{2}$/;
// Conservative: a leading country code, or three or more separator-joined digit groups. A bare run
// of digits (an invoice total, an id) carries no separator and never matches.
const PHONE = /\+\d{1,3}(?:[\s.-]?\d){6,14}|\b\d{2,4}[\s.-]\d{2,4}[\s.-]\d{2,9}\b/g;
// Capturing so `String.split` carries the matched run itself through the split — a card-shaped run,
// Luhn-valid or not, is never a phone number and must not reach the phone pass at all.
const CARD_SPLIT = /(\b(?:\d[ -]?){13,19}\b)/g;

function luhnValid(run: string): boolean {
  const digits = run.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/**
 * Pattern scrub for free text: emails, Luhn-valid card numbers, and conservative phone shapes
 * (`+country…` or 7+ digits in separator-joined groups) each mask to `'•••'`. Splitting on a
 * card-shaped run first, and running the phone pass only over what is left, keeps a failed-Luhn
 * card's digit groups from being reread as a phone number.
 *
 * ```
 *   scrubText('mail ops@x.example or +1 415 555 0199')
 *   → 'mail ••• or •••'
 *
 *   scrubText('invoice inv_7001 total 2930 on 2026-08-03')
 *   → 'invoice inv_7001 total 2930 on 2026-08-03'   // no separator-joined run, no date reread as one
 * ```
 */
export function scrubText(text: string): string {
  const scrubOne = (part: string): string =>
    part.replace(EMAIL, MASKED).replace(PHONE, (m) => (DATE_SHAPE.test(m) ? m : MASKED));
  return text
    .split(CARD_SPLIT)
    .map((part, i) => (i % 2 === 1 ? (luhnValid(part) ? MASKED : part) : scrubOne(part)))
    .join('');
}
