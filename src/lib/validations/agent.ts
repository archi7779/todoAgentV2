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



export const agentStreamRequestSchema = z.object({
  // threadId здесь нет намеренно: тред выводится из сессии на сервере
  // (см. src/agent/threads.ts). Иначе клиент мог бы продолжить чужой диалог.
  message: z.string().min(1, "Пустой запрос").max(1000, "Слишком длинный запрос").optional(),
  resume: z.record(z.string(), z.unknown()).optional(),
  provider: z.enum(["openai", "anthropic", "deepseek"]).default("deepseek"),
  model: z.string().trim().min(1).optional(),
}).refine(d => d.message !== undefined || d.resume !== undefined, { message: "Нужен message или resume" });

export type AgentStreamRequest = z.infer<typeof agentStreamRequestSchema>;