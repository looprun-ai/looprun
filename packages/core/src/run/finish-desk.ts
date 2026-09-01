/** The one structured closing channel. The finish tool's schema is ONE strict
 *  object serving BOTH the taught description and the validator — a taught key the
 *  validator rejects cannot exist. Early finishes defer; superseded finishes resolve
 *  to the last. The exhaustion closure is a pure function of the recorded acts —
 *  never empty, structurally unable to fabricate, never "nothing changed" over an
 *  unknown write. */
import { z } from 'zod';
import type { Act, Correction, FinishPayload, Json, RawCall, ToolCard } from '../contract/vocabulary.js';

const REPORT_WORDS = ['done', 'held', 'refused', 'unknown', 'no_tool_called'] as const;

/** Every word taught with its evidence class — the model picks by the legend,
 *  never by guessing what a word means. */
const WORD_LEGEND: Readonly<Record<(typeof REPORT_WORDS)[number], string>> = {
  done: 'the call ran and took effect',
  held: 'the call is held for approval',
  refused: 'the call was turned down — either a rule stopped it before it ran, or it ran and the system said no',
  unknown: 'the call ran; the outcome is unclear',
  no_tool_called: 'you chose to answer in words only — no call was made for this'
};

const FIELD_LEGEND: Readonly<Record<string, string>> = {
  message: 'the user-facing closing message',
  report: 'one line per act you claim; a turn with no acts on the record sends an EMPTY list',
  facts: 'the id of every OWED FACT your message expresses, as the prompt numbers them '
    + '(F1, F2 …); never an id whose content your message does not state; empty when the '
    + 'prompt owes none',
  tool: 'the tool the line is about — called, or deliberately not called',
  target: 'the record id the line is about, exactly as the records name it; empty when none',
  word: 'what happened, per the legend'
};

const finishSchema = z.strictObject({
  message: z.string().min(1),
  report: z.array(z.strictObject({
    tool: z.string(),
    target: z.string(),
    word: z.enum(REPORT_WORDS)
  })),
  facts: z.array(z.string())
});

export const FINISH_TOOL = 'finish';

export class FinishDesk {
  /** Rendered FROM the one schema object: the taught keys are the validator's keys. */
  toolCard(): ToolCard {
    const reportShape = finishSchema.shape.report.element.shape;
    const properties: Record<string, Json> = {};
    for (const key of Object.keys(finishSchema.shape)) {
      const base: Record<string, Json> = key === 'report'
        ? { type: 'array', items: { type: 'object', properties: Object.fromEntries(
            Object.keys(reportShape).map(k => [k, {
              type: 'string',
              ...(FIELD_LEGEND[k] !== undefined ? { description: FIELD_LEGEND[k] } : {}),
              ...(k === 'word' ? { enum: [...REPORT_WORDS] } : {})
            }])) } }
        : key === 'facts' ? { type: 'array', items: { type: 'string' } }
        : { type: 'string' };
      properties[key] = FIELD_LEGEND[key] === undefined ? base
        : { ...base, description: FIELD_LEGEND[key] };
    }
    return {
      name: FINISH_TOOL,
      does: `Close the turn: a user-facing message, one report line per claimed act, and the `
        + `ids of the owed facts the message expresses. Words: `
        + REPORT_WORDS.map(w => `${w} = ${WORD_LEGEND[w]}`).join('; ') + '.',
      schema: { type: 'object', properties, required: Object.keys(finishSchema.shape) }
    };
  }

  /** Finish beside domain calls defers with earlyFinish; two finishes → last wins. */
  split(calls: readonly RawCall[]): { readonly domain: readonly RawCall[];
                                      readonly finish: RawCall | null;
                                      readonly corrections: readonly Correction[] } {
    const domain = calls.filter(c => c.tool !== FINISH_TOOL);
    const finishes = calls.filter(c => c.tool === FINISH_TOOL);
    const corrections: Correction[] = [];
    let finish: RawCall | null = null;
    if (finishes.length > 1) corrections.push({ kind: 'staleFinish' });
    if (finishes.length > 0) {
      if (domain.length > 0) {
        corrections.push({ kind: 'earlyFinish' });
      } else {
        finish = finishes[finishes.length - 1];
      }
    }
    return { domain, finish, corrections };
  }

  parse(args: Readonly<Record<string, unknown>>):
    { readonly ok: true; readonly finish: FinishPayload } | { readonly ok: false; readonly detail: string } {
    const parsed = finishSchema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return { ok: false, detail };
    }
    return { ok: true, finish: parsed.data };
  }

  /** The forced-finish instruction, sent with StepInput.forceFinish. */
  force(): string {
    return `Call ${FINISH_TOOL} now with your closing message and the report of what happened. No other call remains available.`;
  }

}
