/**
 * Контракт истории чата (GET /api/protected/chat-history).
 *
 * Это ПЛОСКИЙ DTO, а не `BaseMessage` из LangChain: на клиент нельзя отдавать
 * классы, к тому же `content` у сообщений бывает массивом блоков (text/image),
 * а tool-вызовы лежат отдельными полями. Маппинг — `src/agent/graph/history.ts`.
 *
 * Роль намеренно совпадает с ролями в LLM API: user / assistant / tool / system.
 */

export type ChatHistoryRole = "user" | "assistant" | "tool" | "system";

export type ChatHistoryToolCall = {
  /** id вызова; нужен, чтобы связать с ToolMessage (`toolCallId`). Может быть null у старых записей. */
  id: string | null;
  name: string;
  args: unknown;
};

export type ChatHistoryMessage = {
  /** id для key в React; у сообщений без id — детерминированный `role-index`. */
  id: string;
  role: ChatHistoryRole;
  /** Только текст. Нетекстовые блоки (картинки и т.п.) пока не отдаём. */
  content: string;
  /** «Размышления» модели (DeepSeek `reasoning_content`), если были. */
  reasoning?: string;
  /** Заполнено у assistant-сообщений, которые запросили инструменты. */
  toolCalls?: ChatHistoryToolCall[];
  /** Для role === "tool": на какой вызов отвечает это сообщение. */
  toolCallId?: string;
  /** Для role === "tool": имя инструмента. */
  toolName?: string;
  /** Для role === "tool": "success" | "error", если провайдер/граф это сохранил. */
  toolStatus?: string;
};

export type ChatHistoryResponse = {
  /** В порядке выполнения; пустой массив, если у пользователя ещё нет чекпоинта. */
  messages: ChatHistoryMessage[];
  /** Время последнего чекпоинта (ISO). null — истории ещё нет. */
  updatedAt: string | null;
  /** Накопленные токены по state (сколько стоил диалог). */
  totalTokens: number;
  /** Сколько раз модель вызывалась за всю историю. */
  llmCalls: number;
  /**
   * Если прогон стоит на `interrupt()`, здесь его payload — чтобы фронт мог
   * восстановить HITL-форму после перезагрузки страницы. Иначе null.
   */
  interrupt: unknown | null;
};
