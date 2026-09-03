/** One house, many desks: every message reaches the front desk first, and the desk it
 *  names serves the turn. The router's window carries the desks' description lines, the desk
 *  the conversation sits at, ONE prior exchange and the new message — never a persona, a
 *  card, an act or a record. What the house decided rides the governed record itself:
 *  `TurnRecord.routing` names the desk that served and the desk that handed the message
 *  back, `turn` counts the HOUSE's own exchanges — a desk keeps its own tape, and one
 *  routed dump reads as one conversation — and `usage` carries the front desk's own
 *  tokens, and any desk that read the message and handed it back, on top of the tokens
 *  of the desk that served. A desk that
 *  hands a message back is re-routed once, and the re-delivery is written without the
 *  return door — a second return is unreachable, not forbidden.
 *
 *  Two things the house owns as ONE. Its world: built once at the door and handed to
 *  every desk, so a record one desk writes is the record the next desk reads. Its
 *  conversations: one session is one queue, so a second message waits for the first to
 *  seal and no history entry is ever written over. */
import type { AgentSpec, DeclaredWorld, DomainContract, FrontDeskCfg,
              LlmParams, ModelPort, ModelStep, ProvenanceMark, ProviderOptions,
              StepUsage,
              TurnRecord, TurnReturned, TurnRouting } from '@looprun-ai/core';
import { carriedIds } from '@looprun-ai/core';
import { CardError, ScriptedModel, TurnFailure, WorldBuilder, composeWindow,
         readDecision } from '@looprun-ai/core';
import type { LoopRunConfig, LoopRunModel } from './agent-assembly.js';
import { LoopRunAgent, type GovernedResult } from './loop-run-agent.js';
import { MastraModelPort } from './mastra-model-port.js';

/** The decision that names no desk, and the name the history gives the turn it refuses. */
const NONE = 'none';
const FRONT_DESK = 'front-desk';
/** The name the engine's own default desk carries on the record and in the routing line. */
const FRONT_OF_HOUSE = 'general';

/** One delivered exchange of the house's history: the desk that served, the operator's
 *  words, the words the operator read back, and the provenance that turn's own recorded
 *  acts minted — `{ id, origin }` marks, never anything scraped from the text. */
interface Exchange { readonly desk: string; readonly userText: string; readonly replyText: string;
                     readonly minted: readonly ProvenanceMark[] }
/** Where one conversation sits: its history in order, and the desk it last landed on. */
interface Seat { readonly history: readonly Exchange[]; readonly currentDesk: string | null }
const OPENING: Seat = { history: [], currentDesk: null };

type Usage = StepUsage & { readonly modelCalls: number };
const NOTHING_BILLED: Usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
                                reasoningTokens: 0, modelCalls: 0 };

function merge(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens,
           outputTokens: a.outputTokens + b.outputTokens,
           cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
           reasoningTokens: a.reasoningTokens + b.reasoningTokens,
           modelCalls: a.modelCalls + b.modelCalls };
}

/** What the router's own steps cost — one model call each, zeros where the port
 *  reports no numbers. */
function billed(steps: readonly ModelStep[]): Usage {
  return steps.reduce((sum, s) => merge(sum, {
    inputTokens: s.usage?.inputTokens ?? 0, outputTokens: s.usage?.outputTokens ?? 0,
    cachedInputTokens: s.usage?.cachedInputTokens ?? 0,
    reasoningTokens: s.usage?.reasoningTokens ?? 0, modelCalls: 1 }), NOTHING_BILLED);
}

/** What a desk has not seen: every history entry after its own last one. A desk it never
 *  served rides in as plain text — delivered words, no acts, nothing executable. */
function foreignSince(history: readonly Exchange[], desk: string): readonly Exchange[] {
  return history.slice(history.map(e => e.desk).lastIndexOf(desk) + 1);
}

/** One mark per id: the FIRST act that carried it names its origin, and a later act
 *  carrying the same id adds nothing. */
function firstOrigins(marks: readonly ProvenanceMark[]): readonly ProvenanceMark[] {
  const first = new Map<string, ProvenanceMark>();
  for (const mark of marks) if (!first.has(mark.id)) first.set(mark.id, mark);
  return [...first.values()];
}

