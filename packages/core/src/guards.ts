/**
 * @looprun-ai/core — the typed guard-KIND library (framework-free).
 *
 * The guard vocabulary the agentspec skill authors. Each factory returns a {@link Guard}:
 * a deterministic `check()` (the machine gate) + an LLM-facing `prose()` (rendered into the trunk,
 * never read by the checker) — the prose+check pairing. Every predicate reads tool args / world
 * state / observed calls, NEVER the user text (the magnet firewall). The pure set is deterministic
 * by construction: no clock, no entropy, no network, no LLM call inside a check.
 *
 * DOMAIN-NEUTRALITY LAW (P8a): this package is truly language- and label-scheme-neutral. No generic
 * guard carries a linguistic regex (claim verbs, confirm-language) or a label scheme by default —
 * those STRINGS/REGEXES live in the business bundle's own lexicon and are passed back in as REQUIRED
 * params (`labelProvenance(field, expect, scheme)`, `noFabricatedSuccess(tool, { claimRe, labelRe,
 * verbClaimRe, reason })`, `pendingConfirmMustAsk({ askRe })`, `destructiveClaimRequiresSuccess(tools,
 * { claimRe, askRe, offerRe, exemptRe? })`, `noFalseFailureClaim({ claimRe })`). The runtime holds
 * only the MECHANISM and the generic English prose. A domain-neutrality lint scans this package for
 * accented letters / language stems, so a re-introduced default fails CI.
 */
import type { Guard, GuardCtx, ObservedCall, Dim, ReplyMutator, AgentWorld } from './rules.js';

// ── Custom (the agent-ruleset escape hatch) ──────────────────────────────────
export function custom(opts: {
  kind: string;
  dim: Dim;
  check: (ctx: GuardCtx) => string | null | Promise<string | null>;
  prose: () => string;
}): Guard {
  return { kind: opts.kind, dim: opts.dim, check: opts.check, prose: opts.prose };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const lc = (s: unknown): string => String(s ?? '').toLowerCase();
const ran = (observed: ObservedCall[], tool: string): boolean => observed.some((o) => o.name === tool && o.ok);
const ranThisTurn = (ctx: GuardCtx, tool: string): boolean =>
  ctx.observed.some((o) => o.name === tool && o.ok && o.turnIndex === ctx.turnIndex);

function resolveLabel(args: Record<string, unknown>, field: string): string | null {
  const v = args[field];
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && 'label' in (v as object)) {
    const l = (v as { label?: unknown }).label;
    return l == null ? null : String(l).trim() || null;
  }
  return null;
}

// ── SPATIAL (graph / sequencing) ─────────────────────────────────────────────

/** T may run only after EVERY dep has already run successfully this conversation. */
export function requiresBefore(deps: string[]): Guard {
  return {
    kind: 'requiresBefore',
    dim: 'spatial',
    check(ctx) {
      const missing = deps.filter((d) => !ran(ctx.observed, d));
      return missing.length ? `Do ${missing.join(' then ')} FIRST — it must run before this tool.` : null;
    },
    prose: () => `only after ${deps.join(' → ')} has run`,
  };
}

/** T is forbidden for this turn. */
export function forbidThisTurn(reason: string): Guard {
  return { kind: 'forbidThisTurn', dim: 'spatial', check: () => reason, prose: () => reason };
}

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
    prose: () => `always pass "${field}"`,
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

/** A label-typed arg must resolve to an EXISTING media label. */
export function labelExists(field: string): Guard {
  return {
    kind: 'labelExists',
    dim: 'input',
    check(ctx) {
      const w = ctx.world;
      const label = resolveLabel(ctx.args, field);
      if (label == null) return `Missing media label in "${field}".`;
      if (!w.hasMediaLabel(label)) {
        const known = w.mediaLabels();
        return `Label "${label}" does not exist in Recent Media. Use one the user referenced — available: ${known.join(', ') || '(none)'}. Do NOT invent a label.`;
      }
      return null;
    },
    prose: () => `"${field}" must be a real label from Recent Media (do not invent one)`,
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
      return re.test(v) ? null : msg;
    },
    prose: () => `"${field}" must match ${pattern}`,
  };
}

/**
 * A label-typed arg must come from the expected provenance class. The label SCHEME is business-owned
 * and injected — never hardcoded here: `scheme.uploadRe` is the predicate that decides whether a label
 * is an "uploaded" label; `scheme.labelNoun` (optional) names the scheme in the default deny/prose
 * message; `scheme.reason` overrides that message outright. The runtime carries ONLY the mechanism and
 * the generic English wording — the label regex + its noun live in the domain bundle's lexicon.
 */
