import type { Runnable } from "@langchain/core/runnables";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { AgentState } from "../graph/helpers";
import { AIMessageChunk, UsageMetadata } from "@langchain/core/messages";
import { logger } from "@/src/lib/logger";
import { LLMError, mapProviderError } from "../errors";

/**
 * Зависимости СБОРКИ графа: то, что живёт ровно столько же, сколько процесс.
 * Config сюда не входит и входить не может — он свой на каждом ПРОГОНЕ
 * (свой thread_id, свой signal, свой бюджет), а граф собирается один раз
 * и кэшируется в getApp().
 */
type AgentNodeDeps = {
  model: Runnable;
  providerName: string;
};

export function makeAgentNode({ model, providerName }: AgentNodeDeps) {
  // config — ВТОРОЙ аргумент узла: LangGraph подставляет его сам на каждый вызов.
  // Оттуда приезжают signal (дедлайн прогона + таймаут узла + отмена клиента)
  // и configurable (thread_id и будущая политика запроса).
  return async function agentNode(
    state: typeof AgentState.State,
    config: LangGraphRunnableConfig,
  ) {
      //Ограничение на количество вызовов?
      const callNumber = (state.llmCalls ?? 0) + 1;
      //Замеряем время текущей работы Агентной ноды
      const t0 = performance.now();

      const eventStream = model.streamEvents(state.messages, { version: "v2", ...config });

      let response: AIMessageChunk | null = null;
      let finalUsage: UsageMetadata | null = null;
      try {
              for await(const event of eventStream){
            if (event.event === "on_chat_model_stream") {
              const chunk = (event.data as { chunk: AIMessageChunk }).chunk;
              response = response === null ? chunk : response.concat(chunk);
            }
            if (event.event === "on_chat_model_end") {
              const output = (event.data as { output?: { usage_metadata?: UsageMetadata } }).output;
              finalUsage = output?.usage_metadata ?? null;
              }
            }
      }catch(err){
        // Конфиг уже есть в аргументах — getConfig()/ALS больше не нужен.
        throw mapProviderError(err, providerName, { signal: config.signal });
      }

       const performanceTime = performance.now() - t0;
        if (!response) {
      logger.error({ tool: "agent", call: callNumber }, "model stream returned empty");
      throw new LLMError('Агент не смог ответить', 'PROVIDER')
    }
          logger.info(
        {
          tool: "agent",
          call: callNumber,
          ms: Math.round(performanceTime),
          ...(finalUsage && {
            tokens: {
              in: finalUsage.input_tokens,
              out: finalUsage.output_tokens,
              total: finalUsage.total_tokens,
            },
          }),
        },
        "Агент завершил работу",
      );
      return {
      messages: [response],
      llmCalls: 1,
      totalTokens: finalUsage?.total_tokens ?? 0,
    };
  }
}   