/** One house, many desks: every message reaches the front desk first, and the desk it
 *  names serves the turn. The router's window carries the desks' handles lines, the desk
 *  the conversation sits at, ONE prior exchange and the new message — never a persona, a
 *  card, an act or a record. What the house decided rides the governed record itself:
 *  `TurnRecord.routing` names the desk that served and the desk that handed the message
 *  back, and `usage` carries the router's own tokens on top of the desk's. A desk that
 *  hands a message back is re-routed once, and the re-delivery is composed without the
 *  return door — a second return is unreachable, not forbidden.
 *
 *  Two things the house owns as ONE. Its world: built once at the door and handed to
 *  every desk, so a record one desk writes is the record the next desk reads. Its
 *  conversations: one session is one queue, so a second message waits for the first to
 *  seal and no ledger entry is ever written over. */
import type { AgentSpec, DeclaredWorld, DomainContract, ForeignExchange, FrontDeskCfg,
              LlmParams, ModelPort, ModelStep, StepUsage, TurnRecord, TurnReturned,
              TurnRouting } from '@looprun-ai/core';
import { CardError, ScriptedModel, TurnFailure, WorldBuilder, composeWindow,
         readDecision } from '@looprun-ai/core';
import type { LoopRunConfig, LoopRunModel } from './agent-assembly.js';
import { LoopRunAgent, type GovernedResult } from './loop-run-agent.js';
import { MastraModelPort } from './mastra-model-port.js';

/** The decision that names no desk, and the ledger name of the turn it refuses. */
const NONE = 'none';
const FRONT_DESK = 'front-desk';

/** One delivered exchange of the house's ledger: the desk that served, the operator's
 *  words and the words the operator read back. Delivered TEXT only — no acts. */
interface Exchange { readonly desk: string; readonly userText: string; readonly replyText: string }
/** Where one conversation sits: its ledger in order, and the desk it last landed on. */
interface Seat { readonly ledger: readonly Exchange[]; readonly currentDesk: string | null }
const OPENING: Seat = { ledger: [], currentDesk: null };

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

/** What a desk has not seen: every ledger entry after its own last one. A desk it never
 *  served rides in as plain text — delivered words, no acts, nothing executable. */
function foreignSince(ledger: readonly Exchange[], desk: string): readonly ForeignExchange[] {
  return ledger.slice(ledger.map(e => e.desk).lastIndexOf(desk) + 1);
}

const stated = (e: readonly [string, string | undefined]): e is readonly [string, string] =>
  e[1] !== undefined;

/** Every desk of a routed house states the line that routes a message to it. A desk that
 *  states none is a desk the front desk can never choose, and the house refuses to stand. */
function handlesOf(specs: Readonly<Record<string, AgentSpec>>): Readonly<Record<string, string>> {
  const lines = Object.entries(specs).map(([name, spec]) => [name, spec.handles] as const);
  const missing = lines.filter(e => !stated(e)).map(([name]) => name);
  if (missing.length > 0) {
    throw new CardError(missing.map(name => ({ code: 'HANDLES_MISSING',
      sentence: `Desk '${name}' states no handles line: a house of ${lines.length} desks `
        + 'routes every message by the line each desk states, so a desk without one can '
        + 'never be chosen.' })));
  }
  return Object.fromEntries(lines.filter(stated));
}

/** The front desk's own seat: the subject's model, or the subject's script when a script
 *  is what drives it. Temperature 0 — the window declares it and the seat carries it. */
function routerPort(model: LoopRunModel, params: LlmParams): ModelPort {
  return typeof model === 'object' && model !== null && 'scripted' in model
    ? new ScriptedModel(model.scripted.steps)
    : new MastraModelPort(model, params);
}

/** The house as the wire holds it: the desks, the lines that route to them, and the
 *  front desk's port. */
export interface RoutedHouse {
  readonly name: string;
  readonly desks: Readonly<Record<string, LoopRunAgent>>;
  readonly handles: Readonly<Record<string, string>>;
  readonly router: ModelPort;
}

/** The subject door: the emitted specs, the shared contract and world, and the model
 *  every desk and the front desk seat. The world is DECLARED, because the house builds it
 *  once and hands that one instance to every desk — which is possible only for records
 *  the house holds itself. */
export interface RoutedSubjectCfg {
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract?: DomainContract;
  readonly world: DeclaredWorld;
  readonly model: LoopRunModel;
}

interface Decision { readonly desk: string; readonly steps: readonly ModelStep[] }