export function labelProvenance(
  field: string,
  expect: 'uploaded' | 'generated',
  scheme: { uploadRe: RegExp; labelNoun?: string; reason?: string },
): Guard {
  const noun = scheme.labelNoun;
  const msg = scheme.reason ?? (expect === 'uploaded'
    ? `"${field}" must be an UPLOADED image label${noun ? ` (${noun})` : ''} — for generated images use the matching tool instead.`
    : `"${field}" must be a GENERATED image label — uploads${noun ? ` (${noun})` : ''} are not valid here.`);
  return {
    kind: 'labelProvenance',
    dim: 'input',
    check(ctx) {
      const v = ctx.args[field];
      const label = typeof v === 'string' ? v.trim()
        : (v && typeof v === 'object' && 'label' in (v as object)) ? String((v as { label?: unknown }).label ?? '').trim() : '';
      if (!label) return null;
      const isUp = scheme.uploadRe.test(label);
      return (expect === 'uploaded' ? isUp : !isUp) ? null : msg;
    },
    prose: () => msg,
  };
}

// ── RUN (execution preconditions) ────────────────────────────────────────────

/** Generic state precondition: the call is allowed only while `ok(world)` holds. `prose` states the
 *  CONDITION (always-rendered), separate from the deny `reason` (fires only when the condition is false). */
export function precondition<W extends AgentWorld = AgentWorld>(ok: (world: W) => boolean, reason: string, prose?: string): Guard {
  return {
    kind: 'precondition',
    dim: 'run',
    check: (ctx) => (ok(ctx.world as W) ? null : reason),
    prose: () => prose ?? reason,
  };
}

/** `tool` may run at most `n` times per turn (counts the model's OWN successful calls). */
export function maxCallsPerTurn(tool: string, n: number, reason: string): Guard {
  return {
    kind: 'maxCallsPerTurn',
    dim: 'run',
    check(ctx) {
      const count = ctx.observed.filter((o) => o.name === tool && o.ok && o.turnIndex === ctx.turnIndex).length;
      return count >= n ? reason : null;
    },
    prose: () => reason,
  };
}

/** Side-effect budget ACROSS turns (maxCallsPerTurn minus the turnIndex filter). */
export function maxCallsPerConversation(tool: string, n: number, reason: string): Guard {
  return {
    kind: 'maxCallsPerConversation',
    dim: 'run',
    check(ctx) {
      const count = ctx.observed.filter((o) => o.name === tool && o.ok).length;
      return count >= n ? reason : null;
    },
    prose: () => reason,
  };
}

/** Key-order-independent canonical fingerprint of a call's args. */
export function canonArgs(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonArgs).join(',')}]`;
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonArgs(rec[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Deny a call whose (tool, canonical args) already SUCCEEDED this turn. */
export function noDuplicateCall(): Guard {
  return {
    kind: 'noDuplicateCall',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      const key = canonArgs(ctx.args);
      const dupOk = ctx.observed.some(
        (o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === ctx.tool && canonArgs(o.args) === key,
      );
      return dupOk
        ? `You already called ${ctx.tool} with these EXACT arguments this turn and it succeeded — do not repeat it. Use the earlier result and move on (or reply to the user).`
        : null;
    },
    prose: () => 'never repeat a tool call that already succeeded with the same arguments',
  };
}

/** A destructive tool's `confirmed:true` is legal ONLY when its probe (confirmed absent/false) ran and
 *  took effect in an EARLIER turn — never confirm your own same-turn probe, never skip it. */
export function confirmFirst(argFlag = 'confirmed'): Guard {
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      if (ctx.args[argFlag] !== true) return null;
      const probe = ctx.observed.find(
        (o) => o.name === ctx.tool && o.ok && o.args?.[argFlag] !== true && o.turnIndex < ctx.turnIndex,
      );
      return probe
        ? null
        : `Do NOT pass ${argFlag}:true — first call ${ctx.tool} WITHOUT it, relay the confirmation question to the user, and only confirm in a LATER turn after the user agrees.`;
    },
    prose: () => `destructive actions need ${argFlag}:false first + the USER's explicit confirmation in a later turn`,
  };
}

/** Deny `tools` when an `askUser` call already succeeded THIS turn — ask, wait, act only in a LATER
 *  turn; a model must never confirm-and-execute in the same turn as its own question (a multi-tool
 *  step can call askUser and a destructive tool back-to-back, which reads as "asked" to a human but
 *  never gave the user a chance to answer). Reads observed/turnIndex only; magnet-safe. */
