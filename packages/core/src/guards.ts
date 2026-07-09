/**
 * @looprun/core — the typed guard-KIND library (framework-free).
 *
 * The guard vocabulary the agentspec skill authors. Each factory returns a {@link Guard}:
 * a deterministic `check()` (the machine gate) + an LLM-facing `prose()` (rendered into the trunk,
 * never read by the checker) — the prose+check pairing. Every predicate reads tool args / world
 * state / observed calls, NEVER the user text (the magnet firewall). The pure set is deterministic
 * by construction: no clock, no entropy, no network, no LLM call inside a check.
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

/** Upload-range labels: i900+ (the attachment-sequence convention of media worlds). */
export function isUploadLabel(label: string): boolean {
  return /^i(9\d\d|\d{4,})$/i.test(label);
}

/** A label-typed arg must come from the expected provenance class (upload = i900+). */
export function labelProvenance(field: string, expect: 'uploaded' | 'generated', reason?: string): Guard {
  const msg = reason ?? (expect === 'uploaded'
    ? `"${field}" must be an UPLOADED image label (i900+) — for generated images use the matching tool instead.`
    : `"${field}" must be a GENERATED image label — uploads (i900+) are not valid here.`);
  return {
    kind: 'labelProvenance',
    dim: 'input',
    check(ctx) {
      const v = ctx.args[field];
      const label = typeof v === 'string' ? v.trim()
        : (v && typeof v === 'object' && 'label' in (v as object)) ? String((v as { label?: unknown }).label ?? '').trim() : '';
      if (!label) return null;
      const isUp = isUploadLabel(label);
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

const VERB_FIRST_CLAIM_RE = /(gerando|criando|preparando|gerei|criei|generating|creating)\s+(\w+\s+){0,2}(imagem|image)/i;

/** If `tool` did NOT succeed this turn, the reply must not claim/imply it did (existence-keyed). */
export function noFabricatedSuccess(tool: string, opts: { claimRe: RegExp; reason: string }): Guard {
  return {
    kind: 'noFabricatedSuccess',
    dim: 'behavior',
    check(ctx) {
      if (ranThisTurn(ctx, tool)) return null;
      const reply = ctx.reply ?? '';
      const labels = reply.match(/\bi\d{3,}\b/gi) ?? [];
      const produced = ctx.producedThisTurn ?? [];
      const invented = labels.filter((l) => !produced.includes(l) && !ctx.world.hasMediaLabel(l));
      if (invented.length) return opts.reason;
      const claims = opts.claimRe.test(reply) || VERB_FIRST_CLAIM_RE.test(reply);
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

// A reply "seeks confirmation" if it asks a question OR carries confirm-language (EN + pt/es).
const CONFIRM_ASK_RE =
  /\?|\b(confirm|are you sure|do you want|would you like|shall i|proceed\??|go ahead|confirma|confirmar|tem certeza|deseja|quer(?:es)?|gostaria|posso prosseguir|autoriz)/i;

/** A destructive PROBE returned requiresConfirmation this turn — the reply MUST relay the question. */
export function pendingConfirmMustAsk(): Guard {
  return {
    kind: 'pendingConfirmMustAsk',
    dim: 'behavior',
    check(ctx) {
      const pending = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.resultFlags?.requiresConfirmation);
      if (!pending) return null;
      return CONFIRM_ASK_RE.test(ctx.reply ?? '')
        ? null
        : 'A confirmation is PENDING — relay the confirmation question to the user (your reply must ask it), and do not summarize the action as done.';
    },
    prose: () => 'when a tool asks for confirmation, relay that question to the user before anything else',
  };
}

/** The reply claims a deletion/removal, but no destructive tool SUCCEEDED this turn (with exemptions
 *  for the confirm-probe two-step and honest failure/negation reports). */
export function destructiveClaimRequiresSuccess(destructiveTools: string[], claimRe?: RegExp, exemptRe?: RegExp): Guard {
  const re = claimRe ?? /(exclu[íi]d?[oa]?|apagad[oa]|apaguei|removid[oa]|removi|deletad[oa]|deleted|removed)/i;
  const set = new Set(destructiveTools);
  return {
    kind: 'destructiveClaimRequiresSuccess',
    dim: 'behavior',
    check(ctx) {
      const destructiveOk = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name) && o.args?.confirmed === true);
      if (destructiveOk) return null;
      const reply = ctx.reply ?? '';
      const probedThisTurn = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && set.has(o.name) && o.args?.confirmed !== true);
      if (probedThisTurn && CONFIRM_ASK_RE.test(reply)) return null;
      if (exemptRe && exemptRe.test(reply)) return null;
      return re.test(reply)
        ? 'Nothing destructive succeeded this turn — do not claim a deletion/removal happened. Report the actual state.'
        : null;
    },
    prose: () => 'never claim something was deleted/removed unless the destructive tool actually succeeded this turn',
  };
}

/** If every tool call this turn SUCCEEDED (and at least one ran), the reply may not claim inability. */
export function noFalseFailureClaim(): Guard {
  const claimRe = /(n[ãa]o (consigo|foi poss[íi]vel|posso)|infelizmente n[ãa]o|cannot|can'?t|unable to|falh(ou|a)|failed)[^.!?\n]{0,40}(atualiz|update|alter|salv|sav|configur|aplic|apply|cri(ar|ei)|creat|gerar|generat|aprend|learn)/i;
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
