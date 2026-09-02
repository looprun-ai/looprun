/** The turn's owed words as labeled facts, assembled pure: act facts in act order,
 *  then every open question as an ask fact and its code fact, then the question
 *  closures, then the notes — the same order the floor delivery prints. Each fact
 *  carries the state the reply must agree with; no fact names an internal tool.
 *
 *  A fact is NUMBERED by its position: F1, F2, F3 … The desk reads the numbered
 *  block before it writes, and its finish names the ids its message expresses. The
 *  ids are the engine's own labels — they never reach the operator.
 *
 *  The same facts charge what the desk wrote: every literal they mint must ride in the
 *  message, every id must be named, and no label of this prompt may survive into the
 *  words the operator reads. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';
import { TOKEN_MARK, canonicalAmount, carriedIds, figureRuns } from '../cards/catalog.js';
import { FINISH_TOOL } from './finish-desk.js';

export interface DeliveryFact {
  readonly kind: 'ask' | 'code' | 'receipt' | 'refusal' | 'closure' | 'note';
  readonly text: string;
  readonly state: 'ran' | 'refused' | 'held' | null;
}

/** What the reply must agree with about a fact whose act has a standing. */
export const STATE_TAG: Readonly<Record<'ran' | 'refused' | 'held', string>> = {
  ran: 'THIS RAN and took effect this turn',
  refused: 'this did NOT run — the records refuse it',
  held: 'this has NOT run — it stands held awaiting the operator\'s code. '
    + 'Use NO past tense about this act in any wording: not done, not processed, '
    + 'not recorded, not started, not "as requested" — it is waiting, nothing more'
};

/** The id a fact carries in the prompt and in the finish: F1, F2, F3 … */
export function factId(index: number): string {
  return `F${String(index + 1)}`;
}

/** An act sentence spoken: the human content without the log prefix. The record line
 *  is `head(args) — status` followed by a tail (`. TAIL`) or a detail (`(DETAIL)`);
 *  what a delivery may carry is the tail or the detail, never the line. A sentence
 *  with no log prefix is already speech and stays itself. */
export function spokenActSentence(sentence: string): string {
  const dash = sentence.indexOf(' — ');
  if (dash === -1 || !sentence.slice(0, dash).includes('(')) return sentence;
  const tool = sentence.slice(0, sentence.indexOf('('));
  const rest = sentence.slice(dash + 3);
  const status = rest.startsWith('not-done') ? 'not-done'
    : rest.startsWith('done') ? 'done'
    : rest.startsWith('unknown') ? 'unknown' : null;
  if (status === null) return sentence;
  let tail = rest.slice(status.length).trim();
  // The restatement note is bookkeeping, not content.
  tail = tail.replace('(already ran; first result restated)', '').trim();
  if (tail.startsWith('(') && tail.endsWith(')')) tail = tail.slice(1, -1).trim();
  if (tail.startsWith('.') || tail.startsWith(',')) tail = tail.slice(1).trim();
  if (tail === 'awaiting approval') return 'This stands held, awaiting the operator\'s code.';
  if (tail !== '') return tail.endsWith('.') || tail.endsWith('!') || tail.endsWith('?')
    ? tail : `${tail}.`;
  if (status === 'done') return `The ${tool} call ran and took effect.`;
  if (status === 'unknown') return `The ${tool} call could not be confirmed.`;
  return `The ${tool} call did not run.`;
}

/** The owed facts as the desk reads them — one numbered line each. */
export function numberedFactLines(facts: readonly DeliveryFact[]): string {
  return facts.map((f, i) => f.kind === 'code'
    ? `[${factId(i)}] To proceed, the operator replies with just this code: ${f.text}.`
    : `[${factId(i)}] ${f.state === null ? '' : `[${STATE_TAG[f.state]}] `}${f.text}`).join('\n');
}

/** The ids a finish names, read the way a label is read: surrounding space is not part
 *  of an id and neither is the case of its letter. */
function claimedIds(claimed: readonly string[]): readonly string[] {
  return [...new Set(claimed.map(id => id.trim().toUpperCase()).filter(id => id !== ''))];
}

/** Every fact id the finish fails to name. Token comparison only — no word is read. */
export function factIdMisses(claimed: readonly string[], facts: readonly DeliveryFact[]):
  readonly string[] {
  const named = claimedIds(claimed);
  return facts.map((_, i) => factId(i)).filter(id => !named.includes(id));
}

/** Every id the finish names that this turn owes no fact for. A finish that claims an
 *  id the prompt never numbered has told the engine about a sentence that does not
 *  exist, and the whole list is worth as much as its worst entry. */