export function noActAfterAskSameTurn(tools: string[]): Guard {
  const set = new Set(tools);
  return {
    kind: 'noActAfterAskSameTurn',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      const askedThisTurn = ctx.observed.some(
        (o) => o.name === 'askUser' && o.ok && o.turnIndex === ctx.turnIndex,
      );
      return askedThisTurn
        ? 'You already asked the user a question this turn — wait for their answer; do not execute this action in the same turn as the question.'
        : null;
    },
    prose: () =>
      `never call ${tools.join(', ')} in the same turn as an askUser question — wait for the user's answer and act only in a LATER turn`,
  };
}

/** At most ONE successful destructive action per turn. */
export function destructiveThrottle(destructiveTools: string[]): Guard {
  const set = new Set(destructiveTools);
  return {
    kind: 'destructiveThrottle',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      const prior = ctx.observed.find((o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name));
      return prior
        ? `A destructive action (${prior.name}) already ran this turn — do NOT chain another destructive call. Reply to the user first.`
        : null;
    },
    prose: () => 'at most one destructive action per turn',
  };
}

// ── OUTPUT (postTool result invariant) ───────────────────────────────────────

export function resultInvariant<W extends AgentWorld = AgentWorld>(pred: (result: unknown, world: W) => boolean, reason: string): Guard {
  return {
    kind: 'resultInvariant',
    dim: 'output',
    check(ctx) {
      if (ctx.result === undefined) return null;
      return pred(ctx.result, ctx.world as W) ? null : reason;
    },
    prose: () => reason,
  };
}

// ── BEHAVIOR (reply-checks) ──────────────────────────────────────────────────

/**
 * If `tool` did NOT succeed this turn, the reply must not claim/imply it did (existence-keyed). Both
 * the label SCHEME (`labelRe` — which tokens are media labels) and the verb-first claim regex
 * (`verbClaimRe` — the "generating an image" phrasing) are business-owned and injected; the runtime
 * carries NO linguistic pattern of its own.
 */
export function noFabricatedSuccess(
  tool: string,
  opts: { claimRe: RegExp; labelRe: RegExp; verbClaimRe: RegExp; reason: string },
): Guard {
  return {
    kind: 'noFabricatedSuccess',
    dim: 'behavior',
    check(ctx) {
      if (ranThisTurn(ctx, tool)) return null;
      const reply = ctx.reply ?? '';
      const labels = reply.match(opts.labelRe) ?? [];
      const produced = ctx.producedThisTurn ?? [];
      const invented = labels.filter((l) => !produced.includes(l) && !ctx.world.hasMediaLabel(l));
      if (invented.length) return opts.reason;
      const claims = opts.claimRe.test(reply) || opts.verbClaimRe.test(reply);
      if (claims && labels.length === 0) return opts.reason;
      return null;
    },
    prose: () => opts.reason,
  };
}

/** The reply must contain at least one of `keywords` (case-insensitive). */
export function replyMustMention(keywords: string[], reason: string): Guard {
  return {
    kind: 'replyMustMention',
    dim: 'behavior',
    check(ctx) {
      const r = lc(ctx.reply);
      return keywords.some((k) => r.includes(lc(k))) ? null : reason;
    },
    prose: () => reason,
  };
}

/** At most `n` distinct CTA lemmas from `ctas` may appear. */
export function replyMaxOccurrences(ctas: string[], n: number, reason: string): Guard {
  return {
    kind: 'replyMaxOccurrences',
    dim: 'behavior',
    check(ctx) {
      const r = lc(ctx.reply);
      const distinct = ctas.filter((c) => r.includes(lc(c))).length;
      return distinct > n ? reason : null;
    },
    prose: () => reason,
  };
}

/** The reply must be a single short question (exactly one '?'). */
export function replySingleQuestion(reason: string): Guard {
  return {
    kind: 'replySingleQuestion',
    dim: 'behavior',
    check(ctx) {
      const questionMarks = ((ctx.reply ?? '').match(/\?/g) ?? []).length;
      return questionMarks === 1 ? null : reason;
    },
    prose: () => reason,
  };
}

/** The reply must not match a production-claim regex. */
export function replyNoProductionClaim(claimRe: RegExp, reason: string): Guard {
  return {
    kind: 'replyNoProductionClaim',
    dim: 'behavior',
    check(ctx) {
      return claimRe.test(ctx.reply ?? '') ? reason : null;
    },
    prose: () => reason,
  };
}

/** The reply must be non-empty and name ALL `labels`. */
export function replyConfirmsLabels(labels: string[], reason: string): Guard {
  return {
    kind: 'replyConfirmsLabels',
    dim: 'behavior',
    check(ctx) {
      const r = ctx.reply ?? '';
      if (r.trim() === '') return reason;
      return labels.every((l) => r.includes(l)) ? null : reason;
    },
    prose: () => reason,
  };
}

