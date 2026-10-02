
import "server-only"
import { ConfigurationError } from "../errors";
import { OpenAICompatibleProvider } from "./openAiProvider";
import { AnthropicProvider } from "./antropic";
import type { LLMProvider } from  "../types";

export { OpenAICompatibleProvider } from "./openAiProvider";
export { AnthropicProvider } from "./antropic";

export type ProviderName =
  | "openai"
  | "anthropic"
  | "deepseek";

function need(value: string | undefined, varName: string): string {
  if (!value) {
    throw new ConfigurationError(
      `Не задана переменная окружения ${varName}. Скопируй .env.example в .env и заполни.`,
    );
  }
  return value;
}

export function getProvider(name: ProviderName): LLMProvider {
  if (!name) {
    throw new ConfigurationError("Не выбран провайдер");
  }

  switch (name) {
    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        apiKey: need(process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
        chatModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
        embedModel: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
        supportsStreamUsage: true,
      });
    case "deepseek":
      return new OpenAICompatibleProvider({
        name: "deepseek",
        baseURL: "https://api.deepseek.com/v1",
        apiKey: need(process.env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY"),
        chatModel: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
        embedModel: process.env.DEEPSEEK_EMBED_MODEL ?? "deepseek-embed",
        supportsStreamUsage: true,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: need(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
        chatModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      });
  }
}
