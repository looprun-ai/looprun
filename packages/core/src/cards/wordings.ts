/** Every engine sentence, named; defaults + contract overrides resolved ONCE at
 *  compile. One home per sentence: the prompt, the denial, and the inspection row
 *  read the same string. */
import type { EngineSentenceKey, Reason, ResolvedWording, Status } from '../contract/vocabulary.js';
import type { Wording } from './cards.js';

export type { ResolvedWording } from '../contract/vocabulary.js';

const STATUS_PACK: Record<Status | Reason, string> = {
  done: 'done',
  'not-done': 'not done',
  unknown: 'not confirmed',
  held: 'awaiting approval',
  refused: 'refused',
  blocked: 'blocked'
};

const SENTENCE_PACK: Record<EngineSentenceKey, string> = {
  approvalInstruction: 'To approve, reply with the code shown.',
  exhaustionClosure: 'I could not finish everything this turn.',
  unknownStatus: 'I sent it; the service did not confirm the result.',
  questionExpired: 'The approval question expired unanswered; nothing ran.',
  questionSuperseded: 'The open question was settled by the act that ran.',
  questionDeclined: 'You declined, so nothing ran.',
  deniedByGuard: 'A rule stopped this call.'
};

/** Defaults filled, overrides applied per key; the table never carries a hole. */
export function resolveWording(w: Wording | undefined): ResolvedWording {
  return {
    status: { ...STATUS_PACK, ...w?.status },
    sentence: { ...SENTENCE_PACK, ...w?.sentence }
  };
}
