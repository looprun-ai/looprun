/** The case targets a guard that names nothing in the assembled inventory → validate references RED. */
export default [
  {
    id: '01-greet',
    title: 'Greet and offer help',
    setup: { preset: 'default' },
    turns: [{ userText: 'Hello, what can you do?' }],
    expectations: {
      rubric: [{ id: 'polite', description: 'Answers politely and offers to help.' }],
    },
    targets: ['ghost-guard-that-does-not-exist'],
  },
];
