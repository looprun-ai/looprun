import type { Json, SurfaceFacts, ToolFact } from '@looprun-ai/core';
import type { SeamRow } from '@looprun-ai/eval';
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

/** The arguments an act's JSON schema REQUIRES. A schema with no `required` list requires
 *  nothing, so every argument it declares is one a caller may leave out. */
function requiredSchemaArgs(fact: ToolFact | undefined): readonly string[] {
  const schema = fact?.schema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [];
  const required = (schema as { readonly required?: Json }).required;
  if (!Array.isArray(required)) return [];
  return required.filter((name): name is string => typeof name === 'string');
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

/** Every judged check on a desk names acts the surface declares, and names them from that desk's
 *  own lane. A check scoped to an act this desk cannot perform still runs on every reply the desk
 *  writes, and its census row claims a scope no case at this seat can reach. */
function checkJudgedActs(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  declaration.desks.forEach((desk, deskIndex) => {
    (desk.judged ?? []).forEach((check, checkIndex) => {
      check.acts.forEach((act, actIndex) => {
        const at = `desks[${deskIndex}].judged[${checkIndex}].acts[${actIndex}]`;
        if (facts.tools[act] === undefined) {
          const near = closestName(act, toolNames);
          refusals.push(`${at} names '${act}', and the surface declares no such act`
            + `${near === null ? '' : ` — did you mean '${near}'?`}`);
          return;
        }
        if (desk.tools.includes(act)) return;
        refusals.push(`${at} names '${act}', and the '${desk.name}' desk's lane holds `
          + `${desk.tools.map(tool => `'${tool}'`).join(', ')} — scope the check to an act this `
          + `desk performs, or declare it on the desk that does.`);
      });
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

/** The arguments that name an ARGUMENT OF THE ACT rather than a second act, and what pointing one
 *  outside the act's schema costs. Both factories read the name off the arriving call and find
 *  `undefined` there; they part company on what they do about it, so each states its own. */
const SCHEMA_ARGS: Readonly<Record<string, { readonly args: readonly string[];
                                             readonly costs: string }>> = {
  valueFromUser: { args: ['arg'], costs: 'the guard refuses every call of it' },
  argFormat: { args: ['arg'],
    costs: 'the guard never fires — it sits in the census as a check that decides nothing' },
  argAbsent: { args: ['arg'],
    costs: 'the guard never fires — no call carries an argument the act does not declare' }
};

/** Every argument a guard's CONFIGURATION names is an argument the act itself declares. A guard
 *  pointed at an argument outside the act's schema reads `undefined` on every arriving call, and
 *  the three factories that read one answer that differently: `valueFromUser` has no user word
 *  left to match and denies its own act for the whole conversation, while `argFormat` has no value
 *  left to test and `argAbsent` has nothing left to forbid, so both allow every call. None of it
 *  is visible downstream — the act does carry a check, and the check either never passes or never
 *  fires. */
function checkGuardArgsOnSchema(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  declaration.contract.guards.forEach((guard, guardIndex) => {
    const reads = SCHEMA_ARGS[guard.factory];
    if (reads === undefined) return;
    for (const argName of reads.args) {
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
          + `and '${act}' accepts ${accepts}. Pointed at an argument its act does not carry, `
          + `${reads.costs}.${suggestion}`);
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

/** A disclosure `needs` alias names a tool the surface actually declares — checked for
 *  every alias regardless of the held act's target, because a typo names no tool no
 *  matter what the destructive act it discloses looks like. */
function checkDisclosureNeedsToolExists(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    for (const [alias, need] of Object.entries(entry.needs ?? {})) {
      const readName = typeof need === 'string' ? need : need.tool;
      if (facts.tools[readName] !== undefined) continue;
      const near = closestName(readName, toolNames);
      const suggestion = near === null ? '' : ` — did you mean '${near}'?`;
      refusals.push(`contract.disclosure.${actName}.needs.${alias} names '${readName}', `
        + `and the surface declares no such tool${suggestion}`);
    }
  }
  return refusals;
}

/** A disclosure `needs` alias names a read the engine can actually run for the held call, and
 *  each of the two forms answers that differently.
 *
 *  An alias naming the read ALONE is answered from the held call's own target, so the read has to
 *  accept that target argument: a read that only accepts a different id can never fill in the
 *  record the held act is about, and an act with no target at all leaves no id for any read to
 *  accept. An alias STATING its args names what the read is handed, so it stands when the args it
 *  states fill everything that read requires — a read whose every argument is optional is
 *  answered by `args: {}` and serves any act, whatever id the act itself is about.
 *
 *  Skips an alias whose tool does not exist: that gap is named by checkDisclosureNeedsToolExists,
 *  not repeated here as a schema mismatch. */
function checkDisclosureNeedsResolvable(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    const held = facts.tools[actName];
    if (held === undefined) continue;
    for (const [alias, need] of Object.entries(entry.needs ?? {})) {
      const read = facts.tools[typeof need === 'string' ? need : need.tool];
      if (read === undefined) continue;
      if (typeof need !== 'string') {
        if (need.pick !== undefined && !schemaArgs(held).includes(need.pick.key)) {
          refusals.push(`contract.disclosure.${actName}.needs.${alias} picks by '${need.pick.key}', `
            + `and ${actName} declares no such argument — pick.key names one of `
            + `${actName}'s own arguments.`);
        }
        const unfilled = requiredSchemaArgs(read).filter(arg => !(arg in need.args));
        if (unfilled.length === 0) continue;
        const stated = Object.keys(need.args);
        const requires = unfilled.map(arg => `'${arg}'`).join(', ');
        refusals.push(`contract.disclosure.${actName}.needs.${alias} hands ${need.tool} `
          + `${stated.length === 0 ? 'no argument at all' : stated.map(arg => `'${arg}'`).join(', ')}, `
          + `and ${need.tool} requires ${requires} — state ${requires} in args, or point `
          + `needs.${alias} at a read whose every argument is optional.`);
        continue;
      }
      const readArgs = schemaArgs(read);
      const target = held.target;
      if (target !== null && readArgs.includes(target)) continue;
      const accepts = readArgs.length === 0 ? 'nothing' : readArgs.map(arg => `'${arg}'`).join(', ');
      refusals.push(`contract.disclosure.${actName}.needs.${alias} names ${need}: `
        + `${actName} needs ${need} to accept the held call's target '${String(target)}', `
        + `and ${need} only accepts ${accepts} `
        + `— repoint needs.${alias} at a read that accepts '${String(target)}', or give ${actName} a target.`);
    }
  }
  return refusals;
}

/** A disclosure `needs` alias names a read the DESK can run. The engine pays the alias by calling
 *  that read on the turn the act is held, from the lane of the desk that holds the act — a desk
 *  whose tools do not carry the read cannot make the call, the alias comes back empty, and the
 *  entry's `empty` tense renders on every single call, telling the operator the record says
 *  nothing when nothing was ever read.
 *
 *  Every desk that holds the act owes the read, because the entry is one entry and each of those
 *  desks renders it. */
function checkDisclosureNeedsInLane(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const refusals: string[] = [];
  for (const [actName, entry] of Object.entries(declaration.contract.disclosure)) {
    if (facts.tools[actName] === undefined) continue;
    for (const [alias, need] of Object.entries(entry.needs ?? {})) {
      const readName = typeof need === 'string' ? need : need.tool;
      if (facts.tools[readName] === undefined) continue;
      for (const desk of declaration.desks) {
        if (!desk.tools.includes(actName) || desk.tools.includes(readName)) continue;
        refusals.push(`contract.disclosure.${actName}.needs.${alias} names '${readName}', and the `
          + `'${desk.name}' desk holds '${actName}' without it — the desk cannot run the owed `
          + `read, and the empty tense would fire with a false reason on every call. Put `
          + `'${readName}' in the ${desk.name} lane, or point needs.${alias} at a read that lane `
          + `holds.`);
      }
    }
  }
  return refusals;
}

/** Every desk states the line that routes a message to it, exactly when a router stands in front
 *  of more than one desk to read it. Two or more desks route by comparing each desk's own
 *  `description` line against the arriving message, so a desk that declares none — or writes one that
 *  says nothing — is a desk the router can never choose. One desk has no router in front of it at
 *  all, so a `description` line declared there is a sentence nothing ever reads. */
function checkRoutingLines(declaration: Declaration): readonly string[] {
  const { desks } = declaration;
  if (desks.length >= 2) {
    return desks.flatMap((desk, deskIndex) => {
      if (desk.description === undefined) {
        return [`desks[${deskIndex}].description is missing: a house of ${desks.length} desks routes `
          + `every message by the description line each desk states, and '${desk.name}' declares none `
          + `— add the routing line '${desk.name}' answers to.`];
      }
      if (desk.description.trim() === '') {
        return [`desks[${deskIndex}].description says nothing on '${desk.name}': a house of `
          + `${desks.length} desks routes every message by the description line each desk states, and a `
          + `blank line matches no message — write the routing line '${desk.name}' answers to.`];
      }
      // The house refuses a message no desk performs by naming what it DOES cover. Without a
      // summary the operator would be handed the desk's label, which is a name for the author.
      if (desk.summary !== undefined && desk.summary.includes(',')) {
        return [`desks[${deskIndex}].summary on '${desk.name}' carries a comma: the comma is the `
          + 'house\'s own list separator when it names what it covers, so a summary carrying one '
          + 'dissolves the boundary between two desks.'];
      }
      if (desk.summary === undefined || desk.summary.trim() === '') {
        return [`desks[${deskIndex}].summary is missing on '${desk.name}': the house refuses a `
          + 'message no desk performs by naming what it does cover, in the words a person at the '
          + `counter would use — write what somebody would call '${desk.name}'.`];
      }
      return [];
    });
  }
  const [only] = desks;
  if (only?.description !== undefined) {
    return [`desks[0].description is set on '${only.name}': a house of one desk has no router in `
      + `front of it to read that line, so it can never be reached — drop description, or declare a `
      + `second desk for the router to choose between.`];
  }
  return [];
}

/** The six voices a house teaches, one conduct law each. A conduct law renders as a prose rule in
 *  its desk's own system prefix, so a voice a desk does not carry is a law that desk never reads. */
const VOICES: readonly string[] = ['declareHonestly', 'oneQuestion', 'yourLaneYourReads',
  'recordsOverAssertions', 'askBeforeYouChoose', 'nameItDoNotPassItOn'];

/** Every desk states all six voices, exactly when a second counter stands beside the first. One
 *  operator is handed from desk to desk inside a single conversation, and a voice one desk teaches
 *  and the next leaves out answers that person by two different laws: the desk carrying
 *  `recordsOverAssertions` says what the read returned, and the desk beside it — reading a prefix
 *  that never names the law — says what it remembers. One desk is one counter with no second way to
 *  answer, so the six bind nothing in a house of one. */
function checkConductVoices(declaration: Declaration): readonly string[] {
  const { desks } = declaration;
  if (desks.length < 2) return [];
  return desks.flatMap((desk, deskIndex) => VOICES
    .filter(voice => desk.conduct[voice] === undefined)
    .map(voice => `desks[${deskIndex}].conduct states no '${voice}' on '${desk.name}': a house of `
      + `${desks.length} desks hands one operator from counter to counter, and a voice this desk `
      + `never states is a law its prompt never carries — one message reaches '${desk.name}' and is `
      + `answered by a different law than the desk beside it. Write '${voice}' here too, in the `
      + `words '${desk.name}' uses.`));
}

/** Every seam sentence pays a row the world actually spells out, and lands on a desk that can
 *  reach the act. The seam table is the register: an act it carries no row for is an act whose
 *  refusals the world never names in a literal, and a code outside that act's row set is a
 *  sentence the operator would never meet — either way the law would render as a rule about a
 *  refusal that never arrives. A desk holding the act is where the sentence renders, so a seam
 *  entry on an act no lane holds is a sentence no prompt carries. */
function checkSeamRows(declaration: Declaration, facts: SurfaceFacts,
                       seam: readonly SeamRow[]): readonly string[] {
  const toolNames = Object.keys(facts.tools);
  const codesByAct = new Map<string, string[]>();
  for (const row of seam) codesByAct.set(row.act, [...(codesByAct.get(row.act) ?? []), row.code]);
  const refusals: string[] = [];
  for (const [act, codes] of Object.entries(declaration.contract.seam ?? {})) {
    const spelled = codesByAct.get(act);
    if (facts.tools[act] === undefined) {
      const near = closestName(act, toolNames);
      refusals.push(`contract.seam.${act} names an act the surface does not declare`
        + `${near === null ? '' : ` — did you mean '${near}'?`}`);
      continue;
    }
    if (spelled === undefined) {
      refusals.push(`contract.seam.${act}: the world spells out no refusal on '${act}', so the `
        + `seam table carries no row for it — read gen/SEAM.md and pay a row it lists.`);
      continue;
    }
    const holders = declaration.desks.filter(desk => desk.tools.includes(act));
    if (holders.length === 0) {
      refusals.push(`contract.seam.${act}: no desk's lane holds '${act}', and a seam law renders `
        + `on the desks that hold its act — put '${act}' in a desk's tools, or drop the entry.`);
    }
    for (const code of Object.keys(codes)) {
      if (spelled.includes(code)) continue;
      const near = closestName(code, spelled);
      refusals.push(`contract.seam.${act}.${code}: '${act}' is refused with `
        + `${[...spelled].sort().map(spelledCode => `'${spelledCode}'`).join(', ')}, and never with `
        + `'${code}'${near === null ? '' : ` — did you mean '${near}'?`}`);
    }
  }
  return refusals;
}

/** Every refusal the emitter owes when a declaration does not fit the world's surface: a
 *  guard naming an act no tool declares, a judged check on a desk naming one or naming an act
 *  outside that desk's lane, a guard whose configuration names one, a guard whose
 *  configuration names an argument its act's schema does not declare, a destructive act with
 *  nothing disclosed before it runs, a `precondition` reading a record over an act with no target,
 *  a disclosure `needs` alias naming a tool that does not exist, a disclosure alias whose read
 *  cannot answer the call it is held for, a disclosure alias naming a read the lane of a desk
 *  holding the act does not carry, a seam sentence paying a row the world does not carry, and a
 *  house whose desks disagree with the routing law — two or more desks with a desk whose `description`
 *  line is missing or blank, or the one desk of a single-desk house carrying one — and a desk of a
 *  house of two or more that teaches fewer than the six voices. `seam` is the seam table
 *  computed off the same subject the declaration sits in. An empty array means the declaration is
 *  safe to emit against `facts`. */
export function checkAgainstSurface(declaration: Declaration, facts: SurfaceFacts,
                                    seam: readonly SeamRow[]): readonly string[] {
  return [
    ...checkGuardActsExist(declaration, facts),
    ...checkJudgedActs(declaration, facts),
    ...checkGuardArgActsExist(declaration, facts),
    ...checkGuardArgsOnSchema(declaration, facts),
    ...checkDestructiveDisclosed(declaration, facts),
    ...checkPreconditionTarget(declaration, facts),
    ...checkDisclosureNeedsToolExists(declaration, facts),
    ...checkDisclosureNeedsResolvable(declaration, facts),
    ...checkDisclosureNeedsInLane(declaration, facts),
    ...checkSeamRows(declaration, facts, seam),
    ...checkRoutingLines(declaration),
    ...checkConductVoices(declaration)
  ];
}