/** The final reply must be non-empty. */
export function emptyReply(): Guard {
  return {
    kind: 'emptyReply',
    dim: 'behavior',
    check(ctx) {
      return (ctx.reply ?? '').trim() === ''
        ? 'Your reply was EMPTY — produce the complete user-facing message now, in the user\'s language.'
        : null;
    },
    prose: () => 'never end a turn with an empty reply',
  };
}

/** A destructive PROBE returned requiresConfirmation this turn — the reply MUST relay the question.
 *  `askRe` (the "does this reply seek confirmation?" regex — a business-owned, language-specific
 *  pattern) is injected; the runtime holds no confirm-language of its own. */
export function pendingConfirmMustAsk(opts: { askRe: RegExp }): Guard {
  return {
    kind: 'pendingConfirmMustAsk',
    dim: 'behavior',
    check(ctx) {
      const pending = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.resultFlags?.requiresConfirmation);
      if (!pending) return null;
      return opts.askRe.test(ctx.reply ?? '')
        ? null
        : 'A confirmation is PENDING — relay the confirmation question to the user (your reply must ask it), and do not summarize the action as done.';
    },
    prose: () => 'when a tool asks for confirmation, relay that question to the user before anything else',
  };
}

/** Split a reply into sentences on ./!/? boundaries — pure, LANGUAGE-NEUTRAL (punctuation only; no
 *  stateful regex — split() takes no g/y flag, so there is no lastIndex to leak between calls). */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The reply claims a deletion/removal, but no destructive tool SUCCEEDED this turn (with exemptions for
 * the confirm-probe two-step and honest failure/negation reports). Sentence-scoped: a `claimRe` match is
 * ignored when its OWN sentence is a question, or carries an offer/conditional marker (`offerRe` — the
 * destructive verb is being OFFERED, not reported as done), so an offer earlier in the reply can never
 * mask a genuine declarative claim later. Every linguistic pattern — the destructive-claim regex, the
 * confirm-seeking `askRe`, the offer/conditional `offerRe`, and the optional `exemptRe` — is injected by
 * the domain bundle; the runtime supplies only the sentence-splitting mechanism and the English prose.
 */
export function destructiveClaimRequiresSuccess(
  destructiveTools: string[],
  opts: { claimRe: RegExp; askRe: RegExp; offerRe: RegExp; exemptRe?: RegExp },
): Guard {
  const { claimRe: re, askRe, offerRe, exemptRe } = opts;
  const set = new Set(destructiveTools);
  return {
    kind: 'destructiveClaimRequiresSuccess',
    dim: 'behavior',
    check(ctx) {
      const destructiveOk = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name) && o.args?.confirmed === true);
      if (destructiveOk) return null;
      const reply = ctx.reply ?? '';
      const probedThisTurn = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name) && o.args?.confirmed !== true);
      if (probedThisTurn && askRe.test(reply)) return null;
      if (exemptRe && exemptRe.test(reply)) return null;
      const declarativeClaim = splitSentences(reply).some(
        (sentence) => re.test(sentence) && !sentence.endsWith('?') && !offerRe.test(sentence),
      );
      return declarativeClaim
        ? 'Nothing destructive succeeded this turn — do not claim a deletion/removal happened. Report the actual state.'
        : null;
    },
    prose: () => 'never claim something was deleted/removed unless the destructive tool actually succeeded this turn',
  };
}

/** If every tool call this turn SUCCEEDED (and at least one ran), the reply may not claim inability.
 *  `claimRe` (the false-failure claim regex — a business-owned, language-specific pattern) is injected;
 *  the runtime holds no failure-language of its own. */
export function noFalseFailureClaim(opts: { claimRe: RegExp }): Guard {
  const claimRe = opts.claimRe;
  return {
    kind: 'noFalseFailureClaim',
    dim: 'behavior',
    check(ctx) {
      const thisTurn = ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex);
      if (!thisTurn.length || thisTurn.some((o) => !o.ok)) return null;
      return claimRe.test(ctx.reply ?? '')
        ? 'Every tool you called this turn SUCCEEDED — do not claim you could not do it. Report what was actually done, grounded in the tool results.'
        : null;
    },
    prose: () => 'never claim an action failed or that you are unable when your tool calls succeeded — report what actually happened',
  };
}

// ── Egress mutator ───────────────────────────────────────────────────────────

/** Deterministic egress jargon scrub (word-boundary, case-insensitive) before the reply leaves. */
export function jargonScrub(map: Record<string, string>): ReplyMutator {
  const entries = Object.entries(map).map(([from, to]) => ({ re: new RegExp(`\\b${from}\\b`, 'gi'), to }));
  return {
    kind: 'jargonScrub',
    apply(reply) {
      let out = reply;
      for (const { re, to } of entries) out = out.replace(re, to);
      return out;
    },
  };
}
