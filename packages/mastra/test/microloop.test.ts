/** The EXPERIMENTAL micro-loop driver's PURE, domain-neutral helpers (renderer / assembly / scrub). */
import { describe, expect, it } from 'vitest';
import {
  renderStructuredReply,
  stripThinkBlocks,
  recordTerminalReply,
  assembleAnswerText,
  scrubSteeringEcho,
  ingestStructuredObject,
  commitFinalReply,
  digestTurnToolResults,
  buildForceCloseMessages,
  STEERING_SENTINEL,
} from '../src/index.js';
import type { AgentWorld } from '../src/index.js';

describe('stripThinkBlocks', () => {
  it('removes a closed <think> block and trims a truncated leading one', () => {
    expect(stripThinkBlocks('a <think>reasoning</think> b')).toBe('a  b');
    // A truncated leading <think> (no close) has ONLY its opening tag trimmed — the text after it stands.
    expect(stripThinkBlocks('<think>cut off answer here')).toBe('cut off answer here');
    expect(stripThinkBlocks('')).toBe('');
  });
});

describe('renderStructuredReply — deterministic, domain-neutral', () => {
  it('joins intro, bullet items, question and caution in a stable order', () => {
    const out = renderStructuredReply({ kind: 'list', intro: 'Here:', items: ['one', 'two'], caution: 'Careful.' });
    expect(out).toBe('Here:\n\n- one\n- two\n\nCareful.');
  });
  it('caps items at 8 and strips think leakage from every field', () => {
    const items = Array.from({ length: 12 }, (_, i) => `i${i}`);
    const out = renderStructuredReply({ kind: 'list', intro: '<think>x</think>Go', items });
    expect(out.startsWith('Go')).toBe(true);
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(8);
  });
  it('renders empty input to the empty string', () => {
    expect(renderStructuredReply({ kind: 'answer' })).toBe('');
  });
  it('is deterministic (same input → same output)', () => {
    const a = { kind: 'answer', intro: 'Hi', question: 'OK?' };
    expect(renderStructuredReply(a)).toBe(renderStructuredReply(a));
  });
});

describe('recordTerminalReply — last non-blank wins, never concatenates', () => {
  it('keeps current on a blank next; replaces on a non-blank next', () => {
    expect(recordTerminalReply('first', '   ')).toBe('first');
    expect(recordTerminalReply('first', 'second')).toBe('second');
  });
});

describe('assembleAnswerText', () => {
  it('prefers the tripwire reason, then the terminal reply, then last text', () => {
    expect(assembleAnswerText({ tripwire: true, tripwireReason: 'blocked', terminalReply: 't', lastText: 'l' })).toBe('blocked');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: 't', lastText: 'l' })).toBe('t');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: '', lastText: 'l' })).toBe('l');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: '', lastText: '' })).toBe('');
  });
});

describe('scrubSteeringEcho', () => {
  it('drops a line carrying the steering sentinel', () => {
    expect(scrubSteeringEcho(`Real answer.\n${STEERING_SENTINEL} close now`)).toBe('Real answer.');
  });
  it('drops a fenced block that narrates the replyStructured schema', () => {
    const echoed = 'Here you go.\n```json\n{ "kind": "answer", "intro": "x" }\n```';
    expect(scrubSteeringEcho(echoed)).toBe('Here you go.');
  });
  it('keeps a legitimate fenced code block (no "kind:" field)', () => {
    const code = 'Run this:\n```sh\nnpm test\n```';
    expect(scrubSteeringEcho(code)).toBe(code);
  });
});

describe('commitFinalReply — single world commit', () => {
  it('routes exactly one replyToUser exec for a non-blank text, none for blank', async () => {
    const calls: Array<[string, unknown]> = [];
    const world = { exec: (n: string, a: unknown) => { calls.push([n, a]); return { success: true }; } } as unknown as AgentWorld;
    await commitFinalReply(world, 'The final reply.');
    await commitFinalReply(world, '   ');
    expect(calls).toEqual([['replyToUser', { text: 'The final reply.' }]]);
  });
});

