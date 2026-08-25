/** IS a @mastra/core Agent: same class contract, registrable in new Mastra({ agents }).
 *  Construction takes the closed two-card config; every turn runs through the governed
 *  Engine — the host base class never generates. A failed turn rejects with TurnFailure. */
import { Agent } from '@mastra/core/agent';
import type { ForeignExchange, GuardCensus, TurnRecord, TurnReturned } from '@looprun-ai/core';
import { Engine } from '@looprun-ai/core';
import { assemble, type Assembled, type LoopRunConfig } from './agent-assembly.js';

export interface GovernedResult { readonly text: string; readonly loopRun: TurnRecord }
export interface GovernedStream { readonly loopRun: TurnRecord;
                                  readonly textStream: AsyncIterable<string> }

interface Ready { readonly engine: Engine; readonly assembled: Assembled }

/** The one delivery, streamed AFTER the turn governed to completion. */
async function* deliver(text: string): AsyncGenerator<string> {
  let chunk = '';
  for (const ch of text) {
    chunk += ch;
    if (ch === ' ') { yield chunk; chunk = ''; }
  }
  if (chunk !== '') yield chunk;
  await Promise.resolve();
}

export class LoopRunAgent extends Agent {
  private readonly ready: Promise<Ready>;

  constructor(cfg: LoopRunConfig,
              doAssemble: (c: LoopRunConfig) => Promise<Assembled> = assemble) {
    super({
      id: cfg.spec.name, name: cfg.spec.name, instructions: cfg.spec.persona,
      model: () => { throw new Error('looprun: the engine owns the model seat'); }
    });
    this.ready = doAssemble(cfg).then(assembled => {
      const ready: Ready = { engine: Engine.create(assembled.config), assembled };
      this.settledValue = ready;
      return ready;
    });
  }

  // @ts-expect-error TS2416 — the host base's generic generate surface; the governed door narrows it to the closed shape
  override async generate(text: string, opts?: { session?: string }): Promise<GovernedResult> {
    const { engine } = await this.ready;
    const loopRun = await engine.chat(opts?.session ?? 'default', text);
    return { text: loopRun.text, loopRun };
  }

  // @ts-expect-error TS2416 — the host base's generic stream surface; governed run-to-completion, then the composed delivery streams
  override async stream(text: string, opts?: { session?: string }): Promise<GovernedStream> {
    const { engine } = await this.ready;
    const loopRun = await engine.chat(opts?.session ?? 'default', text);
    return { loopRun, textStream: deliver(loopRun.text) };
  }

  /** The routed door: opts.session and opts.returnable let the front desk hand a
   *  message back instead of serving it — a TurnReturned passes straight through,
   *  a sealed record narrows to the delivery text and the whole record. */
  async generateRouted(text: string, opts: { session?: string;
      before?: readonly ForeignExchange[]; returnable?: boolean;
      grounded?: readonly string[] }):
      Promise<GovernedResult | TurnReturned> {
    const { engine } = await this.ready;
    const out = await engine.chat(opts.session ?? 'default', text,
      { before: opts.before, returnable: opts.returnable, grounded: opts.grounded });
    return 'returned' in out ? out : { text: out.text, loopRun: out };
  }

  /** The Rulebook's own arrays — the list IS the code. Available once construction settles. */
  guards(): GuardCensus {
    return this.settled().engine.guards();
  }

  /** Structural deny-by-default exclusions, from the SurfaceGate report. */
  excluded(): readonly string[] {
    const surface = this.settled().assembled.surface;
    return surface === null ? [] : surface.excluded.map(e => e.name);
  }

  endSession(id: string): void {
    this.settled().engine.endSession(id);
  }

  /** Construction is async behind the closed constructor; the synchronous doors
   *  (census, exclusions, session end) need it settled — a turn awaits it. */
  private settledValue: Ready | null = null;
  private settled(): Ready {
    if (this.settledValue === null) {
      throw new Error('looprun: construction has not settled — await a turn first');
    }
    return this.settledValue;
  }
}
