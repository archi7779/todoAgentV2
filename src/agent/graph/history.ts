import type { BaseMessage } from "@langchain/core/messages";
import type {
  ChatHistoryMessage,
  ChatHistoryResponse,
  ChatHistoryRole,
  ChatHistoryToolCall,
} from "@/src/shared/contracts/chat-history";

/**
 * Маппинг снапшота LangGraph → плоский DTO истории.
 *
 * Здесь единственное место, которое знает про внутренние типы сообщений
 * LangChain (`human`/`ai`/`tool`, `tool_calls`, `additional_kwargs`). Роут
 * остаётся тонким, клиент ничего из LangChain не импортирует.
 */

/** Лёгкая структурная копия `StateSnapshot`: не тащим сюда тип из langgraph. */
type StateSnapshotLike = {
  values?: unknown;
  createdAt?: string;
  tasks?: readonly { interrupts?: readonly { value?: unknown }[] }[];
};

type AgentStateValues = {
  messages?: BaseMessage[];
  totalTokens?: number;
  llmCalls?: number;
};

export function toChatHistory(snapshot: StateSnapshotLike | undefined): ChatHistoryResponse {
  const values = asAgentValues(snapshot?.values);
  const messages = (values.messages ?? []).map(mapMessage);

  const interrupt =
    snapshot?.tasks?.flatMap((task) => task.interrupts ?? [])[0]?.value ?? null;

  return {
    messages,
    updatedAt: snapshot?.createdAt ?? null,
    totalTokens: values.totalTokens ?? 0,
    llmCalls: values.llmCalls ?? 0,
    interrupt,
  };
}

function asAgentValues(values: unknown): AgentStateValues {
  return typeof values === "object" && values !== null
    ? (values as AgentStateValues)
    : {};
}

function mapMessage(message: BaseMessage, index: number): ChatHistoryMessage {
  const role = toRole(message);
  const mapped: ChatHistoryMessage = {
    id: message.id ?? `${role}-${index}`,
    role,
    content: toText(message.content),
  };

  const reasoning = readReasoning(message);
  if (reasoning) mapped.reasoning = reasoning;

  if (role === "assistant") {
    const toolCalls = readToolCalls(message);
    if (toolCalls.length > 0) mapped.toolCalls = toolCalls;
  }

  if (role === "tool") {
    const tool = message as unknown as {
      tool_call_id?: unknown;
      name?: unknown;
      status?: unknown;
    };
    if (typeof tool.tool_call_id === "string") mapped.toolCallId = tool.tool_call_id;
    if (typeof tool.name === "string") mapped.toolName = tool.name;
    if (typeof tool.status === "string") mapped.toolStatus = tool.status;
  }

  return mapped;
}

/**
 * В стейте могут оказаться не только `AIMessage`, но и `AIMessageChunk`
 * (нода возвращает именно chunk), поэтому опираемся на `getType()`, а если
 * сообщение пришло plain-объектом — на поле `type`.
 */
function toRole(message: BaseMessage): ChatHistoryRole {
  const type =
    typeof message.getType === "function"
      ? message.getType()
      : (message as unknown as { type?: string }).type;

  switch (type) {
    case "human":
      return "user";
    case "ai":
      return "assistant";
    case "tool":
    case "function":
      return "tool";
    default:
      return "system";
  }
}

/**
 * `content` — либо строка, либо массив блоков (текст, картинки, tool-блоки).
 * В UI пока отдаём только текст; нетекстовые блоки молча отбрасываем.
 */
function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text"
      ) {
        const text = (block as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

function readReasoning(message: BaseMessage): string | undefined {
  const additional = (message as unknown as { additional_kwargs?: Record<string, unknown> })
    .additional_kwargs;
  const reasoning = additional?.reasoning_content;
  return typeof reasoning === "string" && reasoning.length > 0 ? reasoning : undefined;
}

function readToolCalls(message: BaseMessage): ChatHistoryToolCall[] {
  const calls = (message as unknown as {
    tool_calls?: { id?: unknown; name?: unknown; args?: unknown }[];
  }).tool_calls;

  if (!Array.isArray(calls)) return [];

  return calls
    .filter((call) => typeof call?.name === "string")
    .map((call) => ({
      id: typeof call.id === "string" ? call.id : null,
      name: call.name as string,
      args: call.args ?? {},
    }));
}
