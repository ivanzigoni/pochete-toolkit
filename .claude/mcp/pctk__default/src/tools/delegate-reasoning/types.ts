export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
}

export type DeepseekModel = 'deepseek-chat' | 'deepseek-reasoner';

export interface DeepseekInferInput {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly model: DeepseekModel;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface DeepseekUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface DeepseekInferResult {
  readonly model: string;
  readonly response: string;
  readonly finishReason: string;
  readonly usage: DeepseekUsage;
  readonly durationMs: number;
}
