/**
 * The fetch-style request handler — the whole protocol facade, testable without a socket.
 *
 * Routes: GET /v1/models, POST /v1/chat/completions. Everything else 404s in OpenAI error shape.
 * Mapping law (see README): incoming `system` is DISCARDED (the spec renders its own trunk),
 * incoming `tools`/`tool_choice`/sampling are IGNORED (the spec governs), and only the LAST
 * `user` message enters the governed turn — the agent's own session is the canonical memory.
 */
import type { LoopRunResultMeta } from '@looprun-ai/mastra';
import {
  buildCompletion,
  buildModelList,
  buildUsage,
  completionId,
  errorBody,
} from './openai.js';
import { SessionLocks, SessionTtl, lastUserText, resolveSessionId } from './session.js';
import { streamCompletion } from './sse.js';
import type { CompletionRequestBody, LoopRunEnvelopeMeta, ModelServerConfig } from './types.js';

export const DEFAULT_CONTEXT_LENGTH = 128_000;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function envelopeMeta(meta: LoopRunResultMeta): LoopRunEnvelopeMeta {
  return {
    sessionId: meta.sessionId,
    turnIndex: meta.turnIndex,
    corrections: meta.corrections,
    exhausted: meta.exhausted,
    violations: meta.violations,
  };
}

export interface HandlerInternals {
  locks: SessionLocks;
  ttl: SessionTtl;
}

export function createOpenAiHandler(
  config: ModelServerConfig,
  internals: HandlerInternals = { locks: new SessionLocks(), ttl: new SessionTtl() },
): (req: Request) => Promise<Response> {
  const contextLength = config.contextLength ?? DEFAULT_CONTEXT_LENGTH;
  const { locks, ttl } = internals;

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (config.apiKey) {
      const auth = req.headers.get('authorization') ?? '';
      if (auth !== `Bearer ${config.apiKey}`) {
        return json(401, errorBody('Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key'));
      }
    }

    if (req.method === 'GET' && path === '/v1/models') {
      return json(200, buildModelList(Object.keys(config.agents), contextLength));
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      let body: CompletionRequestBody;
      try {
        body = (await req.json()) as CompletionRequestBody;
      } catch {
        return json(400, errorBody('Request body is not valid JSON.', 'invalid_request_error', null));
      }

      const agent = body.model ? config.agents[body.model] : undefined;
      if (!agent) {
        return json(
          404,
          errorBody(`The model '${String(body.model)}' does not exist.`, 'invalid_request_error', 'model_not_found', 'model'),
        );
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return json(400, errorBody("Missing required parameter: 'messages'.", 'invalid_request_error', null, 'messages'));
      }
      const userText = lastUserText(body.messages);
      if (userText === null) {
        return json(
          400,
          errorBody('No user message with text content found in `messages`.', 'invalid_request_error', null, 'messages'),
        );
      }

      const sessionId = (config.resolveSession ?? resolveSessionId)(body, req.headers);
      const id = completionId();

      const runTurn = () =>
        locks.run(`${body.model} ${sessionId}`, async () => {
          const result = await agent.generate(userText, { loopRun: { sessionId } });
          const meta = result.looprun as LoopRunResultMeta;
          ttl.touch(body.model, sessionId);
          config.onTurn?.({ model: body.model, sessionId, meta });
          return {
            text: String(result.text ?? ''),
            usage: buildUsage(userText, String(result.text ?? '')),
            looprun: envelopeMeta(meta),
          };
        });

      if (body.stream === true) {
        const stream = streamCompletion({
          id,
          model: body.model,
          turn: runTurn(),
          onError: (error) =>
            errorBody(error instanceof Error ? error.message : 'The governed turn failed.', 'api_error', 'api_error'),
        });
        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        });
      }

      try {
        const turn = await runTurn();
        return json(200, buildCompletion({ id, model: body.model, text: turn.text, usage: turn.usage, looprun: turn.looprun }));
      } catch (error) {
        return json(
          500,
          errorBody(error instanceof Error ? error.message : 'The governed turn failed.', 'api_error', 'api_error'),
        );
      }
    }

    return json(404, errorBody(`Unknown request URL: ${req.method} ${path}.`, 'invalid_request_error', null));
  };
}
