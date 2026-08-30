/** Three tenses. Owed reads are built from the disclosure needs recipes over the
 *  held call's OWN args, or over an EARLIER alias's answer — a value carrying a dot
 *  is a path into the alias it starts with, and the reads run in dependency order —
 *  and performed by the ENGINE — recorded, origin engine; never requested from the
 *  model, so no deny can starve them. This is the ONLY place the engine derives call
 *  arguments, and only as a declared rename of the frozen held call's own values or
 *  a declared path over a read the engine itself performed — a call whose args would
 *  take intent is model-filled. Slots fill by alias, bound to the question's target
 *  record by construction. A slot the reads answer nothing for REFUSES the call — an
 *  ask that cannot name its object is never asked; the card's empty sentence speaks,
 *  or the engine's plain default. */
import type { Act, CanonicalCallData, Json } from '../contract/vocabulary.js';

/** One engine-performed read of a disclosure entry: the args the held call fills
 *  now, and the paths an earlier alias's answer fills at run time. */
export interface OwedReadStep {
  readonly alias: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, Json>>;
  readonly argPaths?: Readonly<Record<string, string>>;
}
import { TurnFailure } from '../contract/vocabulary.js';
import type { CompiledAgent } from '../cards/cards.js';

export interface Tenses { readonly before: string | null;
                          readonly after: string | null;
                          readonly later: string | null }

function lookup(values: Readonly<Record<string, Json>>, path: readonly string[]): Json | undefined {
  let current: Json | undefined = values[path[0]];
  for (const step of path.slice(1)) {
    if (typeof current !== 'object' || current === null) return undefined;
    // A digits step reaches into a list: {result.holds.0.id} is the first row's id.
    if (Array.isArray(current)) {
      if (step.length === 0 || [...step].some(c => c < '0' || c > '9')) return undefined;
      current = current[Number(step)];
      continue;
    }
    current = (current as { readonly [k: string]: Json })[step];
  }
  return current;
}

/** Fills a rendered tense's remaining {result.*} slots from an executed call's
 *  result; a slot the result cannot fill leaves the text as it came. */
export function fillResultSlots(text: string, result: Json): string {
  try {
    return render(text, { result });
  } catch {
    return text;
  }
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

  /** The alias's bound value: the whole read result, or — when the recipe declares
   *  a pick — the ONE row of the list whose declared field equals the held call's
   *  declared argument. No match binds null, and the unanswered slot refuses
   *  through the empty sentence, as ever. */
  private bound(alias: string, needs: CompiledAgent['disclosureBindings'][string]['needs'],
                result: Json, call: CanonicalCallData): Json {
    const pick = needs[alias]?.pick;
    if (pick === undefined) return result;
    const rows = lookup({ r: result }, ['r', ...pick.list.split('.')]);
    if (!Array.isArray(rows)) return null;
    const wanted = call.args[pick.key];
    return rows.find(r => typeof r === 'object' && r !== null && !Array.isArray(r)
      && (r as { readonly [k: string]: Json })[pick.by] === wanted) ?? null;
  }

  owedReads(tool: string, call: CanonicalCallData): readonly OwedReadStep[] {
    const binding = this.bindings[tool];
    if (binding === undefined) return [];
    const needs = binding.needs;
    const refsOf = (alias: string): readonly string[] =>
      Object.values(needs[alias].args)
        .filter(v => v.includes('.')).map(v => v.slice(0, v.indexOf('.')))
        .filter(head => head in needs);
    const order: string[] = [];
    const pending = new Set(Object.keys(needs));
    let moved = true;
    while (moved) {
      moved = false;
      for (const alias of [...pending]) {
        if (refsOf(alias).every(head => order.includes(head))) {
          order.push(alias);
          pending.delete(alias);
          moved = true;
        }
      }
    }
    if (pending.size > 0) {
      throw new TurnFailure('construction',
        `disclosure needs of '${tool}' form a cycle over ${[...pending].join(', ')} — no order can run them`);
    }
    return order.map(alias => {
      const recipe = needs[alias];
      const args: Record<string, Json> = {};
      const argPaths: Record<string, string> = {};
      for (const [readArg, source] of Object.entries(recipe.args)) {
        if (source.includes('.')) argPaths[readArg] = source;
        else args[readArg] = call.args[source] ?? null;
      }
      return Object.keys(argPaths).length === 0
        ? { alias, tool: recipe.tool, args }
        : { alias, tool: recipe.tool, args, argPaths };
    });
  }

  /** A step's full arguments: the held-filled ones as they stand, and every declared
   *  path answered from the alias it starts with — read off the acts already run. */
  fillOwed(step: OwedReadStep, resolved: ReadonlyMap<string, Act>): Readonly<Record<string, Json>> {
    const args: Record<string, Json> = { ...step.args };
    for (const [readArg, source] of Object.entries(step.argPaths ?? {})) {
      const head = source.slice(0, source.indexOf('.'));
      const act = resolved.get(head);
      const value = act === undefined ? undefined
        : lookup({ [head]: act.result }, source.split('.'));
      args[readArg] = value ?? null;
    }
    return args;
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
    for (const [alias, act] of reads) values[alias] = this.bound(alias, binding.needs, act.result, call);
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
    for (const [alias, act] of reads) values[alias] = this.bound(alias, binding.needs, act.result, call);
    try {
      for (const tense of [binding.before, binding.after, binding.later]) {
        if (tense !== null) render(tense, values);
      }
      return null;
    } catch (failure) {
      // The slot that failed decides the sentence: an args-rooted slot is the
      // CALL missing its own argument — the records were never the problem, and
      // saying so would be false.
      const message = failure instanceof Error ? failure.message : '';
      const slotStart = message.indexOf("'{");
      const slot = slotStart >= 0 ? message.slice(slotStart + 2, message.indexOf("}'", slotStart)) : '';
      if (slot.startsWith('args.')) {
        return `the call is missing '${slot.slice(5)}' — the operator states it`;
      }
      try {
        return binding.empty !== null
          ? render(binding.empty, { args: call.args })
          : 'the records hold nothing for this call to act on';
      } catch {
        return 'the records hold nothing for this call to act on';
      }
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
    for (const [alias, act] of reads) values[alias] = this.bound(alias, binding.needs, act.result, call);
    const fill = (template: string | null): string | null =>
      template === null ? null : render(template, values);
    return { before: fill(binding.before), after: fill(binding.after), later: fill(binding.later) };
  }
}
