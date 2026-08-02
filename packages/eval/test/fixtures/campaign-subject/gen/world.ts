/** Deterministic fixture world for the campaign subject. One preset ('default'). */
import type { AgentWorld } from '@looprun-ai/core';

interface WorldCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  tookEffect?: boolean;
}

export class FactWorld implements AgentWorld {
  toolCalls: WorldCall[] = [];
  sseActions: unknown[] = [];
  [k: string]: unknown;

  constructor(_preset = 'default') {}

  exec(name: string, args: Record<string, unknown>): unknown {
    if (name === 'replyToUser' || name === 'askUser') return { success: true };
    this.toolCalls.push({ name, args, result: { ok: true }, tookEffect: false });
    return { ok: true, fact: 'The Fact Desk answers grounded questions.' };
  }

  advanceTurn(): void {}

  ingestAttachment(): string {
    return 'att_1';
  }
}
