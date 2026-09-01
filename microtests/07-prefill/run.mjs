// Microtest 7 — REAL prefill cost of the AS-IS mutating-system layout versus the
// TO-BE frozen-prefix layout, on a local llama.cpp server.
//
// The ruler: /completion with cache_prompt:true, reading timings.prompt_n — the tokens
// the server actually prefilled. Tokens served from the KV cache are excluded from it.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildHead, buildState, SEED_BOOKINGS, microStepCard } from './prompts.mjs';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:8081';
const OUT = new URL('.', import.meta.url).pathname;
const TRANSCRIPTS = `${OUT}transcripts`;
mkdirSync(TRANSCRIPTS, { recursive: true });

const N_PREDICT = 64;

// ── the box ────────────────────────────────────────────────────────────────────
async function post(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function tokenCount(content) {
  const r = await post('/tokenize', { content });
  return r.tokens.length;
}

async function eraseSlot() {
  const r = await fetch(`${SERVER}/slots/0?action=erase`, { method: 'POST' });
  if (!r.ok) throw new Error(`slot erase → ${r.status} ${await r.text()}`);
}

// Qwen chat template, rendered by hand so the bytes are fully under our control.
// The empty <think></think> pair is what enable_thinking:false emits — thinking is OFF.
const THINK_OFF = '<think>\n\n</think>\n\n';

function render(system, messages) {
  let s = `<|im_start|>system\n${system}<|im_end|>\n`;
  for (const m of messages) s += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
  return `${s}<|im_start|>assistant\n${THINK_OFF}`;
}

const calls = [];
let phase = 'init';

async function call(label, system, messages) {
  const prompt = render(system, messages);
  const promptTokens = await tokenCount(prompt);
  const t0 = Date.now();
  const r = await post('/completion', {
    prompt,
    cache_prompt: true,
    temperature: 0,
    top_k: 1,
    n_predict: N_PREDICT,
    stream: false,
  });
  const wallMs = Date.now() - t0;
  const t = r.timings;
  const rec = {
    label,
    phase,
    promptTokensTotal: promptTokens,
    prefillTokens: t.prompt_n,
    prefillMs: t.prompt_ms,
    prefillTokPerS: t.prompt_n > 0 ? +(t.prompt_n / (t.prompt_ms / 1000)).toFixed(2) : null,
    decodeTokens: t.predicted_n,
    decodeMs: t.predicted_ms,
    decodeTokPerS: +(t.predicted_n / (t.predicted_ms / 1000)).toFixed(2),
    wallMs,
    promptChars: prompt.length,
    content: r.content,
    hasThinkTag: r.content.includes('<think>'),
  };
  calls.push(rec);
  process.stdout.write(
    `  ${label.padEnd(34)} prefill=${String(rec.prefillTokens).padStart(6)}  ` +
      `${String(rec.prefillTokPerS ?? '-').padStart(8)} tok/s  decode=${String(rec.decodeTokens).padStart(3)} ` +
      `@${String(rec.decodeTokPerS).padStart(6)} tok/s  wall=${wallMs}ms\n`,
  );
  return rec;
}

// ── RAM sampling ───────────────────────────────────────────────────────────────
const samples = [];
let serverPid = null;
try {
  serverPid = execSync("pgrep -f 'llama-server.*8081'").toString().trim().split('\n')[0];
} catch {}

function sampleRam() {
  if (!serverPid) return;
  try {
    const rssKb = Number(execSync(`ps -o rss= -p ${serverPid}`).toString().trim());
    samples.push({ t: Date.now(), phase, rssMb: +(rssKb / 1024).toFixed(1) });
  } catch {}
}
const ramTimer = setInterval(sampleRam, 2000);

// ── the conversation ───────────────────────────────────────────────────────────
// 8 turns. Turns 2, 4 and 6 carry a write act, so STATE changes after each of them.
// A write turn costs two model calls: the call that emits the tool line, and the call
// that speaks after the tool result is back.

const OPERATOR = [
  'Good morning. Which quays can take a vessel of twelve point eight metres draft today?',
  'Book the Northern Gantry on Q-01 from 06:00 to 14:00 tomorrow. I approve the booking.',
  'What does an hour on a berth cost?',
  'Move that booking to start at 08:00 instead. I approve the amendment.',
  'Is the Salt Harrier cleared to come alongside?',
  'Cancel BK-4403 please. I approve the cancellation.',
  'How long is the waitlist on Q-02?',
  'Summarise for me what is booked on Q-01 today.',
];

const WRITE_TURNS = new Set([2, 4, 6]);

const TOOL_RESULTS = {
  2: 'TOOL RESULT create_booking → { "bookingCode": "BK-4404", "vesselCode": "VS-1002", "quayCode": "Q-01", "startHour": 6, "endHour": 14, "status": "confirmed" }',
  4: 'TOOL RESULT amend_booking → { "bookingCode": "BK-4404", "startHour": 8, "endHour": 14 }',
  6: 'TOOL RESULT cancel_booking → { "bookingCode": "BK-4403", "feeApplied": 0 }',
};

function mutate(bookings, turn) {
  if (turn === 2)
    return [...bookings, { code: 'BK-4404', vessel: 'VS-1002', quay: 'Q-01', start: 6, end: 14, status: 'confirmed' }];
  if (turn === 4)
    return bookings.map((b) => (b.code === 'BK-4404' ? { ...b, start: 8 } : b));
  if (turn === 6)
    return bookings.map((b) => (b.code === 'BK-4403' ? { ...b, status: 'cancelled' } : b));
  return bookings;
}

const head = buildHead('bookings', { sharedFirst: true });

// ARM AS-IS — system = head + the mutating STATE tail, rebuilt on every model step.
async function armAsIs(run) {
  phase = `as-is/run${run}`;
  await eraseSlot();
  console.log(`\n[ARM AS-IS · run ${run}]`);
  let bookings = SEED_BOOKINGS;
  const messages = [];
  const perTurn = [];
  for (let turn = 1; turn <= 8; turn++) {
    const before = calls.length;
    const system = `${head}\n${buildState(bookings)}\n`;
    messages.push({ role: 'user', content: OPERATOR[turn - 1] });
    const a = await call(`as-is r${run} t${turn} step1`, system, messages);
    messages.push({ role: 'assistant', content: a.content });
    if (WRITE_TURNS.has(turn)) {
      messages.push({ role: 'user', content: TOOL_RESULTS[turn] });
      bookings = mutate(bookings, turn);
      const system2 = `${head}\n${buildState(bookings)}\n`;
      const b = await call(`as-is r${run} t${turn} step2`, system2, messages);
      messages.push({ role: 'assistant', content: b.content });
    }
    perTurn.push(turnSummary(turn, calls.slice(before)));
  }
  writeFileSync(`${TRANSCRIPTS}/as-is-run${run}.json`, JSON.stringify({ messages }, null, 2));
  return perTurn;
}

// ARM TO-BE — system = the frozen head alone, byte-identical forever; STATE rides as
// the LAST user message of every step; history is append-only.
//
// `stateMode` is the one knob the design leaves open, and it decides the whole result:
//   'replace'  — exactly one STATE block exists, at the end. The stale one is dropped.
//   'accumulate' — every turn appends a fresh STATE and the stale ones stay in history.
async function armToBe(run, stateMode = 'replace') {
  phase = `to-be-${stateMode}/run${run}`;
  await eraseSlot();
  console.log(`\n[ARM TO-BE · ${stateMode} · run ${run}]`);
  let bookings = SEED_BOOKINGS;
  const history = [];
  const perTurn = [];
  const tag = stateMode === 'replace' ? `to-be r${run}` : `to-be-acc r${run}`;
  const withState = () =>
    stateMode === 'replace' ? [...history, { role: 'user', content: buildState(bookings) }] : history;
  for (let turn = 1; turn <= 8; turn++) {
    const before = calls.length;
    history.push({ role: 'user', content: OPERATOR[turn - 1] });
    if (stateMode === 'accumulate') history.push({ role: 'user', content: buildState(bookings) });
    const a = await call(`${tag} t${turn} step1`, head, withState());
    history.push({ role: 'assistant', content: a.content });
    if (WRITE_TURNS.has(turn)) {
      history.push({ role: 'user', content: TOOL_RESULTS[turn] });
      bookings = mutate(bookings, turn);
      if (stateMode === 'accumulate') history.push({ role: 'user', content: buildState(bookings) });
      const b = await call(`${tag} t${turn} step2`, head, withState());
      history.push({ role: 'assistant', content: b.content });
    }
    perTurn.push(turnSummary(turn, calls.slice(before)));
  }
  writeFileSync(`${TRANSCRIPTS}/to-be-${stateMode}-run${run}.json`, JSON.stringify({ messages: withState() }, null, 2));
  return perTurn;
}

function turnSummary(turn, recs) {
  return {
    turn,
    steps: recs.length,
    prefillTokens: recs.reduce((s, r) => s + r.prefillTokens, 0),
    prefillMs: +recs.reduce((s, r) => s + r.prefillMs, 0).toFixed(1),
    prefillTokPerS: recs.length ? +(recs.reduce((s, r) => s + r.prefillTokens, 0) / (recs.reduce((s, r) => s + r.prefillMs, 0) / 1000)).toFixed(1) : null,
    decodeTokens: recs.reduce((s, r) => s + r.decodeTokens, 0),
    decodeTokPerS: +(recs.reduce((s, r) => s + r.decodeTokens, 0) / (recs.reduce((s, r) => s + r.decodeMs, 0) / 1000)).toFixed(2),
    // the trade the append-only arm makes: how big the prompt itself has become
    contextTokensAtTurnEnd: recs[recs.length - 1].promptTokensTotal,
    wallMs: recs.reduce((s, r) => s + r.wallMs, 0),
  };
}

// ── rider 1 — the shared-[A] desk switch ───────────────────────────────────────
async function rider1(sharedFirst) {
  phase = `rider1/${sharedFirst ? 'shared-first' : 'control'}`;
  await eraseSlot();
  const tag = sharedFirst ? 'sharedFirst' : 'control';
  console.log(`\n[RIDER 1 · ${tag}]`);
  const headA = buildHead('bookings', { sharedFirst });
  const headB = buildHead('pilotage', { sharedFirst });
  const state = buildState(SEED_BOOKINGS);

  const warm = [];
  const msgs = [];
  for (const q of OPERATOR.slice(0, 3)) {
    msgs.push({ role: 'user', content: q });
    msgs.push({ role: 'user', content: state });
    const r = await call(`r1 ${tag} deskA warm`, headA, msgs);
    msgs.push({ role: 'assistant', content: r.content });
    warm.push(r.prefillTokens);
  }
  // The switch: a fresh conversation on the OTHER desk.
  const switchCall = await call(`r1 ${tag} deskB switch`, headB, [
    { role: 'user', content: 'Which pilots are free for a night movement?' },
    { role: 'user', content: state },
  ]);
  return {
    variant: tag,
    headATokens: await tokenCount(headA),
    headBTokens: await tokenCount(headB),
    deskAWarmPrefill: warm,
    deskBSwitchPrefill: switchCall.prefillTokens,
    deskBSwitchMs: switchCall.prefillMs,
  };
}

// ── rider 2 — the owed-read micro-step fork ────────────────────────────────────
async function rider2() {
  phase = 'rider2';
  await eraseSlot();
  console.log('\n[RIDER 2 · micro-step fork]');
  const history = [];
  let bookings = SEED_BOOKINGS;
  const withState = () => [...history, { role: 'user', content: buildState(bookings) }];
  // warm the TO-BE conversation over three turns
  for (let turn = 1; turn <= 3; turn++) {
    history.push({ role: 'user', content: OPERATOR[turn - 1] });
    const a = await call(`r2 warm t${turn}`, head, withState());
    history.push({ role: 'assistant', content: a.content });
    if (WRITE_TURNS.has(turn)) {
      history.push({ role: 'user', content: TOOL_RESULTS[turn] });
      bookings = mutate(bookings, turn);
      const b = await call(`r2 warm t${turn} step2`, head, withState());
      history.push({ role: 'assistant', content: b.content });
    }
  }
  history.push({ role: 'user', content: OPERATOR[3] });
  const mainBefore = await call('r2 main-loop before fork', head, withState());
  // the fork: SAME system, forked messages — one tool card, one step
  const fork = await call('r2 FORK single-tool micro-step', head, [
    ...history,
    { role: 'user', content: microStepCard('read_quay') },
  ]);
  // back to the main loop, exactly the call we made before the fork
  const mainAfter = await call('r2 main-loop after fork', head, withState());
  return {
    mainLoopBeforeForkPrefill: mainBefore.prefillTokens,
    forkPrefill: fork.prefillTokens,
    forkMs: fork.prefillMs,
    mainLoopAfterForkPrefill: mainAfter.prefillTokens,
    mainLoopSurvived: mainAfter.prefillTokens <= mainBefore.prefillTokens,
  };
}

// ── ruler verification ─────────────────────────────────────────────────────────
async function verifyRuler() {
  phase = 'ruler';
  await eraseSlot();
  console.log('\n[RULER VERIFICATION] same prompt twice');
  const msgs = [{ role: 'user', content: OPERATOR[0] }, { role: 'user', content: buildState(SEED_BOOKINGS) }];
  const first = await call('ruler call 1 (cold)', head, msgs);
  const second = await call('ruler call 2 (identical)', head, msgs);
  // The server re-evaluates one micro-batch on every request no matter how much of the
  // prompt it already holds. That floor is a constant of the box, not of the layout.
  const REPREFILL_FLOOR = 600;
  return {
    firstPrefill: first.prefillTokens,
    secondPrefill: second.prefillTokens,
    reprefillFloorTokens: REPREFILL_FLOOR,
    collapsed: second.prefillTokens <= REPREFILL_FLOOR && second.prefillTokens < first.prefillTokens * 0.5,
  };
}

// ── the reuse window ───────────────────────────────────────────────────────────
// The single fact that decides both arms: how far back from the END of the prompt a
// changed byte may sit and still leave the cache usable. One synthetic prompt, one
// changed word, moved to different depths.
async function reuseWindow() {
  phase = 'reuse-window';
  console.log('\n[REUSE WINDOW] one changed word, at different depths from the end');
  const unit = 'The house law binds every desk identically. ';
  const mk = (pre, mid, post) =>
    `<|im_start|>system\n${unit.repeat(pre)}${mid}${unit.repeat(post)}<|im_end|>\n<|im_start|>user\nHello there.<|im_end|>\n<|im_start|>assistant\n${THINK_OFF}`;
  const rows = [];
  for (const post of [10, 40, 80, 200]) {
    const pre = 400 - post;
    await eraseSlot();
    const a = await post_('/completion', mk(pre, 'AAA ', post));
    const b = await post_('/completion', mk(pre, 'BBB ', post));
    const depth = await tokenCount(`${unit.repeat(post)}<|im_end|>\n<|im_start|>user\nHello there.<|im_end|>\n<|im_start|>assistant\n${THINK_OFF}`);
    rows.push({ changedWordTokensFromEnd: depth, coldPrefill: a.timings.prompt_n, warmPrefill: b.timings.prompt_n });
    console.log(`  changed word ${String(depth).padStart(5)} tokens from the end → prefill ${b.timings.prompt_n} (cold ${a.timings.prompt_n})`);
  }
  return rows;
}

async function post_(path, prompt) {
  return post(path, { prompt, cache_prompt: true, temperature: 0, n_predict: 1, stream: false });
}

// ── main ───────────────────────────────────────────────────────────────────────
const props = await fetch(`${SERVER}/props`).then((r) => r.json());

console.log(`server: ${props.model_path ?? props.default_generation_settings?.model ?? 'unknown'}`);

const sizes = {
  headTokens: await tokenCount(head),
  stateTokens: await tokenCount(buildState(SEED_BOOKINGS)),
  asIsSystemTokens: await tokenCount(`${head}\n${buildState(SEED_BOOKINGS)}\n`),
};
console.log(`sizes: head=${sizes.headTokens}  STATE=${sizes.stateTokens}  as-is system=${sizes.asIsSystemTokens}`);

// warm the model (excluded from the comparison)
phase = 'warmup';
await call('warmup', head, [{ role: 'user', content: 'Say ready.' }]);
sampleRam();
const idleRss = samples.length ? samples[samples.length - 1].rssMb : null;

const ruler = await verifyRuler();
if (!ruler.collapsed) {
  console.error(`RULER FAILED: ${ruler.firstPrefill} → ${ruler.secondPrefill}; caching not engaging.`);
}

const windowSweep = await reuseWindow();
const asIs1 = await armAsIs(1);
const toBe1 = await armToBe(1, 'replace');
const toBe2 = await armToBe(1, 'accumulate');
const r1shared = await rider1(true);
const r1control = await rider1(false);
const r2 = await rider2();

clearInterval(ramTimer);

function phaseRam(prefix) {
  const s = samples.filter((x) => x.phase.startsWith(prefix)).map((x) => x.rssMb);
  return s.length ? { min: Math.min(...s), max: Math.max(...s), n: s.length } : null;
}

function speed(prefix) {
  const s = calls.filter((c) => c.phase.startsWith(prefix));
  const med = (a) => {
    const v = [...a].sort((x, y) => x - y);
    return v.length ? +v[Math.floor(v.length / 2)].toFixed(2) : null;
  };
  const pf = s.map((c) => c.prefillTokPerS).filter((x) => x != null);
  const dc = s.map((c) => c.decodeTokPerS);
  return {
    prefillTokPerSMedian: med(pf),
    prefillTokPerSWorst: pf.length ? +Math.min(...pf).toFixed(2) : null,
    decodeTokPerSMedian: med(dc),
    decodeTokPerSWorst: dc.length ? +Math.min(...dc).toFixed(2) : null,
  };
}

const results = {
  serving: {
    server: SERVER,
    props: { model_path: props.model_path, n_ctx: props.default_generation_settings?.n_ctx, chat_template_present: Boolean(props.chat_template) },
    nPredict: N_PREDICT,
    temperature: 0,
    thinkingOff: { method: 'empty <think></think> pair injected after the assistant tag (enable_thinking:false shape)', anyThinkTagInOutput: calls.some((c) => c.hasThinkTag) },
  },
  sizes,
  ruler,
  reuseWindow: windowSweep,
  arms: {
    'as-is': { run1: asIs1, speed: speed('as-is') },
    'to-be-1-state-last': { run1: toBe1, speed: speed('to-be-replace') },
    'to-be-2-append-only': { run1: toBe2, speed: speed('to-be-accumulate') },
  },
  riders: { sharedHeadDeskSwitch: { shared: r1shared, control: r1control }, microStepFork: r2 },
  ram: {
    pid: serverPid,
    idleAfterLoadMb: idleRss,
    asIsMb: phaseRam('as-is'),
    toBeMb: phaseRam('to-be'),
    peakMb: samples.length ? Math.max(...samples.map((s) => s.rssMb)) : null,
    samples: samples.length,
  },
  calls,
};

writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${TRANSCRIPTS}/ram-samples.json`, JSON.stringify(samples, null, 2));

const tot = (a) => a.reduce((s, t) => s + t.prefillTokens, 0);
console.log(
  `\nTOTAL PREFILL  as-is=${tot(asIs1)}  to-be-1(state-last)=${tot(toBe1)}  to-be-2(append-only)=${tot(toBe2)}`,
);
console.log(
  `vs AS-IS:  to-be-1 = ${(tot(toBe1) / tot(asIs1)).toFixed(2)}x   to-be-2 = ${(tot(toBe2) / tot(asIs1)).toFixed(2)}x`,
);
console.log(`context at turn 8:  as-is=${asIs1[7].contextTokensAtTurnEnd}  to-be-1=${toBe1[7].contextTokensAtTurnEnd}  to-be-2=${toBe2[7].contextTokensAtTurnEnd}`);
