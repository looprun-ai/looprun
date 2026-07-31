/** Chapter 02 · hello world — a governed agent answering a real turn, in about twenty lines. */
import { LoopRunAgent } from 'looprun/mastra';
import { helloSchedulerSpec } from './scheduler/hello-spec.js';
import { listEventsTool } from './scheduler/tools.js';
import { SchedulerWorld } from './scheduler/world.js';

const agent = new LoopRunAgent({
  spec: helloSchedulerSpec, // the one-tool cut of the scheduler: listEvents, nothing else
  world: () => new SchedulerWorld(), // a factory: one world per session
  toolDefs: [listEventsTool],
  model: 'google/gemini-3.1-flash-lite', // Mastra router string; needs GOOGLE_GENERATIVE_AI_API_KEY
});

// LoopRunOptions: `loopRun.sessionId` keys the conversation — one world per session.
const result = await agent.generate('What is on my calendar this week?', {
  loopRun: { sessionId: 'demo' },
});
console.log(result.text);
