/** The chat door: a readline REPL over a governed agent. Every line the operator reads
 *  comes from the turn's own record — the routing line from `loopRun.routing`, the
 *  reply from `out.text` — never a side channel the REPL keeps for itself. A
 *  TurnFailure ends the turn, never the conversation: its kind and detail print, and
 *  the loop reads the next line. */
import { createInterface } from 'node:readline';
import { TurnFailure } from '@looprun-ai/core';
import type { TurnRouting } from '@looprun-ai/core';
import type { GovernedResult } from '@looprun-ai/mastra';

const PROMPT = 'you > ';
const SESSION = 'chat';
const EXIT_CMD = '/exit';
const DESKS_CMD = '/desks';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface ChatAgent {
  generate(text: string, opts?: { session?: string }): Promise<GovernedResult>;
}

export interface ChatCfg {
  readonly agent: ChatAgent;
  readonly name: string;
  readonly deskNames: readonly string[];
  /** Hides the routing line and the house's opening line, leaving the conversation as
   *  the person on the other side reads it. */
  readonly quiet?: boolean;
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
}

/** The front desk's own verdict, read back as the one dim line the operator sees before
 *  the reply. The record can carry BOTH facts at once — a desk handed the message
 *  back AND the house's second decision matched nothing — so a return always names who
 *  returned it. A turn the router matched to no desk names the desk that spoke as the
 *  house's default, never as the router's choice. */
function routingLine(routing: TurnRouting): string {
  const desk = routing.desk ?? 'none';
  const chose = routing.unmatched === true ? 'none' : 'router';
  const body = routing.returned !== null ? `${routing.returned.by} returned → ${desk}`
    : `${chose} → ${desk}`;
  return `${DIM}[${body}]${RESET}`;
}

export async function startChat(cfg: ChatCfg): Promise<void> {
  const input = cfg.input ?? process.stdin;
  const output = cfg.output ?? process.stdout;
  const write = (line: string): void => { output.write(`${line}\n`); };

  if (cfg.quiet !== true) {
    write(`${cfg.name} · ${cfg.deskNames.length} desks: ${cfg.deskNames.join(' ')}`);
  }
  const rl = createInterface({ input, output, prompt: PROMPT });
  // A piped, non-interactive input closes itself at EOF the moment every line has been
  // read — which can land while a turn is still mid-flight on its `await`. The prompt
  // after that turn checks this flag rather than racing the close.
  let closed = false;
  rl.once('close', () => { closed = true; });
  rl.prompt();
  for await (const line of rl) {
    if (line === EXIT_CMD) break;
    if (line === DESKS_CMD) {
      write(cfg.deskNames.join(' '));
      if (!closed) rl.prompt();
      continue;
    }
    try {
      const out = await cfg.agent.generate(line, { session: SESSION });
      if (out.loopRun.routing !== undefined && cfg.quiet !== true) {
        write(routingLine(out.loopRun.routing));
      }
      write(out.text);
    } catch (e: unknown) {
      if (!(e instanceof TurnFailure)) throw e;
      write(`turn failed: ${e.kind} — ${e.detail}`);
    }
    if (!closed) rl.prompt();
  }
  if (!closed) rl.close();
}
