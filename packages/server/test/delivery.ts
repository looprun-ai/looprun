/**
 * What a DELIVERY looks like, so the assertions below say what they mean.
 *
 * Every finalized turn carries the engine's operation record beneath the prose. On a turn that carried
 * out nothing, that record is one sentence, and it is there precisely so a claim in the prose has
 * something standing against it.
 */
import { RECORD_CLOSURE_NONE } from '@looprun-ai/core/internal';

/** Prose delivered on a turn that carried out nothing: the prose, then the record. */
export const nothingDone = (prose: string): string => `${prose}\n\n${RECORD_CLOSURE_NONE}`;
