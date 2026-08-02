/** One rubric-only case (no deterministic invariants) — a reply-only scripted model passes the gate. */
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
];