/** The provenance one turn mints: every id-shaped token an act's result or args carried,
 *  stamped with the act that carried it — `desk:tool`. Read off the sealed record's own
 *  acts, in the grounding floor's own shape; the turn's words are never read. */
function mintedBy(desk: string, acts: TurnRecord['acts']): readonly ProvenanceMark[] {
  return firstOrigins(acts.flatMap(act =>
    carriedIds(JSON.stringify([act.result, act.call.args]))
      .map(id => ({ id, origin: `${desk}:${act.call.tool}` }))));
}

/** The provenance a desk inherits: the marks of every history entry it has not seen. */
function inheritedBy(history: readonly Exchange[], desk: string): readonly ProvenanceMark[] {
  return firstOrigins(foreignSince(history, desk).flatMap(e => e.minted));
}

const stated = (e: readonly [string, string | undefined]): e is readonly [string, string] =>
  e[1] !== undefined && e[1].trim() !== '';

/** Every desk of a routed house states the line that routes a message to it. A desk whose
 *  line is absent or blank is a desk the front desk can never choose, and the house
 *  refuses to stand. */
function descriptionsOf(specs: Readonly<Record<string, AgentSpec>>): Readonly<Record<string, string>> {
  const lines = Object.entries(specs).map(([name, spec]) => [name, spec.description] as const);
  const missing = lines.filter(e => !stated(e)).map(([name]) => name);
  if (missing.length > 0) {
    throw new CardError(missing.map(name => ({ code: 'DESCRIPTION_MISSING',
      sentence: `Desk '${name}' states no description line: a house of ${lines.length} desks `
        + 'routes every message by the line each desk states, and a line that is absent or '
        + 'blank matches no message, so the desk can never be chosen.' })));
  }
  return Object.fromEntries(lines.filter(stated));
}

/** What a person at the counter calls each desk. The house's own refusal is built from
 *  these, so an operator whose message no desk performs hears what the house does cover. */
function summariesOf(specs: Readonly<Record<string, AgentSpec>>): readonly string[] {
  const lines = Object.entries(specs).map(([name, spec]) => [name, spec.summary] as const);
  const missing = lines.filter(e => !stated(e)).map(([name]) => name);
  if (missing.length > 0) {
    throw new CardError(missing.map(name => ({ code: 'SUMMARY_MISSING',
      sentence: `Desk '${name}' states no summary: the house refuses a message no desk `
        + 'performs by naming what it does cover, and a desk with no summary would be named '
        + 'to the operator by its label instead.' })));
  }
  return lines.filter(stated).map(([, line]) => line);
}

/** The desk a message no desk matched is delivered to. A house names at most one, and a
 *  house that names none is served by the front of house the engine seats itself. */
function defaultOf(specs: Readonly<Record<string, AgentSpec>>): string | null {
  const marked = Object.entries(specs).filter(([, spec]) => spec.default === true).map(([n]) => n);
  if (marked.length > 1) {
    throw new CardError([{ code: 'DEFAULT_DESK_DUP',
      sentence: `Desks ${marked.join(', ')} each declare themselves the default: a message no `
        + 'desk matched is delivered to ONE desk, and a house that names several names none.' }]);
  }
  return marked[0] ?? null;
}

/** The front of house the engine seats when the subject marks no desk its default. It
 *  performs nothing and reads nothing: it greets whoever arrives, states what the house
 *  covers in the words the desks state about themselves, and declines what the house does
 *  not hold — in the language the person wrote in. */
export function frontOfHouse(houseName: string, summaries: readonly string[]): AgentSpec {
  return { name: FRONT_OF_HOUSE,
    persona: `You are the front of house at ${houseName}. You perform nothing and you read `
      + 'no record. You greet whoever arrives, and you say what this house covers: '
      + `${summaries.join('; ')}. You answer in the language the person wrote in. A request `
      + 'this house does not hold you decline in one sentence, naming what the house does '
      + 'cover. You never state a figure, a price, a date, an identifier or a record: those '
      + 'belong to the desks that hold them, and you name the desk instead.',
    tools: [] };
}

