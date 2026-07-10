/**
 * @looprun-ai/eval — the guard-purity lint over USER project files (`looprun-eval lint`).
 *
 * The four file-local rule sets that keep generated specs deterministic by construction:
 *   1. BANNED tokens — clock / entropy / network / runtime-LLM calls inside spec/theme files.
 *   2. Stateful regex — /g|/y flags used with .test()/.exec() (lastIndex leaks across calls).
 *   3. S-1 firewall — guard code must never read user text (ctx.userText / messages / …).
 *   4. Theme-persona law — a theme file may not carry a `persona:` key (persona lives on the spec).
 * Plus `--spec-laws` (config-level): persona present, ≤15 tools, no own systemPrompt, caseMap sane.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpec } from '@looprun-ai/core';
import { checkConfig } from './config.js';
import type { EvalConfig } from './types.js';

export interface LintViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export const BANNED_TOKENS = [
  'Date.now(',
  'new Date(',
  'performance.now(',
  'process.hrtime',
  'Math.random(',
  'crypto.',
  'fetch(',
  'generateText(',
  'streamText(',
  'makeLanguageModel(',
  'createOpenAI(',
  'createGoogleGenerativeAI(',
];

const STATEFUL_RE = /\/[^/\n]+\/[a-z]*[gy][a-z]*\s*\.\s*(test|exec)\s*\(/;
const FIREWALL_RE = /\bctx\s*\.\s*(userText|messages|history|userMessage|prompt)\b/;
const PERSONA_KEY_RE = /^\s*persona\s*:/;

export function lintSource(file: string, source: string): LintViolation[] {
  const out: LintViolation[] = [];
  const lines = source.split('\n');
  const isTheme = /theme[^/]*\.(ts|js|mts|mjs)$/.test(file);

  lines.forEach((text, i) => {
    const line = i + 1;
    for (const token of BANNED_TOKENS) {
      if (text.includes(token)) {
        out.push({ file, line, rule: 'purity', message: `banned token ${token.replace(/\($/, '')} — guard surfaces must stay clock/entropy/network/LLM-free` });
      }
    }
    if (STATEFUL_RE.test(text)) {
      out.push({ file, line, rule: 'stateful-regex', message: 'a /g|/y regex used with .test()/.exec() leaks lastIndex across calls' });
    }
    if (FIREWALL_RE.test(text)) {
      out.push({ file, line, rule: 's1-firewall', message: 'guards must never read user text (the magnet firewall)' });
    }
    if (isTheme && PERSONA_KEY_RE.test(text)) {
      out.push({ file, line, rule: 'theme-persona', message: 'a theme carries no persona — persona lives on each spec (persona-on-spec law)' });
    }
  });
  return out;
}

function listSources(path: string): string[] {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (st.isFile()) return /\.(ts|mts|js|mjs)$/.test(path) ? [path] : [];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    out.push(...listSources(join(path, entry)));
  }
  return out;
}

export function lintPaths(paths: string[]): LintViolation[] {
  const files = paths.flatMap(listSources);
  return files.flatMap((f) => lintSource(f, readFileSync(f, 'utf8')));
}

/** The config-level spec laws (`--spec-laws`). */
export function lintSpecLaws(config: EvalConfig): string[] {
  const out: string[] = [];
  for (const [id, spec] of Object.entries(config.specs ?? {})) {
    for (const w of validateSpec(spec)) out.push(`spec "${id}": ${w.message}`);
    if (spec.surface.systemPrompt) {
      out.push(`spec "${id}": carries its own systemPrompt — generated specs must use the trunk renderer (theme + spec only)`);
    }
  }
  for (const issue of checkConfig(config)) {
    if (issue.level === 'error') out.push(issue.message);
  }
  return out;
}
