/** The four single-step seams. One method each; no options object; no field can carry
 *  an endpoint or governance — ReadyCall is the whole executor payload. Authors and
 *  host devs never see them; composition lives under the facades. */
import type { ModelStep, ReadyCall, StateSnapshot, StepInput, TierSpec, ToolAnswer, ServingHandle } from './vocabulary.js';

export interface ModelPort        { step(input: StepInput): Promise<ModelStep> }
export interface ToolPort         { call(call: ReadyCall): Promise<ToolAnswer>;
                                    /** The rehearsal: the same call against a throwaway copy of the
                                     *  world — a refusal here is what the real call would answer.
                                     *  Absent on hosts that cannot rehearse safely. */
                                    rehearse?(call: ReadyCall): Promise<ToolAnswer> }
export interface RecordsPort      { snapshot(): StateSnapshot }        // worlds only; absence grades trust
export interface ModelRuntimePort { serve(tier: TierSpec): Promise<ServingHandle> }
