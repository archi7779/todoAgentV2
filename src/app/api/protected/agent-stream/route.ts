import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/auth";
import { AppError } from "@/src/shared/contracts/error";
import { toAppError } from "@/src/lib/server/to-app-error";
import { readJson, parseRequestBody } from "@/src/lib/server/parse-body";
import { agentStreamRequestSchema } from "@/src/lib/validations/agent";
import { logger } from "@/src/lib/logger";
import { setRequestUserId, withRequestContext } from "@/src/lib/logger/with-req-context";
import { AgentNodeName, AgentStreamInput, getApp } from "@/src/agent/graph";
import { getMainThreadId } from "@/src/agent/threads";
import { Command } from "@langchain/langgraph";
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { makeSSESender } from "./sse";
import type { AgentStreamEvent } from "@/src/shared/contracts/agent-stream";
import { buildFinalEvent, handleMessageChunk, handleUpdate } from "@/src/agent/graph/helpers";

export const runtime = "nodejs";

// Дедлайн на ВЕСЬ прогон (не на один вызов LLM): от старта стрима до последнего
// чанка. Многошаговый агент может упереться в него на нескольких итерациях.
const LLM_TIMEOUT_MS = 60000;

// Роут — тонкая обёртка: вся работа уходит в ALS-контекст запроса, чтобы
// pino.mixin подмешивал requestId/userId в КАЖДУЮ строку лога, включая те, что
// пишутся уже во время стрима.
export async function POST(req: NextRequest) {
  return withRequestContext(req, () => handleAgentStream(req));
}

