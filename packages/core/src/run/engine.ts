/** The framework-free host surface and the composition root: construct from the
 *  compiled agent, one chat entry, whole typed turn record out. EngineConfig is a
 *  CLOSED key set — no index signature, no options object, no field through which
 *  governance weakens. */
import type { ChatOpts, GuardCensus, TurnRecord, TurnReturned } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ToolPort, RecordsPort } from '../contract/ports.js';
import type { CompiledAgent } from '../cards/cards.js';
import { ActionHistory } from './action-history.js';
import { DeliveryWriter } from './delivery-writer.js';
import { FinishDesk } from './finish-desk.js';
import { Masker } from './masker.js';
import type { ModelSeat } from './model-seat.js';
import { PromptWriter } from './prompt-writer.js';
import { Rulebook } from './rulebook.js';
import { Session } from './session.js';
import { StatusClerk } from './status-clerk.js';
import { Turn, type TurnDeps } from './turn.js';

export interface EngineConfig {
  readonly compiled: CompiledAgent;
  readonly toolPort: ToolPort;
  readonly recordsPort: RecordsPort | null;
  readonly seat: ModelSeat;
}

export class Engine {
  private readonly deps: TurnDeps;
  private readonly rulebook: Rulebook;
  private readonly sessions = new Map<string, Session>();

  private constructor(deps: TurnDeps, rulebook: Rulebook) {
    this.deps = deps;
    this.rulebook = rulebook;
  }

  static create(cfg: EngineConfig): Engine {
    const compiled = deepFreeze(cfg.compiled);
    const rulebook = new Rulebook(compiled);
    const deps: TurnDeps = {
      compiled,
      seat: cfg.seat,
      toolPort: cfg.toolPort,
      recordsPort: cfg.recordsPort,
      rulebook,
      clerk: new StatusClerk(),
      masker: new Masker(compiled.maskKeys),
      promptWriter: new PromptWriter(compiled),
      finishDesk: new FinishDesk(),
      deliveryWriter: new DeliveryWriter()
    };
    return new Engine(deps, rulebook);
  }

  /** Rejects with TurnFailure; a failed turn seals nothing. The seat reroutes
   *  between attempts only — the failed attempt ends before the cursor moves.
   *  With ChatOpts the turn arrives routed: `before` seeds what other desks said,
   *  `returnable` opens the return door, and a turn that returns answers with the
   *  reason instead of a record — sealing nothing either. */
  chat(sessionId: string, text: string): Promise<TurnRecord>;
  chat(sessionId: string, text: string, opts: ChatOpts): Promise<TurnRecord | TurnReturned>;
  chat(sessionId: string, text: string, opts: ChatOpts = {}): Promise<TurnRecord | TurnReturned> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new Session(sessionId, new ActionHistory(),
        call => call.data(v => this.deps.masker.maskData(v)));
      this.sessions.set(sessionId, session);
    }
    const live = session;
    return live.enter(() => new Turn(this.deps).run(live, text, opts)).catch((failure: unknown) => {
      if (failure instanceof TurnFailure) this.deps.seat.reroute(failure);
      throw failure;
    });
  }

  /** The Rulebook's own arrays — the list IS the code. */
  guards(): GuardCensus {
    return this.rulebook.guards();
  }

  /** Deny-by-default exclusions; SurfaceGate is their producer. */
  excluded(): readonly string[] {
    return deepFreeze([]);
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
