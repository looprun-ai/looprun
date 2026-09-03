/** The chat door's entry, always run under the tsx loader: loads the subject door,
 *  composes the routed house, and hands the terminal to the REPL. The terminal carries
 *  the conversation and nothing else: the model SDK's own warnings go to the console the
 *  operator is reading, so they are turned off here. */
import { SubjectLoader } from '@looprun-ai/eval';
import { LoopRunAgent, RoutedAgent } from '@looprun-ai/mastra';
import { startChat } from '@looprun-ai/server';

(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const dir = args.find(a => !a.startsWith('--'));
if (dir === undefined) {
  console.error('usage: looprun chat <subject-dir> [--quiet]');
  process.exit(2);
}

const subject = await SubjectLoader.load(dir);

// The house builds ONE world instance and hands it to every desk — possible only
// for a world the house holds itself. An MCP or live world executes on its own
// host, so the chat door refuses it rather than composing a house it cannot build.
if (!('card' in subject.world)) {
  console.error('the chat door serves declared worlds');
  process.exit(2);
}

const target = subject.targets[0];
const keyEnv = target.target.keyEnv;
if (keyEnv !== null && process.env[keyEnv] === undefined) {
  console.error(`the subject's key is not in the environment: ${keyEnv}`);
  process.exit(2);
}

const agent = RoutedAgent.fromSubject({ specs: subject.specs, contract: subject.contract,
  world: subject.world, model: `${target.target.provider}/${target.model}` });
const deskNames = Object.keys(subject.specs);
await startChat({ agent, name: agent instanceof LoopRunAgent ? deskNames[0] : agent.name,
  deskNames, quiet });
