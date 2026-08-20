/** Building the agent. A LoopRunAgent IS a Mastra Agent: the same generate/stream,
 *  and `new Mastra({ agents })` takes it unchanged. Nothing about governance is
 *  configured here — it comes from the cards and the world. */
import { LoopRunAgent, UngovernedAgent } from 'looprun';
import { hotel } from './world.js';
import { concierge, hotelContract } from './cards.js';

/** Lesson 2 — the hello world: one spec, one world, one model. */
export const helloAgent = new LoopRunAgent({
  spec: concierge,
  world: hotel,
  model: 'google/gemini-2.5-flash'
});

/** Lessons 3–5 — the same desk under the business card. */
export const governedAgent = new LoopRunAgent({
  spec: concierge,
  contract: hotelContract,
  world: hotel,
  model: 'google/gemini-2.5-flash'
});

/** Lesson 6 — the twin a measurement compares against: the same cards, the same
 *  world, the same prompt, and every guard hook empty. It is what the domain looks
 *  like with the governance removed, and nothing else changed. */
export const ungovernedTwin = new UngovernedAgent({
  spec: concierge,
  contract: hotelContract,
  world: hotel,
  model: 'google/gemini-2.5-flash'
});
