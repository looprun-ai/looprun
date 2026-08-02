/** Two rubric-only cases: one single-turn (the replayer reaches a verdict) and one MULTI-TURN (the
 *  replayer cannot construct cross-turn state → premise SKIPS it LOUDLY as advisory). Reached ratio
 *  1/2 = 0.50 meets the default floor, so preflight stays green with advisory-only premise output. */
export default [
  {
    id: '01-greet',
    title: 'Greet and offer help',
    setup: { preset: 'default' },
    turns: [{ userText: 'Hello, what can you do?' }],
    expectations: {
      rubric: [{ id: 'polite', description: 'Answers politely and offers to help.' }],
    },
  },
  {
    id: '02-followup',
    title: 'A two-turn exchange the replayer cannot reconstruct',
    setup: { preset: 'default' },
    turns: [{ userText: 'Look up a fact.' }, { userText: 'And another, please.' }],
    expectations: {
      rubric: [{ id: 'grounded', description: 'Answers grounded in tool output across both turns.' }],
    },
  },
];
