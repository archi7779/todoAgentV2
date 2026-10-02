/**
 * Anthropic (Claude) provider.
 *
 * Claude does NOT use the OpenAI shape, so it gets its own class. Two things
 * to notice vs. the OpenAI-compatible providers:
 *   1. The `system` prompt is a top-level parameter, not a message with
 *      role:"system". We split it out here.
 *   2. `max_tokens` is REQUIRED by the Anthropic API (no default), so we
 *      always send one.
 *   3. Claude has no embeddings endpoint — `embed()` throws and points you at
 *      a provider that does. (Anthropic recommends Voyage AI in production.)
 */

import Anthropic from "@anthropic-ai/sdk";
import { mapProviderError, NotSupportedError } from "../errors";
import type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatStreamEvent,
  EmbeddingResult,
  LLMProvider,
} from "../types";

export interface AnthropicConfig {
  apiKey: string;
  chatModel: string;
}

function splitSystem(messages: ChatMessage[]): {
  system?: string;
  rest: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return {
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
    rest,
  };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly chatModel: string;
  readonly embedModel = "(none — use openai/ollama/nvidia for embeddings)";
  private client: Anthropic;

  constructor(cfg: AnthropicConfig) {
    this.chatModel = cfg.chatModel;
    this.client = new Anthropic({ apiKey: cfg.apiKey });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = options.model ?? this.chatModel;
    const { system, rest } = splitSystem(messages);
    try {
      const resp = await this.client.messages.create(
        {
          model,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature,
          stop_sequences: options.stop,
          system,
          messages: rest,
        },
        { signal: options.signal },
      );
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        model,
        usage: {
          inputTokens: resp.usage.input_tokens,
          outputTokens: resp.usage.output_tokens,
        },
        raw: resp,
      };
    } catch (err) {
      throw mapProviderError(err, this.name, { signal: options.signal });
    }
  }

  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<ChatStreamEvent> {
    const model = options.model ?? this.chatModel;
    const { system, rest } = splitSystem(messages);
    try {
      const stream = this.client.messages.stream(
        {
          model,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature,
          stop_sequences: options.stop,
          system,
          messages: rest,
        },
        { signal: options.signal },
      );

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", text: event.delta.text };
        }
      }

      // После завершения итерации finalMessage() уже готово и несёт usage —
      // у Anthropic нет отдельного флага, как у OpenAI, токены берём отсюда.
      const final = await stream.finalMessage();
      yield {
        type: "done",
        model,
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        },
      };
    } catch (err) {
      throw mapProviderError(err, this.name, { signal: options.signal });
    }
  }

  async embed(_input: string[]): Promise<EmbeddingResult> {
    throw new NotSupportedError(
      "Anthropic не поддерживает embeddings. Используй провайдера с embeddings " +
        "(например, OpenAI) или отдельный сервис вроде Voyage AI.",
    );
  }
}
