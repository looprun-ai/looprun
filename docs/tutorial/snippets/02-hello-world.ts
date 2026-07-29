/** Chapter 02 · hello world — a governed agent answering a real turn, in about twenty lines. */
import { LoopRunAgent } from 'looprun/mastra';
import { schedulerSpec } from './scheduler/spec.js';
import { listEventsTool } from './scheduler/tools.js';
import { SchedulerWorld } from './scheduler/world.js';

const agent = new LoopRunAgent({
  spec: schedulerSpec,
  world: new SchedulerWorld(),
  toolDefs: [listEventsTool], // the one-tool cut: read the calendar, change nothing
  model: 'google/gemini-flash-lite-latest',
});

const result = await agent.generate('What is on my calendar this week?');
console.log(result.text);
