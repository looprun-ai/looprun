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
 *  `a` into `b`, used only to name a near-miss act in a refusal sentence. */
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

/** The declared act name closest to `name` by edit distance, or null when the surface
 *  declares no act at all. */
function closestActName(name: string, actNames: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of actNames) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

/** Every guard names acts the surface actually declares — a typo names no tool, and the
 *  emitter refuses to write a card that wires a call that does not exist. */
function checkGuardActsExist(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const actNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    guard.acts.forEach((act, actIndex) => {
      if (facts.tools[act] !== undefined) return;
      const near = closestActName(act, actNames);
      const suggestion = near === null ? '' : ` — did you mean '${near}'?`;
      refusals.push(`contract.guards[${guardIndex}].acts[${actIndex}] names '${act}', `
        + `and the surface declares no such act${suggestion}`);
    });
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

/** A disclosure `needs` alias points at a read whose schema can accept the destructive
 *  act's own target argument — a read that only accepts a different id can never fill in
 *  the record the destructive act is about. */
function checkDisclosureNeedsResolvable(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    const held = facts.tools[actName];
    if (held === undefined || held.target === null) continue;
    for (const [alias, readName] of Object.entries(entry.needs ?? {})) {
      const readArgs = schemaArgs(facts.tools[readName]);
      if (readArgs.includes(held.target)) continue;
      const accepts = readArgs.length === 0 ? 'nothing' : readArgs.map(arg => `'${arg}'`).join(', ');
      refusals.push(`contract.disclosure.${actName}.needs.${alias} names ${readName}: `
        + `${actName} needs ${readName} to accept '${held.target}', and ${readName} only accepts ${accepts} `
        + `— repoint needs.${alias} at a read that accepts '${held.target}'.`);
    }
  }
  return refusals;
}

/** Every refusal the emitter owes when a declaration does not fit the world's surface: a
 *  guard naming an act no tool declares, a destructive act with nothing disclosed before it
 *  runs, a `precondition` reading a record over an act with no target, a conduct law some
 *  desks never teach, and a disclosure alias whose read cannot answer the call it is held
 *  for. An empty array means the declaration is safe to emit against `facts`. */
export function checkAgainstSurface(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  return [
    ...checkGuardActsExist(declaration, facts),
    ...checkDestructiveDisclosed(declaration, facts),
    ...checkPreconditionTarget(declaration, facts),
    ...checkConductUniform(declaration),
    ...checkDisclosureNeedsResolvable(declaration, facts)
  ];
}
