import type { Json, SurfaceFacts, ToolFact } from '@looprun-ai/core';
import type { Declaration } from './declaration.js';

/** The property names an act's JSON schema declares as arguments — a schema with no
 *  `properties` block accepts nothing. */
function schemaArgs(fact: ToolFact | undefined): readonly string[] {
  const schema = fact?.schema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [];
  const properties = (schema as { readonly properties?: Json }).properties;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

/** The smallest number of single-character edits — insert, delete, substitute — that turns
 *  `a` into `b`, used only to name a near miss in a refusal sentence. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The candidate closest to `name` by edit distance, or null when there are no candidates. Every
 *  refusal that names a near miss reads it from here: a tool name against the surface's acts, an
 *  argument name against one act's own schema. */
function closestName(name: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

/** Every guard names acts the surface actually declares — a typo names no tool, and the
 *  emitter refuses to write a card that wires a call that does not exist. */
function checkGuardActsExist(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    guard.acts.forEach((act, actIndex) => {
      if (facts.tools[act] !== undefined) return;
      const near = closestName(act, toolNames);
      const suggestion = near === null ? '' : ` — did you mean '${near}'?`;
      refusals.push(`contract.guards[${guardIndex}].acts[${actIndex}] names '${act}', `
        + `and the surface declares no such act${suggestion}`);
    });
  });
  return refusals;
}

/** The arguments that name an ACT rather than configure one. A factory is pointed at the act it
 *  covers through `acts`, and some are pointed at a second act through their configuration — the
 *  prerequisite `onlyAfter` waits for. Both name the same namespace, `facts.tools`. */
const ACT_ARGS: Readonly<Record<string, readonly string[]>> = { onlyAfter: ['after'] };

/** Every act a guard's CONFIGURATION names exists on the surface. A prerequisite spelled one
 *  letter off is never a call anyone can make, so the guard it configures denies the act it
 *  covers on every turn for the whole conversation, and no lint downstream sees it: the act does
 *  carry a check, and the check is simply unsatisfiable. */
function checkGuardArgActsExist(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    for (const argName of ACT_ARGS[guard.factory] ?? []) {
      const named = guard.args?.[argName];
      if (typeof named !== 'string' || facts.tools[named] !== undefined) continue;
      const near = closestName(named, toolNames);
      const suggestion = near === null ? '' : ` — did you mean '${near}'?`;
      refusals.push(`contract.guards[${guardIndex}].args.${argName} names '${named}', `
        + `and the surface declares no such act${suggestion}`);
    }
  });
  return refusals;
}

/** The arguments that name an ARGUMENT OF THE ACT rather than a second act. Both factories that
 *  read one read it off the arriving call, so the name is spelled against that act's own schema. */
const SCHEMA_ARGS: Readonly<Record<string, readonly string[]>> = {
  valueFromUser: ['arg'],
  argFormat: ['arg']
};

/** Every argument a guard's CONFIGURATION names is an argument the act itself declares. A guard
 *  pointed at an argument outside the act's schema reads `undefined` on every arriving call, and
 *  both factories that read one refuse when they find nothing there — so the guard denies its own
 *  act for the whole conversation, and no lint downstream sees it: the act does carry a check, and
 *  the check can never pass. */
function checkGuardArgsOnSchema(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    for (const argName of SCHEMA_ARGS[guard.factory] ?? []) {
      const named = guard.args?.[argName];
      if (typeof named !== 'string') continue;
      for (const act of guard.acts) {
        const fact = facts.tools[act];
        if (fact === undefined) continue;
        const declared = schemaArgs(fact);
        if (declared.includes(named)) continue;
        const accepts = declared.length === 0 ? 'no argument at all'
          : declared.map(arg => `'${arg}'`).join(', ');
        const near = closestName(named, declared);
        const suggestion = near === null ? '' : ` Did you mean '${near}'?`;
        refusals.push(`contract.guards[${guardIndex}].args.${argName} names '${named}', `
          + `and '${act}' accepts ${accepts} — pointed at an argument its act does not carry, `
          + `the guard refuses every call of it.${suggestion}`);
      }
    }
  });
  return refusals;
}

/** Every destructive act carries a disclosure with a `before` sentence — a destructive act
 *  with nothing declared before it runs is not disclosed, it is silent. */
function checkDestructiveDisclosed(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  for (const fact of Object.values(facts.tools)) {
    if (fact.effect !== 'destructive') continue;
    if (declaration.contract.disclosure[fact.name]?.before !== undefined) continue;
    refusals.push(`contract.disclosure.${fact.name} is missing: ${fact.name} is destructive `
      + `and declares no \`before\` — add one naming what must be confirmed first.`);
  }
  return refusals;
}