export function unowedFactIds(claimed: readonly string[], facts: readonly DeliveryFact[]):
  readonly string[] {
  const owed = facts.map((_, i) => factId(i));
  return claimedIds(claimed).filter(id => !owed.includes(id));
}

/** What a message fails to carry of the literals the records mint: every identifier,
 *  every canonical figure (token-boundary by construction — figureRuns yields whole
 *  digit runs only), every code. The identifiers leave the source before its figures
 *  are counted, so an id's digits never masquerade as an amount the reply owes. */
export function gateMisses(facts: readonly DeliveryFact[], message: string): readonly string[] {
  const misses: string[] = [];
  const said = new Set(figureRuns(message).map(canonicalAmount));
  const src = facts.filter(f => f.kind !== 'code').map(f => f.text).join(' ');
  const ids = carriedIds(src);
  for (const id of ids) {
    if (!message.includes(id)) misses.push(`id ${id}`);
  }
  let bare = src;
  for (const id of ids) bare = bare.split(id).join(' ');
  for (const figure of new Set(figureRuns(bare).map(canonicalAmount))) {
    if (!said.has(figure)) misses.push(`figure ${figure}`);
  }
  for (const f of facts) {
    if (f.kind === 'code' && !message.includes(f.text)) misses.push(`code ${f.text}`);
  }
  // A fact listing the record's own tokens forces each one verbatim: the ask must
  // reach the operator with the exact words an answer can carry, in any language.
  for (const f of facts) {
    const at = f.text.indexOf(TOKEN_MARK);
    if (at === -1) continue;
    const tail = f.text.slice(at + TOKEN_MARK.length);
    const end = tail.indexOf(' \u2014 ');
    const listed = (end === -1 ? tail : tail.slice(0, end)).split(' | ');
    for (const token of listed) {
      const word = token.trim();
      if (word !== '' && !message.includes(word)) misses.push(`token ${word}`);
    }
  }
  return misses;
}

/** Whether a text carries `token` as a word of its own — nothing wordy on either side.
 *  A label the engine minted is unspeakable in every wrapper the desk might reach for,
 *  and the wrapper is what varies: brackets, parentheses, a bare word after a comma.
 *  The record's own names are untouched, because none of them IS the token. */
function carriesToken(text: string, token: string): boolean {
  const wordy = (ch: string | undefined): boolean => ch !== undefined
    && (ch === '_' || (ch >= '0' && ch <= '9')
      || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
  for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) {
    if (!wordy(text[at - 1]) && !wordy(text[at + token.length])) return true;
  }
  return false;
}

/** The engine's own labels a text carries: any bracketed fact tag — `[F1]`, `[F7]`,
 *  whatever the number and whether or not this turn numbered it — every label THIS
 *  turn minted, standing as a word wherever the desk put it, and the state tags the
 *  prompt stamps beside them. They are this prompt's bookkeeping, and a reply printing
 *  one has bolted an internal token onto the operator's words.
 *
 *  The minted labels are a closed set the engine wrote itself, so nothing is guessed
 *  from shape: `F1` answers only where this turn numbered a first fact, and a name the
 *  records carry is never one of them, in brackets or out. */
export function engineLabels(text: string, facts: readonly DeliveryFact[] = []):
  readonly string[] {
  const found = new Set<string>();
  for (let i = 0; i + 3 < text.length + 1; i++) {
    if (text[i] !== '[' || text[i + 1] !== 'F') continue;
    let at = i + 2;
    while (at < text.length && text[at] >= '0' && text[at] <= '9') at += 1;
    if (at > i + 2 && text[at] === ']') found.add(text.slice(i, at + 1));
  }
  facts.forEach((_, i) => {
    const id = factId(i);
    if (carriesToken(text, id)) found.add(id);
  });
  for (const tag of Object.values(STATE_TAG)) {
    if (text.includes(tag)) found.add(tag);
  }
  return [...found];
}

/** The text with every fact label struck out — `[F7]` as the prompt prints it and the
 *  bare `F7` a desk writes when it cites the block in a sentence. The number in a label
 *  is this prompt's own counting, never an amount the records carry, and the figure
 *  walks must not read its digits as one. */
export function withoutFactLabels(text: string): string {
  const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
  const isWordy = (ch: string): boolean => isDigit(ch) || ch === '_'
    || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  const chars = [...text];
  for (let at = 0; at < chars.length; at += 1) {
    if (chars[at] !== 'F' || (at > 0 && isWordy(chars[at - 1]))) continue;
    let end = at + 1;
    while (end < chars.length && isDigit(chars[end])) end += 1;
    if (end === at + 1 || (end < chars.length && isWordy(chars[end]))) continue;
    for (let k = at; k < end; k += 1) chars[k] = ' ';
    at = end;
  }
  return chars.join('');
}

