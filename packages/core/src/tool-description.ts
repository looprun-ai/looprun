/**
 * The COMPOSED tool description: the tool's declared business sentence, then — when any binding
 * targets the tool — a fixed heading and one bullet per resolved `prose()`, in priority order,
 * de-duplicated per tool. This is the channel a tool-scoped rule reaches the model through; the
 * assembled prompt carries only `target:'any'` sections. `prose()` is nullary, so the composition
 * is a pure function of (def, spec) and byte-stable across turns.
 */
import { resolveBindings } from './spec.js';
import type { AgentSpec, GuardBinding } from './spec.js';
import { proseKey, proseText } from './prompt-fold.js';

export const TOOL_RULES_HEADING = 'RULES YOU MUST FOLLOW TO CALL THIS TOOL';

export function composeToolDescription(def: { name: string; description: string }, spec: AgentSpec): string {
  const hookLists: Array<GuardBinding[] | undefined> = [
    spec.guards.preTool,
    spec.guards.postTool,
    spec.guards.onInput,
    spec.guards.onReply,
  ];
  const seenForTool = new Set<string>();
  const rules: string[] = [];
  for (const bindings of hookLists) {
    for (const b of resolveBindings(bindings)) {
      if (b.target === 'any' || !b.target.includes(def.name)) continue;
      const p = b.guard.prose();
      if (!p?.trim() || seenForTool.has(proseKey(p))) continue;
      seenForTool.add(proseKey(p));
      rules.push(proseText(p));
    }
  }
  if (!rules.length) return def.description;
  return `${def.description}\n\n${TOOL_RULES_HEADING}\n${rules.map((r) => `- ${r}`).join('\n')}`;
}
