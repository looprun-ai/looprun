/** ARGUMENT guards (`input` dim) — the rules a call's parameters must satisfy before it runs. */
import type { Guard } from '../rules.js';
import { matches } from './shared.js';

// ── INPUT (parameter rules) ──────────────────────────────────────────────────

/** Arg `field` must be present and non-empty. */
export function argRequired(field: string): Guard {
  return {
    kind: 'argRequired',
    dim: 'input',
    check(ctx) {
      const v = ctx.args[field];
      const empty = v == null || (typeof v === 'string' && v.trim() === '');
      return empty ? `Missing required argument "${field}". Provide it.` : null;
    },
    // PROSE⊂CHECK FIX: the prose read `always pass "<field>"`, but the check
    // also denies a PRESENT-and-blank value (`v.trim() === ''`). A model that passed `title: "   "` had
    // followed the sentence to the letter and was denied anyway — the shape this suite exists to catch.
    // The check is right (a blank required arg is a missing one); the prose now says so.
    prose: () => `always pass a real, non-empty "${field}"`,
  };
}

/** Arg `field` must NOT be present. */
export function argAbsent(field: string): Guard {
  return {
    kind: 'argAbsent',
    dim: 'input',
    check(ctx) {
      return field in ctx.args && ctx.args[field] != null ? `Do not pass "${field}" to this tool — remove it.` : null;
    },
    prose: () => `never pass "${field}" (it is not an argument of this tool)`,
  };
}

/** A PRESENT non-empty string arg must match `pattern`; absent/empty is left to argRequired. */
export function argFormat(field: string, pattern: string, flags?: string, reason?: string): Guard {
  const re = new RegExp(pattern, flags ?? '');
  const msg = reason ?? `Argument "${field}" is malformed — it must match ${pattern}. Use a REAL value (never invent one).`;
  return {
    kind: 'argFormat',
    dim: 'input',
    check(ctx) {
      const v = ctx.args[field];
      if (typeof v !== 'string' || v === '') return null;
      // `matches` (not re.test): `flags` is caller-supplied, so a 'g' would make the verdict alternate.
      return matches(re, v) ? null : msg;
    },
    prose: () => `"${field}" must match ${pattern}`,
  };
}
