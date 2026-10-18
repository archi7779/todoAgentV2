import type { AgentStreamEvent } from "@/src/shared/contracts/agent-stream";
import { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,  
  
  // добавляем свои кастомные поля
  llmCalls: Annotation<number>({
    reducer: (current, update) => current + update, 
    default: () => 0,
  }),
  totalTokens: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
});

export function handleMessageChunk(
  chunk: AIMessageChunk,
  metadata: { langgraph_node?: string },
): AgentStreamEvent[] {
  if (metadata.langgraph_node !== "agent") return [];
  const out: AgentStreamEvent[] = [];
  const hasToolCalls = (chunk.tool_call_chunks?.length ?? 0) > 0;
  const reasoning = chunk?.additional_kwargs?.reasoning_content as string;
  if (reasoning?.length) {
    out.push({
      type: "reasoning",
      content: reasoning,
    });
  }
  if(chunk.usage_metadata){
    out.push({
      type: "usage",
      tokenUsage: chunk.usage_metadata.total_tokens,
    });
  }
  const text = chunk.contentBlocks?.filter(b => b.type === "text");
  if (text?.length && !hasToolCalls) {
    
    out.push({ type: "token", content: text.map(b => b.text).join("") });
  }

  return out;
}

export function handleUpdate(
  nodeName: string,
  update: unknown,
): AgentStreamEvent[] {
  const out: AgentStreamEvent[] = [];

  // сначала tool_calls (порядок исправлен!)
  const msgs = (update as { messages?: BaseMessage[] })?.messages ?? [];
  for (const m of msgs) {
    const toolCalls = (m as { tool_calls?: { name: string; args: unknown }[] }).tool_calls;
    if (!toolCalls?.length) continue;
    for (const c of toolCalls) {
      out.push({ type: "tool_call", node: nodeName, tool: c.name, args: c.args });
    }
  }

  // потом node_end
  out.push({ type: "node_end", node: nodeName });

  return out;
}

export function buildFinalEvent(finalState: unknown): AgentStreamEvent {
  const state = finalState as {
    values?: { messages?: BaseMessage[] };
    tasks?: { interrupts?: { value?: unknown }[] }[];
  };

  const interrupts = state.tasks?.flatMap(t => t.interrupts ?? []) ?? [];
  if (interrupts.length > 0) {
    const first = interrupts[0];
    return { type: "interrupt", interrupt: first.value ?? first };
  }

  const msgs = state.values?.messages ?? [];
  const last = msgs.at(-1)?.content ?? "NoMessage";
  return { type: "done", message: typeof last === "string" ? last : "NoMessage" };
}