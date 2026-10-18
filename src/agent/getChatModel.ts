import "dotenv/config";
import { LLMProvider } from "./types";
import { ConfigurationError } from "./errors";

export async function getChatModel({name: provider, chatModel, apiKey}: LLMProvider) {

  if (provider === "deepseek") {
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({
      configuration: {
        baseURL: "https://api.deepseek.com",
      },
      model: chatModel,
      apiKey: apiKey,
    });
  }

  if (provider === "openai") {
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({
      model: chatModel,
      apiKey: apiKey,
    });
  }

  throw new ConfigurationError(
        `Неизвестный провайдер LANGGRAPH_MODEL_PROVIDER=${provider}. use deepseek|openai`,
      );
}