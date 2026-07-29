/**
 * The chapter-02 cut of the scheduler: ONE read-only tool, no guards written by hand.
 *
 * A spec declares its own tool surface, so the one-tool agent needs its own two-line subclass —
 * handing the three-tool spec a single `toolDef` would advertise rules for tools the model cannot
 * call. Everything else (scope, contract) is shared with the full spec in `spec.ts`.
 */
import { AgentSpecBase } from 'looprun';
import { SCHEDULER_CONTRACT, SCHEDULER_SCOPE } from './contract.js';

export class HelloSchedulerSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler-hello',
      mode: 'CALENDAR',
      persona: 'You are the scheduling agent: you read this person’s calendar and tell them what is on it.',
      scope: SCHEDULER_SCOPE,
      tools: ['listEvents'],
      contract: SCHEDULER_CONTRACT,
      behavior: ['Report the calendar as it came back — an empty day is reported as free, never filled in.'],
    });
  }
}

export const helloSchedulerSpec = new HelloSchedulerSpec();
