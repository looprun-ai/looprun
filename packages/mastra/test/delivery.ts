/**
 * What a DELIVERY looks like, so the assertions below say what they mean.
 *
 * Every finalized turn carries the engine's operation record beneath the prose. On a turn that carried
 * out nothing, that record is one sentence, and it is there precisely so a claim in the prose has
 * something standing against it.
 */
import { DEFAULT_ENGINE_TEXT } from '@looprun-ai/core/internal';

const RECORD_CLOSURE_NONE = DEFAULT_ENGINE_TEXT.recordClosureNone;

/** Prose delivered on a turn that carried out nothing: the prose, then the record. */
export const nothingDone = (prose: string): string => `${prose}\n\n${RECORD_CLOSURE_NONE}`;

/** An exhaustion closure over a turn that carried out nothing: the record, then the honest sentence. */
export const closureOverNothing = (sentence: string): string => `${RECORD_CLOSURE_NONE}\n\n${sentence}`;
