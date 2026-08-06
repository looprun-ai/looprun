/**
 * @looprun-ai/eval — spec-quality laws that hold for ANY looprun bundle, hand-written or generated.
 *
 * THE DIVIDING LINE. What lives here is a law about the ARTIFACT the engine runs: a guard that can
 * never fire, a tool nothing can execute, a sentence that names something absent, an ordering the
 * trunk asserts and nothing enforces. Authoring conventions of the generator skill — comment
 * markers, which layer a rule belongs to — are NOT here; they are the skill's opinions and they
 * ship with the skill.
 *
 * THE METHOD. Every check reads the ASSEMBLED objects: bindings, targets, `guard.meta`, the rendered
 * `prose()`. None of them re-encodes what a kind does by pattern-matching its call site. That
 * distinction is load-bearing — a source-text lint goes blind the moment a spec builds its surface
 * through a constant, and it stays silently green while the bundle rots.
 */
import { ARMED_SEAMS, CONFIRM_CLASS_KINDS, DENY_ONLY_PROSE_KINDS } from '@looprun-ai/core/internal';
import type { GuardBinding } from '@looprun-ai/core/internal';
import type { AgentSpec, ToolDef } from '@looprun-ai/core';

/** Tool names look like identifiers; ordinary English words do not. camelCase or snake_case only. */
const identifierShaped = (t: string): boolean => /[A-Z]/.test(t) || t.includes('_');

/** Surface tools whose NAME asserts an irreversible effect. Deliberately narrow — a wider net would
 *  flag ordinary verbs and the finding would be noise instead of a catch. */
const DESTRUCTIVE_NAME_RE = /^(delete|remove|disconnect|purge|destroy)/;

/** Prose written as an accusation about something already done, instead of a followable rule. */
const ACCUSATION_RES = [
  /\byou\s+(?:described|claimed|said|stated|wrote|mentioned|told|reported|promised|announced|indicated|implied)\b/i,
  /\bdid\s+not\s+succeed\b/i,
  /\bbut\b[^.!?]{0,90}?\bdid(?:n['’]t|\s+not)\b/i,
];

const active = (bs: GuardBinding[] | undefined): GuardBinding[] => (bs ?? []).filter((b) => !b.disabled);
const allBindings = (spec: AgentSpec): GuardBinding[] => [
  ...active(spec.guards.onInput), ...active(spec.guards.preTool),
  ...active(spec.guards.postTool), ...active(spec.guards.onReply),
];

/** Every sentence the model READS from this spec: guard prose + behaviour bullets. */
function renderedSentences(spec: AgentSpec): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const b of allBindings(spec)) {
    let text = '';
    try { text = b.guard.prose(); } catch { text = ''; }
    if (text) out.push({ where: `guard ${b.id}`, text });
  }
  (spec.behavior ?? []).forEach((text, i) => out.push({ where: `behavior[${i}]`, text }));
  return out;
}

/** The tools this spec has an ordering gate for: T → the tools that must precede it. */
function requiresGraph(spec: AgentSpec): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const b of active(spec.guards.preTool)) {
    const before = b.guard.meta?.before as string[] | undefined;
    if (!before?.length || b.target === 'any') continue;
    for (const tool of b.target) {
      if (!g.has(tool)) g.set(tool, new Set());
      for (const dep of before) g.get(tool)!.add(dep);
    }
  }
  return g;
}

/** Tools carrying ANY gate that could block them — used by the flow-edge and destructive checks. */
function gatedTools(spec: AgentSpec, kinds?: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const b of active(spec.guards.preTool)) {
    if (kinds && !kinds.includes(b.guard.kind)) continue;
    if (b.target === 'any') {
      for (const t of spec.surface.tools) out.add(t);
      continue;
    }
    for (const t of b.target) out.add(t);
  }
  return out;
}

/**
 * The spec-quality battery. `toolDefs` is the executable surface of the bundle — without it the
 * "does this tool exist" family is skipped rather than guessed at.
 */
