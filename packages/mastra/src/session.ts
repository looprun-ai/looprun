/**
 * @looprun/mastra — per-conversation session state.
 *
 * One LoopRunAgent is registered ONCE (Mastra instance / Studio) while each conversation gets its
 * own world + ledger + message history, keyed by sessionId. A per-session promise-chain mutex
 * serializes concurrent turns of the same conversation.
 */
import { createLedger } from '@looprun/core';
import type { AgentWorld, TurnLedger } from '@looprun/core';

export type WorldFactory<W extends AgentWorld = AgentWorld> = (sessionId: string) => W;

export interface LoopRunSession<W extends AgentWorld = AgentWorld> {
  id: string;
  world: W;
  ledger: TurnLedger;
  turnIndex: number;
  /** Local conversation history (used when no Mastra memory is configured). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  /** Promise-chain mutex tail. */
  chain: Promise<unknown>;
}

export class SessionStore<W extends AgentWorld = AgentWorld> {
  private readonly sessions = new Map<string, LoopRunSession<W>>();
  private readonly factory: WorldFactory<W> | null;
  private readonly singleton: W | null;

  constructor(world: W | WorldFactory<W>) {
    if (typeof world === 'function') {
      this.factory = world as WorldFactory<W>;
      this.singleton = null;
    } else {
      this.factory = null;
      this.singleton = world;
    }
  }

  get(id: string): LoopRunSession<W> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    if (this.singleton && id !== 'default') {
      throw new Error(
        `looprun: session "${id}" requested but the agent was built with a single world INSTANCE — ` +
          'pass a world FACTORY ((sessionId) => world) to support multiple conversations.',
      );
    }
    const world = this.singleton ?? this.factory!(id);
    const session: LoopRunSession<W> = {
      id,
      world,
      ledger: createLedger(),
      turnIndex: 0,
      messages: [],
      chain: Promise.resolve(),
    };
    this.sessions.set(id, session);
    return session;
  }

  end(id: string): void {
    this.sessions.delete(id);
  }

  /** Serialize `fn` on the session's mutex chain. */
  run<T>(session: LoopRunSession<W>, fn: () => Promise<T>): Promise<T> {
    const next = session.chain.then(fn, fn);
    session.chain = next.catch(() => {});
    return next;
  }
}