/** The front desk's own seat: the subject's model, or the subject's script when a script
 *  is what drives it. Temperature 0 — the window declares it and the seat carries it.
 *  The front desk sits at the same target as the desks behind it, so it asks its
 *  provider for the same things they do. */
function routerPort(model: LoopRunModel, params: LlmParams,
                    providerOptions: ProviderOptions): ModelPort {
  return typeof model === 'object' && model !== null && 'scripted' in model
    ? new ScriptedModel(model.scripted.steps)
    : new MastraModelPort(model, params, providerOptions);
}

/** The house as the wire holds it: the desks, the lines that route to them, and the
 *  front desk's port. */
export interface RoutedHouse {
  readonly name: string;
  readonly desks: Readonly<Record<string, LoopRunAgent>>;
  readonly description: Readonly<Record<string, string>>;
  /** What a person at the counter calls each desk, in the order they are covered. */
  readonly summaries: readonly string[];
  /** The desk a message no desk matched is delivered to, and its name. A desk the
   *  subject marked stands among `desks`; the engine's own front of house does not,
   *  so the router's window carries exactly the desks the subject declared. */
  readonly fallback: LoopRunAgent;
  readonly fallbackName: string;
  readonly router: ModelPort;
}

/** The subject door: the emitted specs, the shared contract and world, and the model
 *  every desk and the front desk seat. The world is DECLARED, because the house builds it
 *  once and hands that one instance to every desk — which is possible only for records
 *  the house holds itself. `preset` names the scenario that single build starts from. */
export interface RoutedSubjectCfg {
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract?: DomainContract;
  readonly world: DeclaredWorld;
  readonly preset?: string;
  readonly model: LoopRunModel;
  /** What the target asks of its provider on every request — read off
   *  `tier(alias).providerOptions` for a local seat. One target seats the whole house,
   *  so the front desk and every desk behind it carry the same declaration. */
  readonly providerOptions?: ProviderOptions;
}

interface Decision { readonly desk: string; readonly act: 'yes' | 'no' | 'unclear';
                     readonly steps: readonly ModelStep[] }

export class RoutedAgent {
  readonly name: string;
  readonly deskNames: readonly string[];
  private readonly desks: Readonly<Record<string, LoopRunAgent>>;
  private readonly description: Readonly<Record<string, string>>;
  private readonly fallback: LoopRunAgent;
  private readonly fallbackName: string;
  private readonly router: ModelPort;
  private readonly seats = new Map<string, Seat>();
  /** One promise chain per session — the queue a turn joins, never a lock it holds. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(house: RoutedHouse) {
    this.name = house.name;
    this.desks = house.desks;
    this.description = house.description;
    this.fallback = house.fallback;
    this.fallbackName = house.fallbackName;
    this.router = house.router;
    this.deskNames = Object.keys(house.desks);
  }

  /** Two or more desks stand a routed house; one desk needs no front desk in front of
   *  it, so the subject IS its lone agent. */
  static fromSubject(cfg: RoutedSubjectCfg,
                     portFactory?: (params: LlmParams) => ModelPort): RoutedAgent | LoopRunAgent {
    const names = Object.keys(cfg.specs);
    if (names.length === 1) {
      if (cfg.specs[names[0]].default === true) {
        throw new CardError([{ code: 'DEFAULT_DESK_ALONE',
          sentence: `Desk '${names[0]}' declares itself the default, and it is the only desk: `
            + 'a lone agent has no front desk in front of it, so no message can fail to match '
            + 'it and there is nothing to fall back from.' }]);
      }
      return new LoopRunAgent({ spec: cfg.specs[names[0]], contract: cfg.contract,
                                model: cfg.model, world: cfg.world, preset: cfg.preset,
                                providerOptions: cfg.providerOptions });
    }
    const description = descriptionsOf(cfg.specs);
    const summaries = summariesOf(cfg.specs);
    const marked = defaultOf(cfg.specs);
    // The house acts on ONE world. It is built here, once, from the scenario the subject
    // named, and every desk is handed that same instance — so a record one desk writes is
    // the record the next desk reads. The preset rides the build, never a desk's config:
    // a world already built has already answered which scenario it holds.
    const built = new WorldBuilder().build(cfg.world, cfg.preset);
    // Each desk learns its colleagues from what those colleagues say about themselves: the
    // house composes the map from their own descriptions, so the same sentence is never
    // written twice and can never drift between the two places it was written.
    const others = (name: string): Readonly<Record<string, string>> =>
      Object.fromEntries(names.filter(n => n !== name).map(n => [n, cfg.specs[n].description ?? '']));
    const deskCfg = (name: string): LoopRunConfig => ({
      spec: { ...cfg.specs[name], teammates: others(name) },
      contract: cfg.contract, model: cfg.model, world: cfg.world, built,
      providerOptions: cfg.providerOptions });
    const mint = portFactory
      ?? ((params: LlmParams) => routerPort(cfg.model, params, cfg.providerOptions ?? {}));
    const houseName = cfg.contract?.name ?? cfg.specs[names[0]].name;
    const desks = Object.fromEntries(names.map(n => [n, new LoopRunAgent(deskCfg(n))]));
    // The engine's own front of house is seated only where the subject marked no desk. It
    // stands outside `desks`, so the router's window and the house's desk list carry
    // exactly what the subject declared.
    const fallback = marked === null
      ? new LoopRunAgent({ spec: frontOfHouse(houseName, summaries), contract: cfg.contract,
                           model: cfg.model, world: cfg.world, built,
                           providerOptions: cfg.providerOptions })
      : desks[marked];
    return new RoutedAgent({
      name: houseName,
      desks,
      description,
      summaries,
      fallback,
      fallbackName: marked ?? FRONT_OF_HOUSE,
      router: mint({ temperature: 0 }) });
  }