/** A `precondition` guard reading `args.reads: 'record'` names an act with a target record
 *  to read — an act with no target has no record for the guard to read. */
function checkPreconditionTarget(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    if (guard.factory !== 'precondition' || guard.args?.reads !== 'record') return;
    for (const act of guard.acts) {
      const fact = facts.tools[act];
      if (fact === undefined || fact.target !== null) continue;
      refusals.push(`contract.guards[${guardIndex}] reads args.reads: 'record' over '${act}', `
        + `and ${act} declares no target — point the guard at an act with a target, or drop the record read.`);
    }
  });
  return refusals;
}

/** Every desk teaches the same conduct laws — a law taught on one desk and silent on
 *  another is a rule the user hears from one seat and never learns at the next. */
function checkConductUniform(declaration: Declaration): readonly string[] {
  const desks = declaration.desks;
  const allLaws = new Set<string>();
  for (const desk of desks) for (const law of Object.keys(desk.conduct)) allLaws.add(law);
  const refusals: string[] = [];
  for (const law of allLaws) {
    const teaching = desks.filter(desk => desk.conduct[law] !== undefined);
    const silent = desks.filter(desk => desk.conduct[law] === undefined);
    if (silent.length === 0) continue;
    const desksWord = teaching.length === 1 ? 'desk' : 'desks';
    refusals.push(`desks[*].conduct: '${law}' is on ${teaching.length} ${desksWord} `
      + `and missing from ${silent.map(desk => desk.name).join(', ')} — `
      + `give every desk the same conduct laws.`);
  }
  return refusals;
}

/** A disclosure `needs` alias names a tool the surface actually declares — checked for
 *  every alias regardless of the held act's target, because a typo names no tool no
 *  matter what the destructive act it discloses looks like. */
function checkDisclosureNeedsToolExists(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    for (const [alias, readName] of Object.entries(entry.needs ?? {})) {
      if (facts.tools[readName] !== undefined) continue;
      const near = closestName(readName, toolNames);
      const suggestion = near === null ? '' : ` — did you mean '${near}'?`;
      refusals.push(`contract.disclosure.${actName}.needs.${alias} names '${readName}', `
        + `and the surface declares no such tool${suggestion}`);
    }
  }
  return refusals;
}

/** A disclosure `needs` alias points at a read whose schema can accept the destructive
 *  act's own target argument — a read that only accepts a different id can never fill in
 *  the record the destructive act is about, and an act with no target at all leaves no id
 *  for any read to accept. Skips an alias whose tool does not exist: that gap is named by
 *  checkDisclosureNeedsToolExists, not repeated here as a schema mismatch. */
function checkDisclosureNeedsResolvable(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    const held = facts.tools[actName];
    if (held === undefined) continue;
    for (const [alias, readName] of Object.entries(entry.needs ?? {})) {
      const read = facts.tools[readName];
      if (read === undefined) continue;
      const readArgs = schemaArgs(read);
      const target = held.target;
      if (target !== null && readArgs.includes(target)) continue;
      const accepts = readArgs.length === 0 ? 'nothing' : readArgs.map(arg => `'${arg}'`).join(', ');
      refusals.push(`contract.disclosure.${actName}.needs.${alias} names ${readName}: `
        + `${actName} needs ${readName} to accept the held call's target '${String(target)}', `
        + `and ${readName} only accepts ${accepts} `
        + `— repoint needs.${alias} at a read that accepts '${String(target)}', or give ${actName} a target.`);
    }
  }
  return refusals;
}

/** Every refusal the emitter owes when a declaration does not fit the world's surface: a
 *  guard naming an act no tool declares, a guard whose configuration names one, a guard whose
 *  configuration names an argument its act's schema does not declare, a destructive act with
 *  nothing disclosed before it runs, a `precondition` reading a record over an act with no target,
 *  a conduct law some desks never teach, a disclosure `needs` alias naming a tool that does not
 *  exist, and a disclosure alias whose read cannot answer the call it is held for. An empty array
 *  means the declaration is safe to emit against `facts`. */
export function checkAgainstSurface(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  return [
    ...checkGuardActsExist(declaration, facts),
    ...checkGuardArgActsExist(declaration, facts),
    ...checkGuardArgsOnSchema(declaration, facts),
    ...checkDestructiveDisclosed(declaration, facts),
    ...checkPreconditionTarget(declaration, facts),
    ...checkConductUniform(declaration),
    ...checkDisclosureNeedsToolExists(declaration, facts),
    ...checkDisclosureNeedsResolvable(declaration, facts)
  ];
}
