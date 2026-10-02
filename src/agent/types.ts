/**
 * Shared types for the provider-agnostic LLM layer.
 *
 * The whole point of this package: write your exercise code against ONE
 * interface (`LLMProvider`), then swap the underlying model — OpenAI, Claude,
 * a local Ollama model, or an NVIDIA-hosted model — by changing one env var.
 * That swap-ability is itself a core lesson (see modules/02-llm-integration).
 */

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatOptions {
  /** Sampling temperature. Ignored by providers/models that don't support it. */
  temperature?: number;
  /** Hard cap on output tokens. */
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
  /** Override the model id configured in env for this single call. */
  model?: string;
  /**
   * Отмена запроса. Уходит в SDK как есть: аборт прерывает и обычный вызов,
   * и стрим (итерация бросит AbortError). Тот же механизм даёт таймаут —
   * можно передать AbortSignal.timeout(ms) или скомбинировать сигналы через
   * AbortSignal.any([user, timeout]).
   */
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Событие стрима. Текст идёт отдельными `text`-событиями, а завершающее `done`
 * несёт модель и usage — токены не текст, в строку их не положить, поэтому у них
 * отдельный канал. Юнион легко расширяется (tool-call события и т.п.).
 */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; model: string; usage: TokenUsage };

export interface ChatResult {
  text: string;
  model: string;
  usage?: TokenUsage;
  /** The raw provider response, for when you want to inspect the real shape. */
  raw?: unknown;
}

export interface EmbeddingResult {
  /** One vector per input string, in order. */
  vectors: number[][];
  model: string;
  usage?: TokenUsage;
}

/**
 * The contract every provider implements. Keep this small on purpose —
 * advanced features (tools, JSON mode, etc.) are taught per-provider in the
 * modules rather than hidden behind a leaky abstraction.
 */
export interface LLMProvider {
  readonly name: string;
  readonly chatModel: string;
  readonly embedModel: string;

  /** Rejects with an AbortError if `options.signal` is aborted. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;

  /**
   * Token-by-token (or chunk-by-chunk) streaming.
   * Yields `text` events as tokens arrive and a final `done` event with usage.
   * Throws AbortError mid-iteration if `options.signal` is aborted.
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<ChatStreamEvent>;

  embed(input: string[]): Promise<EmbeddingResult>;
}
