/** The chat door: a readline REPL over a governed agent. Every line the operator reads
 *  comes from the turn's own record — the routing line from `loopRun.routing`, the
 *  reply from `loopRun.text` — never a side channel the REPL keeps for itself. A
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
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
}

/** The front desk's own verdict, read back as the one dim line the operator sees before
 *  the reply — `[none]` when the house routed nowhere. */
function routingLine(routing: TurnRouting): string {
  const body = routing.desk === null ? 'none'
    : routing.returned === null ? `router → ${routing.desk}`
    : `${routing.returned.by} returned → ${routing.desk}`;
  return `${DIM}[${body}]${RESET}`;
}

export async function startChat(cfg: ChatCfg): Promise<void> {
  const input = cfg.input ?? process.stdin;
  const output = cfg.output ?? process.stdout;
  const write = (line: string): void => { output.write(`${line}\n`); };

  write(`${cfg.name} · ${cfg.deskNames.length} desks: ${cfg.deskNames.join(' ')}`);
  const rl = createInterface({ input, output, prompt: PROMPT });
  rl.prompt();
  for await (const line of rl) {
    if (line === EXIT_CMD) break;
    if (line === DESKS_CMD) {
      write(cfg.deskNames.join(' '));
      rl.prompt();
      continue;
    }
    try {
      const out = await cfg.agent.generate(line, { session: SESSION });
      if (out.loopRun.routing !== undefined) write(routingLine(out.loopRun.routing));
      write(out.text);
    } catch (e: unknown) {
      if (!(e instanceof TurnFailure)) throw e;
      write(`turn failed: ${e.kind} — ${e.detail}`);
    }
    rl.prompt();
  }
  rl.close();
}