  /** One conversation is one queue: a second message on the same session begins only
   *  after the first has sealed, so no turn reads a seat another turn is about to
   *  write. Different sessions never wait on each other. */
  generate(text: string, opts?: { session?: string }): Promise<GovernedResult> {
    const id = opts?.session ?? 'default';
    const served = (this.queues.get(id) ?? Promise.resolve()).then(() => this.turn(id, text));
    this.queues.set(id, served.then(() => undefined, () => undefined));
    return served;
  }

  private async turn(id: string, text: string): Promise<GovernedResult> {
    const seat = this.seats.get(id) ?? OPENING;
    const tail = seat.history.at(-1);
    const front: Omit<FrontDeskCfg, 'returnedFrom'> = {
      houseName: this.name, description: this.description, currentDesk: seat.currentDesk,
      lastExchange: tail === undefined ? null
        : { userText: tail.userText, replyText: tail.replyText },
      userText: text };

    // A message that is exactly a live code routes to the desk holding that
    // question — deterministically, before the router is ever asked. Digits carry
    // no language and no topic; the question's desk is a fact the house owns.
    const given = text.trim();
    const holder = this.deskNames.find(d =>
      this.desks[d].openQuestions(id).some(q => q.code === given));
    if (holder !== undefined) {
      const answered = await this.deliver(holder, id, seat, text, false, 'no');
      if ('returned' in answered) {
        throw new TurnFailure('executor',
          `the ${holder} desk returned the answer to its own code`);
      }
      return this.remember(id, seat, text, answered, { desk: holder, returned: null }, []);
    }

    const opened = await this.decide({ ...front, returnedFrom: null });
    if (opened.desk === NONE) return this.unmatched(id, seat, text, null, opened.steps);
    const served = await this.deliver(opened.desk, id, seat, text, true, opened.act);
    if (!('returned' in served)) {
      return this.remember(id, seat, text, served,
        { desk: opened.desk, returned: null }, opened.steps);
    }

    const returned = { by: opened.desk, reason: served.returned.reason };
    // The desk read the whole message before handing it back, and that read is a model
    // call nobody else records: it rides onto the record of the turn this re-route seals.
    const handedBack = served.usage;
    const again = await this.decide({ ...front, returnedFrom: returned });
    const steps = [...opened.steps, ...again.steps];
    if (again.desk === NONE) return this.unmatched(id, seat, text, returned, steps, handedBack);
    const settled = await this.deliver(again.desk, id, seat, text, false, again.act);
    if ('returned' in settled) {
      throw new TurnFailure('executor',
        `the ${again.desk} desk returned a message the re-delivery never offered`);
    }
    return this.remember(id, seat, text, settled, { desk: again.desk, returned }, steps,
      handedBack);
  }

