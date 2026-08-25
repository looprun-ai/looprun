/** The public surface of @looprun-ai/server: the OpenAI facade over governed agents,
 *  and the chat door for a terminal conversation with one. */
export { Server } from './server.js';
export { WireHandler, type ServerConfig } from './wire-handler.js';
export { toEnvelope, toSse, type ChatCompletion } from './wire.js';
export { WireSessions } from './wire-sessions.js';
export { startChat, type ChatAgent, type ChatCfg } from './chat.js';
