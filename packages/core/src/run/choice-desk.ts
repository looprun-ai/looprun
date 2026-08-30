/** The choice question lifecycle as the named state machine open → answered → consumed.
 *  A coded argument is licensed by an ANSWER against a question that is OPEN right now: the
 *  refusal that asks records the question and mints its code, the operator's reply records the
 *  option against it, and the licensed act consumes it. A consumed question licenses nothing
 *  ever again — the next call on the same argument opens a fresh question under a fresh code.
 *  ONE question stands per (tool, argument): a re-ask returns the standing question and its
 *  code, never a second live code for the same choice. While a question is open the LATEST
 *  answer is the one it carries; an answer landing on a question that is not open lands
 *  nowhere. Turn work stays on a working overlay: seal commits it, a discarded draft leaves
 *  no trace. */
import { randomInt } from 'node:crypto';
import type { StandingChoices, Json } from '../contract/vocabulary.js';
import { choiceKey } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';

interface Stored {
  readonly tool: string;
  readonly arg: string;
  readonly options: readonly string[];
  readonly code: string;
  /** The option the operator's latest answer named; null while unanswered. */
  readonly answer: string | null;
  readonly state: 'open' | 'consumed';
}

/** The whitespace-separated tokens of a text, in the order they were written. */
function spacedTokens(text: string): readonly string[] {
  const out: string[] = [];
  let token = '';
  for (const c of text) {
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') { token += c; continue; }
    if (token !== '') out.push(token);
    token = '';
  }
  if (token !== '') out.push(token);
  return out;
}

/** The option ONE message answers a question with: the message is an option token and that
 *  question's own code, those two and nothing else. An option token is the option's place in
 *  the declared order, or the option's own literal case folded — a literal is an identifier,
 *  not prose. A message carrying anything more answers nothing: the operator is talking, not
 *  choosing. */
export function answeredOption(message: string, options: readonly string[],
                               code: string): string | null {
  const said = spacedTokens(message);
  if (said.length !== 2 || said[1] !== code) return null;
  const folded = said[0].toLowerCase();
  for (let at = 0; at < options.length; at += 1) {
    if (said[0] === String(at + 1) || folded === options[at].toLowerCase()) return options[at];
  }
  return null;
}

export class ChoiceDesk {
  private committed = new Map<string, Stored>();
  private working = new Map<string, Stored>();
  private readonly mint: () => string;

  constructor(mint: () => string = () => String(randomInt(0, 1_000_000)).padStart(6, '0')) {
    this.mint = mint;
  }

  /** A fresh turn attempt works on a copy; a discarded draft leaves no trace. */
  beginTurn(): void {
    this.working = new Map(this.committed);
  }

  commit(): void {
    this.committed = new Map(this.working);
  }

  /** The question the desk puts to the operator, and the sentence that asks it. The standing
   *  question for this argument is returned whole — a re-ask never mints a second code. */
  raise(tool: string, arg: string, options: readonly string[]): string {
    const key = choiceKey(tool, arg);
    const standing = this.working.get(key);
    if (standing === undefined || standing.state !== 'open') {
      this.working.set(key, { tool, arg, options, code: this.mintCode(),
                              answer: null, state: 'open' });
    }
    const question = this.working.get(key);
    if (question === undefined) throw new Error(`no choice question for '${arg}'`);
    const listed = question.options
      .map((option, at) => `[${String(at + 1)}] ${option}`).join(' · ');
    return `'${arg}' is a choice, and no answer of the operator licenses a value for it. `
      + `Ask the operator — in the language of the operator's latest message — to choose one `
      + `of ${listed}, and to reply with the option and this code alone, nothing else: `
      + `<option> ${question.code}`;
  }

  /** The operator's message, read against every OPEN question. An answer replaces whatever
   *  that question carried before; a message answering nothing changes nothing. */
  readAnswer(userText: string): void {
    for (const [key, stored] of this.working) {
      if (stored.state !== 'open') continue;
      const answer = answeredOption(userText, stored.options, stored.code);
      if (answer !== null) this.working.set(key, { ...stored, answer });
    }
  }

  /** What the guards may read: every OPEN question by act and argument, with the option its
   *  latest answer named. A consumed question appears nowhere — it licenses nothing. */
  standing(): StandingChoices {
    const rows: Record<string, { code: string; answer: string | null }> = {};
    for (const [key, stored] of this.working) {
      if (stored.state !== 'open') continue;
      rows[key] = { code: stored.code, answer: stored.answer };
    }
    return deepFreeze(rows);
  }

  /** The act ran on the answer, so the question is spent. A later call on the same argument
   *  finds nothing open and asks again, under a code the operator has not yet seen. */
  consume(tool: string, args: Readonly<Record<string, Json>>): void {
    for (const [key, stored] of this.working) {
      if (stored.state !== 'open' || stored.tool !== tool || stored.answer === null) continue;
      const raw = args[stored.arg];
      const value = typeof raw === 'string' ? raw
        : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null;
      if (value === stored.answer) this.working.set(key, { ...stored, state: 'consumed' });
    }
  }

  private mintCode(): string {
    for (;;) {
      const code = this.mint();
      const collides = [...this.working.values()]
        .some(s => s.state === 'open' && s.code === code);
      if (!collides) return code;
    }
  }
}