  /** A desk by name, and the house's default desk by its own. The engine's front of house
   *  stands outside `desks`, so it is reached here and nowhere else. */
  private agentAt(desk: string): LoopRunAgent {
    return this.desks[desk] ?? this.fallback;
  }

  /** A message the front desk matched to no desk. The house's default desk serves it and
   *  its words are the reply: it is told nothing was matched by the act intent it is
   *  handed — a message no desk performs asks this house to change nothing — and it may
   *  not hand the message back, because there is nowhere left to send it. */
  private async unmatched(id: string, seat: Seat, text: string,
                          returned: { by: string; reason: string } | null,
                          steps: readonly ModelStep[],
                          handedBack: Usage = NOTHING_BILLED): Promise<GovernedResult> {
    const served = await this.deliver(this.fallbackName, id, seat, text, false, 'no');
    if ('returned' in served) {
      throw new TurnFailure('executor',
        `the ${this.fallbackName} desk returned a message the house cannot re-route`);
    }
    return this.remember(id, seat, text, served,
      { desk: this.fallbackName, returned, unmatched: true }, steps, handedBack);
  }

  endSession(id: string): void {
    for (const agent of Object.values(this.desks)) agent.endSession(id);
    this.fallback.endSession(id);
    this.seats.delete(id);
    this.queues.delete(id);
  }

  /** One forced single-tool step. A window the model answers unreadably is put a second
   *  time, byte-identical; an unreadable answer twice fails the turn — never a guess. */
  private async decide(cfg: FrontDeskCfg): Promise<Decision> {
    const window = composeWindow(cfg);
    const first = await this.router.step(window);
    const read = readDecision(first, this.deskNames);
    if (read !== null) return { ...read, steps: [first] };
    const again = await this.router.step(window);
    const reread = readDecision(again, this.deskNames);
    if (reread === null) {
      throw new TurnFailure('network', 'the front desk returned no readable decision');
    }
    return { ...reread, steps: [first, again] };
  }

  /** What the desk has not seen rides in as `before` — the history since its own last
   *  entry, delivered words only — and the marks those turns' own acts minted ride as the
   *  grounding provenance. The floor checks ids, so the marks hand over their ids alone. */
  private deliver(desk: string, id: string, seat: Seat, text: string,
                  returnable: boolean, act: 'yes' | 'no' | 'unclear'):
    Promise<GovernedResult | TurnReturned> {
    return this.agentAt(desk).generateRouted(text,
      { session: id, before: foreignSince(seat.history, desk), returnable, act,
        grounded: inheritedBy(seat.history, desk).map(mark => mark.id) });
  }

  /** The turn's one write: the record gains the routing — the desk, the return and the
   *  provenance that rode in — the house's own turn count and the router's tokens, and the
   *  history gains the exchange the next window reads. A refusal names no desk, so the
   *  conversation keeps the seat it had, and it mints nothing: no act ran. */
  private remember(id: string, seat: Seat, userText: string, served: GovernedResult,
                   decided: TurnRouting, steps: readonly ModelStep[],
                   handedBack: Usage = NOTHING_BILLED): GovernedResult {
    // What the turn cost outside the desk that served it: every front-desk step, and
    // the desk that read the message and handed it back.
    const beyond = merge(billed(steps), handedBack);
    const inherited = decided.desk === null ? [] : inheritedBy(seat.history, decided.desk);
    const routing: TurnRouting = inherited.length === 0
      ? decided : { ...decided, grounded: inherited };
    const out: GovernedResult = { text: served.text,
      loopRun: { ...served.loopRun, turn: seat.history.length + 1, routing,
                 usage: merge(served.loopRun.usage, beyond) } };
    const desk = routing.desk ?? FRONT_DESK;
    this.seats.set(id, {
      history: [...seat.history,
        { desk, userText, replyText: out.text, minted: mintedBy(desk, served.loopRun.acts) }],
      currentDesk: routing.desk ?? seat.currentDesk });
    return out;
  }
}