export class RoutedAgent {
  readonly name: string;
  readonly deskNames: readonly string[];
  private readonly desks: Readonly<Record<string, LoopRunAgent>>;
  private readonly handles: Readonly<Record<string, string>>;
  private readonly router: ModelPort;
  private readonly seats = new Map<string, Seat>();
  /** One promise chain per session — the queue a turn joins, never a lock it holds. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(house: RoutedHouse) {
    this.name = house.name;
    this.desks = house.desks;
    this.handles = house.handles;
    this.router = house.router;
    this.deskNames = Object.keys(house.desks);
  }

  /** Two or more desks stand a routed house; one desk needs no front desk in front of
   *  it, so the subject IS its lone agent. */
  static fromSubject(cfg: RoutedSubjectCfg,
                     portFactory?: (params: LlmParams) => ModelPort): RoutedAgent | LoopRunAgent {
    const names = Object.keys(cfg.specs);
    if (names.length === 1) {
      return new LoopRunAgent({ spec: cfg.specs[names[0]], contract: cfg.contract,
                                model: cfg.model, world: cfg.world });
    }
    const handles = handlesOf(cfg.specs);
    // The house acts on ONE world. It is built here, once, and every desk is handed the
    // same instance, so a record one desk writes is the record the next desk reads.
    const built = new WorldBuilder().build(cfg.world);
    const deskCfg = (name: string): LoopRunConfig => ({ spec: cfg.specs[name],
      contract: cfg.contract, model: cfg.model, world: cfg.world, built });
    const mint = portFactory ?? ((params: LlmParams) => routerPort(cfg.model, params));
    return new RoutedAgent({
      name: cfg.contract?.name ?? cfg.specs[names[0]].name,
      desks: Object.fromEntries(names.map(n => [n, new LoopRunAgent(deskCfg(n))])),
      handles,
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
    const tail = seat.ledger.at(-1);
    const front: Omit<FrontDeskCfg, 'returnedFrom'> = {
      houseName: this.name, handles: this.handles, currentDesk: seat.currentDesk,
      lastExchange: tail === undefined ? null
        : { userText: tail.userText, replyText: tail.replyText },
      userText: text };

    const opened = await this.decide({ ...front, returnedFrom: null });
    if (opened.desk === NONE) {
      return this.remember(id, seat, text, null, { desk: null, returned: null }, opened.steps);
    }
    const served = await this.deliver(opened.desk, id, seat, text, true);
    if (!('returned' in served)) {
      return this.remember(id, seat, text, served,
        { desk: opened.desk, returned: null }, opened.steps);
    }

    const returned = { by: opened.desk, reason: served.returned.reason };
    const again = await this.decide({ ...front, returnedFrom: returned });
    const steps = [...opened.steps, ...again.steps];
    if (again.desk === NONE) {
      return this.remember(id, seat, text, null, { desk: null, returned }, steps);
    }
    const settled = await this.deliver(again.desk, id, seat, text, false);
    if ('returned' in settled) {
      throw new TurnFailure('executor',
        `the ${again.desk} desk returned a message the re-delivery never offered`);
    }
    return this.remember(id, seat, text, settled, { desk: again.desk, returned }, steps);
  }

  endSession(id: string): void {
    for (const agent of Object.values(this.desks)) agent.endSession(id);
    this.seats.delete(id);
    this.queues.delete(id);
  }

  /** One forced single-tool step. A window the model answers unreadably is put a second
   *  time, byte-identical; an unreadable answer twice fails the turn — never a guess. */
  private async decide(cfg: FrontDeskCfg): Promise<Decision> {
    const window = composeWindow(cfg);
    const first = await this.router.step(window);
    const read = readDecision(first, this.deskNames);
    if (read !== null) return { desk: read, steps: [first] };
    const again = await this.router.step(window);
    const reread = readDecision(again, this.deskNames);
    if (reread === null) {
      throw new TurnFailure('network', 'the front desk returned no readable decision');
    }
    return { desk: reread, steps: [first, again] };
  }

  /** What the desk has not seen rides in as `before` — the ledger since its own last
   *  entry, delivered words only. */
  private deliver(desk: string, id: string, seat: Seat, text: string,
                  returnable: boolean): Promise<GovernedResult | TurnReturned> {
    return this.desks[desk].generateRouted(text,
      { session: id, before: foreignSince(seat.ledger, desk), returnable });
  }

  /** The turn's one write: the record gains the routing and the router's tokens, and the
   *  ledger gains the exchange the next window reads. A refusal names no desk, so the
   *  conversation keeps the seat it had. */
  private remember(id: string, seat: Seat, userText: string, served: GovernedResult | null,
                   routing: TurnRouting, steps: readonly ModelStep[]): GovernedResult {
    const router = billed(steps);
    const out: GovernedResult = served === null
      ? { text: this.refusalText(),
          loopRun: this.refusal(seat, userText, routing, router) }
      : { text: served.text,
          loopRun: { ...served.loopRun, routing, usage: merge(served.loopRun.usage, router) } };
    this.seats.set(id, {
      ledger: [...seat.ledger,
        { desk: routing.desk ?? FRONT_DESK, userText, replyText: out.text }],
      currentDesk: routing.desk ?? seat.currentDesk });
    return out;
  }

  private refusalText(): string {
    return `No desk at ${this.name} performs this. `
      + `The house covers: ${this.deskNames.join(', ')}.`;
  }

  /** The front desk's own turn: no desk was touched, so no act, no question and no
   *  finish exists — only the words the operator reads and what the router cost. */
  private refusal(seat: Seat, userText: string, routing: TurnRouting,
                  usage: Usage): TurnRecord {
    return { turn: seat.ledger.length + 1, servedBy: FRONT_DESK, userText,
             acts: [], questions: { issued: [], consumed: [], closed: [] },
             finish: null, corrections: [], text: this.refusalText(),
             closedBy: 'engine', usage, routing };
  }
}
