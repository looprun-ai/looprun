#!/usr/bin/env python3
"""margin-probe — measure the greedy-decision margin at a case's fork, and its worst case
under a noise battery (inert byte edits + KV-cache states). The instrument behind the
margin loop: prose edits are accepted iff the WORST-CASE margin improves on BOTH forks
of a fork-pair (read-intent + mirrored create-intent), never by full-run score.

Usage (llama-server with the target LOCAL model on $MARGIN_PROBE_BASE, speculative OFF):
  margin-probe.py measure <ctx.json> --dump <dir> --agent <id> [--system <file>] [--n 48]
  margin-probe.py battery <ctx.json> --dump <dir> --agent <id> [--system <file>]
  margin-probe.py pair    <ctxA.json> <ctxB.json> --dump <dir> --agent <id> [--system <file>]

<ctx.json> comes from extract-fork.mjs (shared messages + expect targets). <dir> comes from
`<byte-exact prompt-dump script>` (byte-exact system prompt + tool defs per agent).
Margin = lp(correct branch) − lp(wrong branch) at the first fork token; positive = correct wins.
"""
import json, sys, argparse, hashlib, urllib.request

BASE = __import__('os').environ.get('MARGIN_PROBE_BASE', 'http://127.0.0.1:8081')

def post(path, body):
    req = urllib.request.Request(BASE + path, json.dumps(body).encode(),
                                 {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())

def openai_tools(defs):
    return [{'type': 'function', 'function': {'name': d['name'], 'description': d['description'],
             'parameters': d.get('inputSchema', {'type': 'object', 'properties': {}})}} for d in defs]

def render(system, messages, tools):
    msgs = [{'role': 'system', 'content': system}] + messages
    return post('/apply-template', {'messages': msgs, 'tools': tools,
                                    'chat_template_kwargs': {'enable_thinking': False}})['prompt']

def complete(prompt, cache=True, n_predict=48, n_probs=10):
    return post('/completion', {'prompt': prompt, 'temperature': 0, 'n_predict': n_predict,
                                'n_probs': n_probs, 'cache_prompt': cache})

def classify(token, correct, wrong, prompt, gen_prefix):
    """Which target does this candidate token lead to? Returns 'correct'|'wrong'|None.
    Handles the ambiguous connector token (e.g. '=' before a tool name) by forcing one step."""
    t = token.lstrip('=').strip()
    c_hit = bool(t) and (correct.startswith(t) or t.startswith(correct))
    w_hit = bool(t) and (wrong.startswith(t) or t.startswith(wrong))
    if c_hit and not w_hit: return 'correct'
    if w_hit and not c_hit: return 'wrong'
    if not t and token:  # bare connector — force it and look one step ahead
        r = complete(prompt + gen_prefix + token, cache=True, n_predict=2, n_probs=4)
        nxt = (r.get('completion_probabilities') or [{}])[0].get('token', '').strip()
        if nxt and correct.startswith(nxt): return 'correct'
        if nxt and wrong.startswith(nxt): return 'wrong'
    return None

def fork_margin(prompt, expect, n_predict=48):
    """Greedy-generate; find the first position whose top-k contains BOTH branches; return
    (picked_class, signed_margin, position, top). Falls back to near-tie report when
    classification fails."""
    r = complete(prompt, cache=True, n_predict=n_predict)
    probs = r.get('completion_probabilities', [])
    text = r.get('content', '')
    gen = ''
    near_ties = []
    for i, p in enumerate(probs):
        tops = p.get('top_logprobs') or []
        if len(tops) >= 2 and (tops[0]['logprob'] - tops[1]['logprob']) < 1.0:
            near_ties.append((i, [(t['token'], round(t['logprob'], 3)) for t in tops[:5]]))
        if expect:
            lp = {'correct': None, 'wrong': None}
            for t in tops[:8]:
                cls = classify(t['token'], expect['correct'], expect['wrong'], prompt, gen)
                if cls and (lp[cls] is None or t['logprob'] > lp[cls]):
                    lp[cls] = t['logprob']
            if lp['correct'] is not None and lp['wrong'] is not None:
                picked = classify(p['token'], expect['correct'], expect['wrong'], prompt, gen) or '?'
                return picked, round(lp['correct'] - lp['wrong'], 3), i, tops[:5]
        gen += p.get('token', '')
    return ('?', None, None, {'text': text[:120], 'near_ties': near_ties[:4]})

# ── noise battery ────────────────────────────────────────────────────────────
def placebos(system):
    cands = {
        'double-space':      lambda s: s.replace(': ', ':  ', 1),
        'dash-swap':         lambda s: s.replace(' — ', ' - ', 1),
        'case-never':        lambda s: s.replace('NEVER', 'never', 1),
        'article-a':         lambda s: s.replace('You are the ', 'You are a ', 1),
        'harmless-style':    lambda s: s.replace('## Turn protocol', '## Style\n- Be helpful.\n\n## Turn protocol', 1),
        'trailing-space':    lambda s: s.replace('.\n', '. \n', 1),
    }
    out = {}
    for name, fn in cands.items():
        s2 = fn(system)
        if s2 != system: out[name] = s2
    return out

def cache_states(prompt):
    unrelated = 'The quick brown fox jumps over the lazy dog. ' * 200
    return [('cold', None, False), ('50%-prefix', prompt[:len(prompt) // 2], True),
            ('unrelated-prime', unrelated, True)]

def battery(system, ctx, tools, n_predict, label=''):
    expect, messages = ctx.get('expect'), ctx['messages']
    worst, flips, unmeasured = None, 0, 0
    def run(sys_text, state_label, prompt=None, prime=None):
        nonlocal worst, flips, unmeasured
        prompt = prompt or render(sys_text, messages, tools)
        if prime is not None:
            post('/completion', {'prompt': prime, 'temperature': 0, 'n_predict': 1, 'cache_prompt': True})
        picked, m, pos, extra = fork_margin(prompt, expect, n_predict)
        if m is not None:
            worst = m if worst is None else min(worst, m)
        flips += (picked == 'wrong')
        note = ''
        if picked == '?':
            unmeasured += (m is None)
            head = extra.get('text', '') if isinstance(extra, dict) else ''
            note = f'  ← gen: {head[:90]!r}' if head else ''
        print(f'  {label}{state_label:22s} picked={picked:8s} margin={m}{note}')
    run(system, 'base(warm)')
    for name, s2 in placebos(system).items():
        run(s2, f'placebo:{name}')
    base_prompt = render(system, messages, tools)
    for name, prime, _cache in cache_states(base_prompt):
        run(system, f'cache:{name}', prompt=base_prompt, prime=prime)
    print(f'  {label}WORST={worst} flips(wrong)={flips} unmeasured={unmeasured}')
    return worst, flips

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['measure', 'battery', 'pair'])
    ap.add_argument('ctx', nargs='+')
    ap.add_argument('--dump', required=True)
    ap.add_argument('--agent', required=True)
    ap.add_argument('--system', default=None, help='override system prompt file (edit under test)')
    ap.add_argument('--n', type=int, default=48)
    a = ap.parse_args()

    system = open(a.system or f'{a.dump}/{a.agent}.system.txt').read()
    tools = openai_tools(json.load(open(f'{a.dump}/{a.agent}.tools.json')))
    ctxs = [json.load(open(c)) for c in a.ctx]

    if a.cmd == 'measure':
        ctx = ctxs[0]
        prompt = render(system, ctx['messages'], tools)
        picked, m, pos, extra = fork_margin(prompt, ctx.get('expect'), a.n)
        print(json.dumps({'caseId': ctx.get('caseId'), 'picked': picked, 'margin': m,
                          'position': pos, 'detail': extra}, ensure_ascii=False, default=str, indent=1))
    elif a.cmd == 'battery':
        battery(system, ctxs[0], tools, a.n)
    elif a.cmd == 'pair':
        print('== fork A (primary)'); wa, fa = battery(system, ctxs[0], tools, a.n, 'A ')
        print('== fork B (mirror / anti-magnet)'); wb, fb = battery(system, ctxs[1], tools, a.n, 'B ')
        ok = (wa or -9) > 0 and (wb or -9) > 0 and fa == 0 and fb == 0
        print(f'PAIR worst A={wa} B={wb} flips={fa}+{fb} → {"HEALTHY" if ok else "AT-RISK"}')

if __name__ == '__main__':
    main()
