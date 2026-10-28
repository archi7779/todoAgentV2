import type { Runnable } from "@langchain/core/runnables";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { AgentState } from "../graph/helpers";
import { AIMessageChunk, UsageMetadata } from "@langchain/core/messages";
import { logger } from "@/src/lib/logger";
import { chargeTokens } from "@/src/lib/billing/tokens";
import { LLMError, mapProviderError } from "../errors";
import { buildSystemMessage } from "../prompts/system";

/**
 * Зависимости СБОРКИ графа: то, что живёт ровно столько же, сколько процесс.
 * Config сюда не входит и входить не может — он свой на каждом ПРОГОНЕ
 * (свой thread_id, свой signal, свой бюджет), а граф собирается один раз
 * и кэшируется в getApp().
 */
type AgentNodeDeps = {
  model: Runnable;
  providerName: string;
  /** Имя модели для журнала списаний (например, deepseek-chat). */
  modelName: string;
};

export function makeAgentNode({ model, providerName, modelName }: AgentNodeDeps) {
  // config — ВТОРОЙ аргумент узла: LangGraph подставляет его сам на каждый вызов.
  // Оттуда приезжают signal (дедлайн прогона + таймаут узла + отмена клиента)
  // и configurable (thread_id и будущая политика запроса).
  return async function agentNode(
    state: typeof AgentState.State,
    config: LangGraphRunnableConfig,
  ) {
      // userId приходит из роута через configurable (см. agent-stream). Он нужен,
      // чтобы списать токены именно владельцу треда, а не тому, кого назовёт модель.
      const configurable = config.configurable ?? {};
      const userId = typeof configurable.userId === "string" ? configurable.userId : undefined;
      const threadId = typeof configurable.thread_id === "string" ? configurable.thread_id : null;

      //Ограничение на количество вызовов?
      const callNumber = (state.llmCalls ?? 0) + 1;
      //Замеряем время текущей работы Агентной ноды
      const t0 = performance.now();

      const eventStream = model.streamEvents(
        [buildSystemMessage(), ...state.messages],
        { version: "v2", ...config },
      );

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

      // Списываем ПОСЛЕ вызова модели, но ДО следующего шага. state.totalTokens
      // для UI и аналитики, а источник истины для биллинга — usage_metadata.
      if (userId && finalUsage?.total_tokens) {
        await chargeTokens({
          userId,
          threadId,
          model: modelName,
          inputTokens: finalUsage.input_tokens ?? 0,
          outputTokens: finalUsage.output_tokens ?? 0,
          totalTokens: finalUsage.total_tokens,
        });
      } else if (userId) {
        logger.warn(
          { tool: "agent", call: callNumber, userId },
          "usage_metadata отсутствует — списание пропущено",
        );
      }

      return {
      messages: [response],
      llmCalls: 1,
      totalTokens: finalUsage?.total_tokens ?? 0,
    };
  }
}   