async function handleAgentStream(req: NextRequest) {
  const log = logger.child({ route: "/api/protected/agent-stream" });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(401, "UNAUTHORIZED", "Требуется авторизация");                                       
    }

    // Дальше userId едет в логах сам, руками его больше передавать не надо.
    setRequestUserId(session.user.id);


    const body = parseRequestBody(agentStreamRequestSchema, await readJson(req));

    // Тред выводится из сессии, а не из тела запроса: один пользователь — один
    // чат. Клиент не может подставить чужой thread_id и продолжить чужой диалог.
    const threadId = getMainThreadId(session.user.id);

    log.info(
      { threadId, resume: Boolean(body.resume) },
      "agent-stream: запрос принят",
    );

    // «Потребитель ушёл» приходит двумя путями: req.signal (обрыв соединения) и
    // cancel() у стрима. Сводим их в один сигнал — он гасит прогон и говорит
    // стриму, что писать больше некуда.
    const consumerAbort = new AbortController();
    const consumerSignal = AbortSignal.any([req.signal, consumerAbort.signal]);

    // Дедлайн прогона — ОТДЕЛЬНОЙ переменной, а не инлайном внутри any().
    // Сигналы слиты в один, но причины у них разные, и в catch надо уметь
    // ответить «кто именно оборвал».
    const deadlineSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);

    const config = {
        configurable: { thread_id: threadId },
        signal: AbortSignal.any([consumerSignal, deadlineSignal]),
        recursionLimit: 10,
        }; 

        let app;
        try {
            app = await getApp();
        } catch (err) {
            //ошибка получения графа  - лог внутри гетАпп
            const appError = toAppError(err);
            return NextResponse.json(appError.toResponse(), { status: appError.status });
        }

  const input: AgentStreamInput =
            body.resume !== undefined
            ? (new Command<Record<string, unknown>, Record<string, unknown>, AgentNodeName>({
                resume: body.resume,
              }) as AgentStreamInput)
            : { messages: [new HumanMessage(body.message)] };

    const t0 = performance.now();

    // Стрим ещё «жив»? После отмены потребителем любой enqueue/close бросит
    // TypeError, поэтому держим флаг и глушим запись.
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sse = makeSSESender(controller);
        const send = (data: AgentStreamEvent) => {
          if (closed) return;
          try {
            sse(data);
          } catch {
            closed = true;
          }
        };

        try {
                  const eventStream = await app.stream(input, {
                    ...config,
                    streamMode: ["messages", "updates"],
                  });
                  //Обрабатываем поток Сообщений-------------------------------------------------------------------------------------------------
                  for await (const event of eventStream) {
                    const [mode, payload] = event as
                      | ["messages", [AIMessageChunk, { langgraph_node?: string }]]
                      | ["updates", Record<string, unknown>];      
                            // --- токены ---
                if (mode === "messages") {
                      const [chunk, metadata] = payload;
                      console.log('messagesCHUNK',chunk)
                      for (const evt of handleMessageChunk(chunk, metadata)) {
                        send(evt);
                      }
                    }
                    // --- переходы узлов + tool_calls Для отображения на фронте какая нода работает----------------------------------------------------------------------------------------------------
                    if (mode === "updates") {
                      for (const [nodeName, update] of Object.entries(payload)) {
                         console.log('updatesCHUNK',update)
                        for (const evt of handleUpdate(nodeName, update)) {
                          send(evt);
                        }
                      }
                    }
                  }

                  // 7. После стрима — финальный state и interrupt
                  const finalState = await app.getState(config);
                  const values = finalState?.values ?? {};
                  const interrupts = finalState?.tasks?.flatMap((t: any) => t.interrupts ?? []) ?? [];
                  //Так можно посмотреть соклько токенов за историю потрачено
                  const totalTokens = finalState.values?.totalTokens
                  console.log('finalState',finalState.values?.totalTokens)
                  logger.info(
                    {
                      tool: "run",
                      threadId,
                      ms: Math.round(performance.now() - t0),
                      llmCalls: values.llmCalls ?? 0,
                      totalTokens: values.totalTokens ?? 0,
                      hasInterrupt: interrupts.length > 0,
                    },
                    "run finished",
                  );

          send(buildFinalEvent(finalState));
        } catch (err) {
         
          if (consumerSignal.aborted) {
            // Клиент ушёл: это не ошибка, эвент слать некуда и незачем.
            log.info({ threadId }, "agent-stream: прогон отменён потребителем");
          } else if (deadlineSignal.aborted) {
              //Отклюбчение по таймауту - кидаем ошибку 
            const appError = new AppError(
              504,
              "TIMEOUT",
              `Превышено время на операцию ${LLM_TIMEOUT_MS} мс`,
            );
            log.error(
              { threadId, code: appError.code, ms: LLM_TIMEOUT_MS },
              "agent-stream: дедлайн прогона",
            );
            send({ type: "error", error: appError.code, message: appError.message });
          } else {
            const appError = toAppError(err);
            // errName/errType — чтобы INTERNAL в логах не был слепым: сразу видно,
            // что именно прилетело (DOMException, TypeError, что-то из SDK).
            log.error(
              {
                err,
                code: appError.code,
                errName: (err as { name?: string })?.name,
                errType: (err as { constructor?: { name?: string } })?.constructor?.name,
              },
              "Стрим упал",
            );
            send({ type: "error", error: appError.code, message: appError.message });
          }
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // Контроллер уже закрыт (потребитель отменил стрим) — это ожидаемо.
            }
          }
        }
      },
      // Рантайм вызывает это, когда потребитель отменяет стрим: клиент закрыл
      // вкладку, нажал «Отменить», оборвалась сеть. Единственная точка, где об
      // этом можно узнать и корректно остановить уже запущенную работу.
      cancel(reason) {
        // Стрим уже закрылся сам — значит отменять нечего (клиент просто отключился
        // после ответа). Иначе получили бы ложный «отменён» в логах.
        if (closed) return;

        closed = true;
        consumerAbort.abort(reason);
        log.info({ threadId, reason }, "agent-stream: потребитель отменил стрим");
      },
    });      

    // ВАЖНО: именно new NextResponse(stream, ...) — NextResponse.json() бы
    // сериализовал стрим в JSON ("{}"), и клиент не получил бы поток.
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const appError = toAppError(err);

    if (appError.status >= 500) {
      log.error({ err, code: appError.code }, "ошибка обработки agent-stream");
    } else {
      log.warn({ code: appError.code }, appError.message);
    }

    return NextResponse.json(appError.toResponse(), { status: appError.status });
  }
}