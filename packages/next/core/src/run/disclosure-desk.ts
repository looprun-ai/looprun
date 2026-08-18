/** Three tenses. Owed reads are built from the disclosure needs recipes over the
 *  held call's OWN args (an args map bridges differing names — validated at compile)
 *  and performed by the ENGINE — recorded, origin engine; never requested from the
 *  model, so no deny can starve them. This is the ONLY place the engine derives call
 *  arguments, and only as a declared rename of the frozen held call's own values —
 *  a call whose args would take intent is model-filled. Slots fill by alias, bound
 *  to the question's target record by construction. A slot no read filled is LOUD —
 *  compile proved derivability, so a hole here is an executor lie. */
import type { Act, CanonicalCallData, Json, OwedRead } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { CompiledAgent } from '../cards/cards.js';

export interface Tenses { readonly before: string | null;
                          readonly after: string | null;
                          readonly later: string | null }

function lookup(values: Readonly<Record<string, Json>>, path: readonly string[]): Json | undefined {
  let current: Json | undefined = values[path[0]];
  for (const step of path.slice(1)) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = (current as { readonly [k: string]: Json })[step];
  }
  return current;
}

function render(template: string, values: Readonly<Record<string, Json>>): string {
  let out = '';
  let slot: string | null = null;
  for (const c of template) {
    if (c === '{') { slot = ''; continue; }
    if (c === '}' && slot !== null) {
      const value = lookup(values, slot.split('.'));
      if (value === undefined || value === null) {
        throw new TurnFailure('construction',
          `disclosure slot '{${slot}}' has no value — the read did not supply it`);
      }
      out += typeof value === 'string' ? value : JSON.stringify(value);
      slot = null;
      continue;
    }
    if (slot !== null) slot += c;
    else out += c;
  }
  return out;
}

export class DisclosureDesk {
  private readonly bindings: CompiledAgent['disclosureBindings'];

  constructor(bindings: CompiledAgent['disclosureBindings']) {
    this.bindings = bindings;
  }

  owedReads(tool: string, call: CanonicalCallData): readonly OwedRead[] {
    const binding = this.bindings[tool];
    if (binding === undefined) return [];
    return Object.entries(binding.needs).map(([alias, recipe]) => ({
      alias,
      tool: recipe.tool,
      args: Object.fromEntries(Object.entries(recipe.args)
        .map(([readArg, heldArg]) => [readArg, call.args[heldArg] ?? null]))
    }));
  }

  /** All three tenses rendered at once, over the reads and the held call's args. */
  tenses(tool: string, call: CanonicalCallData, reads: ReadonlyMap<string, Act>): Tenses {
    const binding = this.bindings[tool];
    if (binding === undefined) return { before: null, after: null, later: null };
    const values: Record<string, Json> = { args: call.args };
    for (const [alias, act] of reads) values[alias] = act.result;
    const fill = (template: string | null): string | null =>
      template === null ? null : render(template, values);
    return { before: fill(binding.before), after: fill(binding.after), later: fill(binding.later) };
  }
}
