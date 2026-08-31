import type { DeepseekInferInput, HttpRequest } from './types.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const CHAT_COMPLETIONS_PATH = '/chat/completions';

/**
 * Builds the OpenAI-compatible chat-completions request Deepseek's API expects — one system
 * message (only when systemPrompt is given) followed by the prompt as the user message. baseUrl
 * defaults to Deepseek's own endpoint; a caller-configured override (DEEPSEEK_BASE_URL) lets this
 * point at a proxy/gateway without touching this file.
 */
export function buildDeepseekInferRequest(
  input: DeepseekInferInput,
  apiKey: string,
  baseUrl: string | undefined,
): HttpRequest {
  const messages = [
    ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []),
    { role: 'user', content: input.prompt },
  ];

  const body: Record<string, unknown> = { model: input.model, messages };
  if (input.maxTokens !== undefined) body.max_tokens = input.maxTokens;
  if (input.temperature !== undefined) body.temperature = input.temperature;

  return {
    method: 'POST',
    url: `${baseUrl ?? DEFAULT_BASE_URL}${CHAT_COMPLETIONS_PATH}`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}