describe('ingestStructuredObject — v6 generateObject → candidate path (grammar-forced close)', () => {
  // The forced close + onReply redrive no longer go through the LAZY Mastra tool grammar; they call
  // generateObject and feed the resulting OBJECT through this pure ingestion — the SAME render → scrub path
  // the replyStructured tool execute uses.
  it('renders a valid object exactly like the tool path (render → scrub)', () => {
    const obj = { kind: 'list', intro: 'Top posts this week', items: ['alpha', 'beta'] };
    expect(ingestStructuredObject(obj)).toBe('Top posts this week\n\n- alpha\n- beta');
    expect(ingestStructuredObject(obj)).toBe(scrubSteeringEcho(renderStructuredReply(obj)));
  });
  it('strips <think> leakage and scrubs parroted steering inside fields', () => {
    expect(ingestStructuredObject({ kind: 'answer', intro: '<think>plan</think>Here is the answer' })).toBe('Here is the answer');
    expect(
      ingestStructuredObject({ kind: 'list', items: ['keep', `${STEERING_SENTINEL} do not call any more tools`, 'keep too'] }),
    ).toBe('- keep\n- keep too');
  });
  it('empty / null / echo-only object ⇒ empty string (empty-after-scrub SOFT fail)', () => {
    expect(ingestStructuredObject({ kind: 'answer' })).toBe('');
    expect(ingestStructuredObject({})).toBe('');
    expect(ingestStructuredObject(null)).toBe('');
    expect(ingestStructuredObject(undefined)).toBe('');
    expect(ingestStructuredObject({ kind: 'refusal', caution: `${STEERING_SENTINEL} close now` })).toBe('');
  });
  it('empty object is a no-op via recordTerminalReply ⇒ a prior good reply survives (redrive only improves)', () => {
    let terminalReply = recordTerminalReply('', ingestStructuredObject({ kind: 'answer', intro: 'good reply' }));
    expect(terminalReply).toBe('good reply');
    terminalReply = recordTerminalReply(terminalReply, ingestStructuredObject({ kind: 'answer', intro: '   ' }));
    expect(terminalReply).toBe('good reply');
  });
});

