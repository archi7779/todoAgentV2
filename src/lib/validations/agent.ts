import { z } from "zod";

/**
 * Тело запроса к агенту.
 *
 * Список значений `provider` должен совпадать с `ProviderName`
 * (`src/agent/providers`) — импортировать его сюда нельзя: тот модуль
 * помечен `server-only`, а схема может понадобиться на клиенте.
 */
export const agentRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Пустой запрос").max(1000, "Слишком длинный запрос"),
  provider: z.enum(["openai", "anthropic", "deepseek"]).default("deepseek"),
  model: z.string().trim().min(1).optional(),
});

export type AgentRequestInput = z.infer<typeof agentRequestSchema>;
