import type { AgentStreamEvent } from "@/src/shared/contracts/agent-stream";

export function makeSSESender(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  return (data: AgentStreamEvent) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}