export function lintSpecQuality(specs: Record<string, AgentSpec>, toolDefs: ToolDef[] = []): string[] {
  const out: string[] = [];
  const executable = new Set(toolDefs.map((t) => t.name));
  // The bundle's whole tool universe — a name known to SOME agent but absent HERE is the
  // out-of-scope case, which reads very differently from an invented name.
  const universe = new Set<string>([...executable]);
  for (const s of Object.values(specs ?? {})) for (const t of s.surface.tools) universe.add(t);

  for (const [id, spec] of Object.entries(specs ?? {})) {
    const surface = new Set(spec.surface.tools);
    const at = (rule: string, msg: string): void => { out.push(`spec "${id}": ${rule}: ${msg}`); };

    // ── SURFACE-UNRESOLVABLE — a tool the agent is told it has and nothing can execute.
    if (executable.size) {
      for (const t of spec.surface.tools) {
        if (!executable.has(t)) {
          at('SURFACE-UNRESOLVABLE', `'${t}' is on the surface but no tool definition provides it — the model is offered a tool no call can reach`);
        }
      }
    }

    // ── GUARD-TARGET-OFF-SURFACE — a guard bound to a tool this agent cannot call. It reads as
    //    coverage in the inventory and can never fire.
    for (const b of allBindings(spec)) {
      if (b.target === 'any') continue;
      for (const t of b.target) {
        if (!surface.has(t) && !executable.has(t)) {
          at('GUARD-TARGET-OFF-SURFACE', `guard ${b.id} targets '${t}', which is on no surface — the guard can never fire`);
        } else if (!surface.has(t)) {
          at('GUARD-TARGET-OFF-SURFACE', `guard ${b.id} targets '${t}', which is not on THIS agent's surface — the guard can never fire here`);
        }
      }
    }

    // ── PROSE-NAMES-ABSENT-TOOL — a sentence the model reads instructs a call it cannot make.
    //    Split by whether the name exists elsewhere: a sibling's tool is a scope leak, an unknown
    //    name is stale or invented. Both mislead; the repair differs.
    for (const { where, text } of renderedSentences(spec)) {
      const tokens = new Set((text.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) ?? []).filter(identifierShaped));
      for (const tok of tokens) {
        if (surface.has(tok)) continue;
        if (universe.has(tok)) {
          at('PROSE-ORDERS-OFF-SURFACE-CALL', `${where} names '${tok}', a tool of another agent — this spec cannot call it; name the owning team instead of the tool`);
        } else if (executable.size && /^(list|get|create|update|delete|remove|send|fetch|read|write|open|close|set|add)[A-Z]/.test(tok)) {
          at('PROSE-NAMES-ABSENT-TOOL', `${where} names '${tok}', which is on no surface in this bundle — a stale or invented tool name`);
        }
      }
    }

    // ── PROSE-ORDERING-WITHOUT-GATE — the trunk asserts an order and nothing enforces it. Either
    //    install the gate (the ordering is real) or drop the claim (it is not).
    const graph = requiresGraph(spec);
    for (const { where, text } of renderedSentences(spec)) {
      const pairs = [
        ...text.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:→|->)\s*([A-Za-z][A-Za-z0-9_]*)\b/g),
        ...text.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s+only\s+after\s+([A-Za-z][A-Za-z0-9_]*)\b/g),
      ];
      for (const m of pairs) {
        const isArrow = /→|->/.test(m[0]);
        const earlier = isArrow ? m[1] : m[2];
        const later = isArrow ? m[2] : m[1];
        if (!surface.has(earlier) || !surface.has(later)) continue;
        if (graph.get(later)?.has(earlier)) continue;
        at('PROSE-ORDERING-WITHOUT-GATE', `${where} declares '${earlier}' before '${later}' and no ordering gate on '${later}' enforces it — install requiresBefore(['${earlier}']) or stop asserting the order`);
      }
    }

    // ── FLOW-EDGE-WITHOUT-GATE — `spec.flow` renders as the strongest ordering sentence in the whole
    //    trunk ("do not skip a step"). An edge nothing enforces contradicts every rule that permits
    //    the downstream tool on its own, and the contradiction is invisible piece by piece.
    const gatedAny = gatedTools(spec);
    for (const edge of spec.flow ?? []) {
      if (graph.get(edge.to)?.has(edge.from)) continue;
      if (gatedAny.has(edge.to)) continue;
      at('FLOW-EDGE-WITHOUT-GATE', `flow declares '${edge.from}' → '${edge.to}', rendered as "do not skip a step", but no gate on '${edge.to}' enforces it — install the gate, or delete the edge if the ordering is conditional`);
    }

    // ── DESTRUCTIVE-WITHOUT-CONFIRM — a tool whose NAME asserts an irreversible effect, carrying no
    //    confirm-class gate. The constructor already throws when a DECLARED destructive tool is
    //    off-surface; nothing catches the one the author never declared.
    const confirmed = gatedTools(spec, CONFIRM_CLASS_KINDS);
    for (const t of spec.surface.tools) {
      if (!DESTRUCTIVE_NAME_RE.test(t) || confirmed.has(t)) continue;
      at('DESTRUCTIVE-WITHOUT-CONFIRM', `'${t}' names an irreversible action and carries no confirm-class guard (${CONFIRM_CLASS_KINDS.join('/')}) — add it to destructiveTools, or record why one call is safe`);
    }

    // ── PROSE-POSTHOC-ACCUSATION — prose() is read BEFORE the model acts. Written as an accusation
    //    it tells the model it already failed, which is a measured driver of over-caution. The kinds
    //    whose deny text is correctly post-hoc and never rendered are excluded by name.
    for (const b of allBindings(spec)) {
      if (DENY_ONLY_PROSE_KINDS.includes(b.guard.kind)) continue;
      let text = '';
      try { text = b.guard.prose(); } catch { continue; }
      const hit = ACCUSATION_RES.find((re) => re.test(text));
      if (hit) {
        at('PROSE-POSTHOC-ACCUSATION', `guard ${b.id} renders a past-tense accusation ("${text.slice(0, 70).trim()}…") — prose is what the model reads BEFORE acting; state the rule to follow and leave the accusation to the deny reason`);
      }
    }

    // ── ARMED-SEAM-WITHOUT-PROSE — a seam whose forbidden thing is an arbitrary domain regex has no
    //    derivable sentence. Arming it with no companion prose corrects the model for a rule it was
    //    never given. Read from `guard.meta.armed`, which the kind records itself.
    for (const b of allBindings(spec)) {
      const armed = (b.guard.meta?.armed ?? undefined) as Record<string, boolean> | undefined;
      if (!armed) continue;
      for (const seam of ARMED_SEAMS) {
        if (seam.kind !== b.guard.kind) continue;
        if (armed[seam.seam] && !armed[seam.prose]) {
          at('ARMED-SEAM-WITHOUT-PROSE', `guard ${b.id} variants '${seam.seam}' with no '${seam.prose}' — the pattern is a domain regex the runtime cannot put into words, so the model is vetoed by a rule it never received`);
        }
      }
    }
  }
  return out;
}