/** A bare world code standing where an authored sentence should: four or more
 *  characters, the first A-Z, the rest A-Z, digits or underscore. A turn whose owed
 *  word is one of these has no sentence to render — the floor delivers it literally
 *  and the gap stays visible. */
export function isCodeShaped(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (!(t[0] >= 'A' && t[0] <= 'Z')) return false;
  return [...t].every(c => (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_');
}

/** The one user-role message that turns the desk into the closer of its own turn. It
 *  rides below the prefix the desk has been reading all turn — same system, same tool
 *  cards, same acts — and carries the numbered owed facts and the order to write. The
 *  ban on bracketed codes is part of the order: a numbered brief teaches a model to
 *  echo the numbers, and the walk that would catch them cannot say why. */
/** The one user-role message of the act micro-step: the operator's own words, and the
 *  order to answer them on the record. A rule that forbids the operation is not a
 *  reason to skip the call — the denial is what names the blocker, and words written
 *  instead of it name nothing the records can be held to. A surface that performs
 *  nothing the operator asked for is answered by calling nothing. */
export function actOrder(userText: string): string {
  return `The operator's message asks this house to CHANGE something: "${userText}". `
    + 'Call the one tool below that performs it now — nothing else. Choose its arguments '
    + 'from the conversation and the records above. If a rule forbids the operation, the '
    + 'call is still how the records answer it: make the call and the refusal will carry '
    + 'the reason. A rule you can see in the records does not excuse the call: you are '
    + 'not the one who decides whether it is allowed, and a refusal you write yourself '
    + 'stands on nothing the operator can be shown. If no tool below performs what was '
    + 'asked, call nothing.';
}

export function closeInstruction(facts: readonly DeliveryFact[]): string {
  return ['THE DESK HOLDS — the complete record of what this turn did. Nothing else ran, '
    + 'was charged, booked, held or changed.',
  numberedFactLines(facts),
  '',
  `Call ${FINISH_TOOL} now with the closing reply to the operator, in their own language, `
    + 'as one flowing reply — the words a person at a counter would say. No lists, no '
    + 'headings, no bracketed codes, nothing bolted on: the fact ids above are the engine\'s '
    + 'own labels and never appear in the reply. Carry every numbered fact, and name the id '
    + 'of every one your message expresses.'].join('\n');
}

export function assembleFacts(acts: readonly Act[], open: readonly Question[],
  closed: readonly { readonly id: string; readonly why: QuestionClose }[],
  notes: readonly string[]): readonly DeliveryFact[] {
  const facts: DeliveryFact[] = [];
  for (const a of acts) {
    // An owed text still carrying a slot has nothing true to say: it never
    // becomes a fact — a placeholder never reaches the operator.
    if (a.owed !== null && a.owed.text.includes('{')) continue;
    if (a.owed !== null) {
      // A bare world code where an authored sentence should stand is spoken inside a
      // human sentence — the code verbatim, never alone.
      const text = isCodeShaped(a.owed.text)
        ? `That cannot be done — the records refuse it: ${a.owed.text.trim()}.`
        : a.owed.text;
      facts.push({ kind: a.owed.kind, text,
        state: a.owed.kind === 'receipt' ? 'ran' : 'refused' });
      continue;
    }
    // A done act that changed the world is never silent: with no authored after,
    // the act's spoken sentence is the receipt — the reply may say less than the
    // record, never the opposite of it.
    if (a.status === 'done' && a.effect !== 'read') {
      facts.push({ kind: 'receipt', text: spokenActSentence(a.sentence), state: 'ran' });
    }
    // A refused act is never silent either: the rule that refused it is owed to the
    // operator, spoken — and its literals (a member id, a figure, a code) are forced
    // into the delivery in whatever language the reply takes. A held act stays out:
    // its ask and code already carry the turn.
    if (a.status === 'not-done' && a.reason !== 'held') {
      const spoken = spokenActSentence(a.sentence);
      if (!facts.some(f => f.kind === 'refusal' && f.text === spoken)) {
        facts.push({ kind: 'refusal', text: spoken, state: 'refused' });
      }
    }
  }
  for (const q of open) {
    facts.push({ kind: 'ask', text: q.sentence, state: 'held' });
    facts.push({ kind: 'code', text: q.code, state: null });
  }
  for (const c of closed) {
    facts.push({ kind: 'closure', text: `Question ${c.id} closed: ${c.why}.`, state: null });
  }
  for (const n of notes) facts.push({ kind: 'note', text: n, state: null });
  return facts;
}