describe('digestTurnToolResults / buildForceCloseMessages — v7 MINIMAL force-close context', () => {
  // v7: the forced close no longer sees the WHOLE transcript; it sees only (user text + THIS TURN's fresh
  // tool results + steering). AI-SDK v6 shape: role:'tool' messages whose content is an array of
  // { type:'tool-result', toolName, output: { type:'json'|'text', value } }.
  const toolMsg = (toolName: string, value: unknown, outType: 'json' | 'text' = 'json') => ({
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: `c-${toolName}`, toolName, output: { type: outType, value } }],
  });
  const assistantCall = (toolName: string, input: unknown) => ({
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: `c-${toolName}`, toolName, input }],
  });

  describe('digestTurnToolResults', () => {
    it('renders "### Tool results this turn" with a "- <tool>: <json>" line per successful result', () => {
      const out = digestTurnToolResults([
        assistantCall('listEvents', { range: 'today' }),
        toolMsg('listEvents', { events: [{ title: 'Standup', at: '09:00' }] }),
      ]);
      expect(out).toBe('### Tool results this turn\n- listEvents: {"events":[{"title":"Standup","at":"09:00"}]}');
    });
    it('unwraps {type:"json"}, {type:"text"} and a raw (unwrapped) output', () => {
      const out = digestTurnToolResults([
        toolMsg('getJson', { ok: true, n: 1 }, 'json'),
        toolMsg('getText', 'plain result', 'text'),
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c-raw', toolName: 'getRaw', output: { count: 3 } }] },
      ]);
      expect(out).toContain('- getJson: {"ok":true,"n":1}');
      expect(out).toContain('- getText: "plain result"');
      expect(out).toContain('- getRaw: {"count":3}');
    });
    it('skips runtime terminals and drops results that fail resultOk', () => {
      const out = digestTurnToolResults([
        toolMsg('createPost', { success: true, label: 'Post #1' }),
        toolMsg('replyStructured', { ok: true }),
        toolMsg('replyToUser', { ok: true }),
        toolMsg('deletePost', { success: false, error: 'not allowed' }),
      ]);
      expect(out).toBe('### Tool results this turn\n- createPost: {"success":true,"label":"Post #1"}');
      expect(out.includes('replyStructured')).toBe(false);
      expect(out.includes('deletePost')).toBe(false);
    });
    it('no successful non-terminal result ⇒ empty string (non-array input is safe)', () => {
      expect(digestTurnToolResults([])).toBe('');
      expect(digestTurnToolResults([assistantCall('listEvents', {})])).toBe('');
      expect(digestTurnToolResults([toolMsg('replyToUser', { ok: true })])).toBe('');
      expect(digestTurnToolResults([toolMsg('x', { success: false, error: 'e' })])).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(digestTurnToolResults(null as any)).toBe('');
    });
    it('caps each line at ~600 chars and the whole body at maxChars with a truncation marker', () => {
      const line = digestTurnToolResults([toolMsg('bulk', 'x'.repeat(5000), 'text')]).split('\n')[1];
      expect(line.startsWith('- bulk: ')).toBe(true);
      expect(line.length).toBeLessThanOrEqual('- bulk: '.length + 600);
      const many = digestTurnToolResults(Array.from({ length: 12 }, (_, i) => toolMsg(`t${i}`, 'y'.repeat(600), 'text')));
      expect(many.includes('… (truncated)')).toBe(true);
      expect(digestTurnToolResults([toolMsg('a', 'z'.repeat(100), 'text')], 20).includes('… (truncated)')).toBe(true);
    });
  });

  describe('buildForceCloseMessages', () => {
    const userContent = '## Account state\nplan: Pro\nposts left: 3\n\nList my events for today';
    const steering = `${STEERING_SENTINEL} Close the turn now. Set \`kind\` and put the message in \`intro\`/\`items\`.`;
    const turnMessages = [
      assistantCall('listEvents', { range: 'today' }),
      toolMsg('listEvents', { events: [{ title: 'Standup', at: '09:00' }] }),
    ];

    it('builds ONE user message: user text, then digest, then steering — blank-line separated', () => {
      const built = buildForceCloseMessages({ userContent, turnMessages, steering });
      expect(built.length).toBe(1);
      expect(built[0].role).toBe('user');
      expect(built[0].content).toBe(
        `${userContent}\n\n### Tool results this turn\n- listEvents: {"events":[{"title":"Standup","at":"09:00"}]}\n\n${steering}`,
      );
    });
    it('preserves the Account-state block with NO tool results (digest section omitted)', () => {
      const built = buildForceCloseMessages({ userContent, turnMessages: [], steering });
      expect(built[0].content).toBe(`${userContent}\n\n${steering}`);
      expect(built[0].content.includes('### Tool results this turn')).toBe(false);
    });
    it('honours maxDigestChars for the digest it splices in', () => {
      const tiny = buildForceCloseMessages({ userContent, turnMessages, steering, maxDigestChars: 15 });
      expect(tiny[0].content.includes('… (truncated)')).toBe(true);
    });
    it('the redrive variant carries the correction lines as its steering section', () => {
      const redrive = `${STEERING_SENTINEL} Your last reply needs fixing:\n- Answer in the user's language.\n${STEERING_SENTINEL} Provide the corrected reply as structured fields, in the user's language.`;
      const content = buildForceCloseMessages({ userContent, turnMessages, steering: redrive })[0].content;
      expect(content.startsWith(userContent)).toBe(true);
      expect(content).toContain('### Tool results this turn');
      expect(content).toContain('Your last reply needs fixing:');
      expect(content.endsWith(redrive)).toBe(true);
    });
    it('omits every blank section (blank user text + no results ⇒ just the steering line)', () => {
      expect(buildForceCloseMessages({ userContent: '   ', turnMessages: [], steering })[0].content).toBe(steering);
    });
  });
});
