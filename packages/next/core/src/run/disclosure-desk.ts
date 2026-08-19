/** Three tenses. Owed reads are built from the disclosure needs recipes over the
 *  held call's OWN args (an args map bridges differing names — validated at compile)
 *  and performed by the ENGINE — recorded, origin engine; never requested from the
 *  model, so no deny can starve them. This is the ONLY place the engine derives call
 *  arguments, and only as a declared rename of the frozen held call's own values —
 *  a call whose args would take intent is model-filled. Slots fill by alias, bound
 *  to the question's target record by construction. A slot the reads answer nothing
 *  for REFUSES the call — an ask that cannot name its object is never asked; the
 *  card's empty sentence speaks, or the engine's plain default. */
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
      // A {result.*} slot before the call has run has nothing to say yet: it
      // rides through literally and is filled when the executed result exists.
      if (slot.startsWith('result.') && !('result' in values)) {
        out += `{${slot}}`;
        slot = null;
        continue;
      }
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

  /** The declared cap, checked over the owed reads: when the call's named arg
   *  exceeds the value the read answered, the refusal sentence comes back
   *  rendered — the call never runs and never asks. Null = within the cap,
   *  no cap declared, or the arg is absent from the call. */
  overCap(tool: string, call: CanonicalCallData, reads: ReadonlyMap<string, Act>): string | null {
    const binding = this.bindings[tool];
    if (binding === undefined || binding.cap === null) return null;
    const argValue = call.args[binding.cap.arg];
    if (typeof argValue !== 'number') return null;
    const values: Record<string, Json> = { args: call.args };
    for (const [alias, act] of reads) values[alias] = act.result;
    const limit = lookup(values, binding.cap.at.split('.'));
    if (typeof limit !== 'number') {
      throw new TurnFailure('construction',
        `cap path '${binding.cap.at}' answered no number — the read does not serve the declared limit`);
    }
    if (argValue <= limit) return null;
    return render(binding.cap.refusal, values);
  }

  /** The empty-record refusal: when a declared tense finds no value in the
   *  reads and the held call's args, the ask cannot be written — the call is
   *  refused with the card's own empty sentence ({args.*} slots only) or the
   *  engine's plain default. Null = every tense fills. */
  emptyRefusal(tool: string, call: CanonicalCallData,
               reads: ReadonlyMap<string, Act>): string | null {
    const binding = this.bindings[tool];
    if (binding === undefined) return null;
    const values: Record<string, Json> = { args: call.args };
    for (const [alias, act] of reads) values[alias] = act.result;
    try {
      for (const tense of [binding.before, binding.after, binding.later]) {
        if (tense !== null) render(tense, values);
      }
      return null;
    } catch {
      return binding.empty !== null
        ? render(binding.empty, { args: call.args })
        : 'the records hold nothing for this call to act on';
    }
  }

  /** Fills the {result.*} slots of an already-rendered tense with the executed
   *  call's masked result. */
  withResult(text: string | null, result: Json): string | null {
    return text === null ? null : render(text, { result });
  }

  /** The after-tense of an ordinary done call, rendered from its own args and
   *  result. A sentence these two cannot fill is silent — never an error. */
  afterOf(tool: string, call: CanonicalCallData, result: Json): string | null {
    const binding = this.bindings[tool];
    if (binding === undefined || binding.after === null) return null;
    try {
      return render(binding.after, { args: call.args, result });
    } catch {
      return null;
    }
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
