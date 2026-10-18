import { StateGraph, START } from "@langchain/langgraph";
import { getProvider } from "../providers";
import { AgentState } from "./helpers";
import { getChatModel } from "../getChatModel";
import { makeAgentNode } from "../nodes/makeAgentNode";
import { getCheckpointer } from "./checkpointer";

/**
 * Имена узлов графа — единый источник правды для типизации `Command` и входа графа.
 * Держать в синхроне с `addNode(...)` ниже ("tools" включится вместе с ToolNode).
 */
export type AgentNodeName = "__start__" | "agent" | "tools";

export async function buildApp() {
  // Синглтон на процесс: пул + setup() (таблицы LangGraph в схеме `langgraph`)
  // выполняются один раз. Не сюда — thread_id и signal: они на каждый прогон.
  const checkpointer = await getCheckpointer();

  //Временно - потом с фронта затянем
  const LLM_MODEL = 'deepseek'

  const model = await getChatModel(getProvider(LLM_MODEL))

  //Тут наш стриминг продумать что нам тут надо обработать и что мы можем тут обработать 
  // В фабрику уходит только то, что живёт вместе с процессом. Config — не сюда:
  // граф собирается ОДИН раз и кэшируется в getApp(), а config на каждый
  // прогноз свой (свой thread_id, свой signal).
  const agentNode = makeAgentNode({ model, providerName: LLM_MODEL });

  //И все примитивный агент готов поидеи
  return new StateGraph(AgentState)
    .addNode("agent", agentNode)
    // .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    // .addConditionalEdges("agent", toolsCondition, ["tools", END])
    // .addEdge("tools", "agent")
    .compile({ checkpointer });
}

export type App = Awaited<ReturnType<typeof buildApp>>;

export type AgentStreamInput = Parameters<App["stream"]>[0];