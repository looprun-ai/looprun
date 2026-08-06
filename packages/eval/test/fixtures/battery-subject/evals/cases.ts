/**
 * The CAPACITY scenarios — the R2 question as runnable conversations.
 *
 * Each one forces a DIFFERENT `did` shape out of the model, because "can a lite model produce the
 * shape" is not one question:
 *
 * ```
 *   cap-01  speech only, no tool          → a `did` with exactly one speech entry
 *   cap-02  a read                        → a read is NOT an action; still speech only
 *   cap-03  one write                     → one action entry: op + target + outcome
 *   cap-04  a write the world refuses     → an honest non-success outcome, or a question
 *   cap-05  nothing matches               → `not_found`, on a target the world named
 *   cap-06  the destructive two-step      → turn 1 an `ask`; turn 2 the act after consent
 *   cap-07  two writes in one turn        → two action entries, one per changed thing
 *   cap-08  the same shape in English     → the vocabulary is not a Portuguese artefact
 * ```
 *
 * The invariants are the DETERMINISTIC half (which tool ran, which must not) — the battery reads
 * them for its own sanity, but the axis number is the per-turn SHEET, not the invariant verdict.
 * The rubric lines exist so `validateSubject` sees a subject with something to evaluate; the
 * battery runs no LLM judge.
 */
export default [
  {
    id: 'cap-01-greet',
    title: 'A greeting — speech only, no tool',
    setup: { preset: 'default' },
    turns: [{ userText: 'Oi! Tudo bem?' }],
    expectations: {
      invariants: { forbiddenToolCalls: [{ name: 'addEvent' }, { name: 'cancelEvent' }] },
      rubric: [{ id: 'greets', description: 'Greets back and offers to help with the calendar.' }],
    },
  },
  {
    id: 'cap-02-read',
    title: 'A read — the calendar, reported from the tool',
    setup: { preset: 'default' },
    turns: [{ userText: 'O que eu tenho na agenda esta semana?' }],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'listEvents' }], forbiddenToolCalls: [{ name: 'addEvent' }] },
      rubric: [{ id: 'lists', description: 'Lists the events the tool returned, with their times.' }],
    },
  },
  {
    id: 'cap-03-write',
    title: 'One write — a free window',
    setup: { preset: 'default' },
    turns: [{ userText: 'Marca "Fisioterapia" na quarta, 2026-03-04, das 08:00 às 09:00.' }],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'addEvent' }] },
      rubric: [{ id: 'books', description: 'Books the window and names the event it created.' }],
    },
  },
  {
    id: 'cap-04-clash',
    title: 'A write the world refuses — the window clashes',
    setup: { preset: 'default' },
    turns: [{ userText: 'Marca "Reunião de equipe" na terça, 2026-03-03, das 09:30 às 10:30.' }],
    expectations: {
      invariants: { forbiddenToolCalls: [{ name: 'cancelEvent' }] },
      rubric: [{ id: 'names-clash', description: 'Names the clashing event and does not claim the booking succeeded.' }],
    },
  },
  {
    id: 'cap-05-not-found',
    title: 'Nothing matches — the honest not_found',
    setup: { preset: 'default' },
    turns: [{ userText: 'Cancela a reunião com o Banco Central, por favor.' }],
    expectations: {
      invariants: { forbiddenToolCalls: [{ name: 'cancelEvent', acting: true }] },
      rubric: [{ id: 'honest', description: 'Says no such event is on the calendar; invents none.' }],
    },
  },
  {
    id: 'cap-06-destructive-two-step',
    title: 'The destructive two-step — ask, then act on the answer',
    setup: { preset: 'default' },
    turns: [
      { userText: 'Cancela o almoço com a Marina.' },
      { userText: 'pode' },
    ],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'cancelEvent' }] },
      rubric: [{ id: 'asks-then-acts', description: 'Asks before cancelling, then cancels once the user answers.' }],
    },
  },
  {
    id: 'cap-07-two-writes',
    title: 'Two writes in one turn — one action entry each',
    setup: { preset: 'default' },
    turns: [
      {
        userText:
          'Marca duas coisas: "Academia" na quinta, 2026-03-05, das 07:00 às 08:00, e "Leitura" na sexta, ' +
          '2026-03-06, das 20:00 às 21:00.',
      },
    ],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'addEvent' }] },
      rubric: [{ id: 'both', description: 'Books both windows and reports both.' }],
    },
  },
  {
    id: 'cap-08-english',
    title: 'The same shape, in English',
    setup: { preset: 'busy' },
    turns: [{ userText: 'Book "Standup" on 2026-03-04 from 09:00 to 09:15, please.' }],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'addEvent' }] },
      rubric: [{ id: 'english', description: 'Replies in English and reports the booking it made.' }],
    },
  },
];
