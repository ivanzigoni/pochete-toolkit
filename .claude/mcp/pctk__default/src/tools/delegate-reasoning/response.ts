import type { DeepseekInferResult, HttpResponse } from './types.js';

interface DeepseekChatCompletionResponse {
  readonly model: string;
  readonly choices: readonly {
    readonly message: { readonly content: string };
    readonly finish_reason: string;
  }[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

export function parseDeepseekInferResponse(
  response: HttpResponse,
  durationMs: number,
): DeepseekInferResult {
  if (response.status !== 200) {
    throw new Error(
      `Deepseek API returned ${response.status} ${response.statusText}: ${response.body}`,
    );
  }

  let parsed: DeepseekChatCompletionResponse;
  try {
    parsed = JSON.parse(response.body) as DeepseekChatCompletionResponse;
  } catch {
    throw new Error(`Deepseek API returned a non-JSON body: ${response.body}`);
  }

  const choice = parsed.choices?.[0];
  if (!choice) {
    throw new Error(`Deepseek API response has no choices: ${response.body}`);
  }

  return {
    model: parsed.model,
    response: choice.message.content,
    finishReason: choice.finish_reason,
    usage: {
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
      totalTokens: parsed.usage.total_tokens,
    },
    durationMs,
  };
}
