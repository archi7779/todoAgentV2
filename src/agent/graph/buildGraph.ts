import { StateGraph, START, END } from "@langchain/langgraph";
import { getProvider } from "../providers";
import { AgentState } from "./helpers";
import { getChatModel } from "../getChatModel";
import { makeAgentNode } from "../nodes/makeAgentNode";
import { getCheckpointer } from "./checkpointer";
import { taskTools } from "../tools/taskTools";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";

/**
 * Имена узлов графа — единый источник правды для типизации `Command` и входа графа.
 * Держать в синхроне с `addNode(...)` ниже ("tools" включится вместе с ToolNode).
 */
export type AgentNodeName = "__start__" | "agent" | "tools";

export async function buildApp() {

  const checkpointer = await getCheckpointer();

  //Временно - потом с фронта затянем
  const LLM_MODEL = 'deepseek'

  const provider = getProvider(LLM_MODEL)
  const model = await getChatModel(provider)
  const modelWithTools = model.bindTools(taskTools); 
   
  const agentNode = makeAgentNode({
    model: modelWithTools,
    providerName: LLM_MODEL,
    modelName: provider.chatModel,
  });

  return new StateGraph(AgentState)
    .addNode("agent", agentNode)
     .addNode("tools", new ToolNode(taskTools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "agent")
    .compile({ checkpointer });
}

export type App = Awaited<ReturnType<typeof buildApp>>;

export type AgentStreamInput = Parameters<App["stream"]>[0];