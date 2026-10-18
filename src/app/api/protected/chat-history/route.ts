import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/auth";
import { getApp } from "@/src/agent/graph";
import { toChatHistory } from "@/src/agent/graph/history";
import { getMainThreadId } from "@/src/agent/threads";
import { AppError } from "@/src/shared/contracts/error";
import { toAppError } from "@/src/lib/server/to-app-error";
import { logger } from "@/src/lib/logger";
import { setRequestUserId, withRequestContext } from "@/src/lib/logger/with-req-context";

export const runtime = "nodejs";

/**
 * История текущего чата: читается из чекпоинтера, а не из отдельной таблицы
 * сообщений. Один пользователь — один тред, поэтому параметров у ручки нет.
 *
 * Пустая история — это 200 с `messages: []`: для нового пользователя чекпоинта
 * ещё не существует, и это нормальное состояние, а не 404.
 */
export async function GET(req: NextRequest) {
  return withRequestContext(req, () => handleGetChatHistory());
}

async function handleGetChatHistory() {
  const log = logger.child({ route: "/api/protected/chat-history" });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(401, "UNAUTHORIZED", "Требуется авторизация");
    }
    setRequestUserId(session.user.id);

    // Тот же thread_id, что использует agent-stream: идентичность берётся из
    // сессии, поэтому клиент не может прочитать чужую историю.
    const threadId = getMainThreadId(session.user.id);

    const app = await getApp();
    const snapshot = await app.getState({ configurable: { thread_id: threadId } });

    const history = toChatHistory(snapshot);

    log.info(
      { threadId, messages: history.messages.length },
      "chat-history: история прочитана",
    );

    return NextResponse.json(history);
  } catch (err) {
    const appError = toAppError(err);
    log.error({ err, code: appError.code }, "chat-history: не удалось прочитать историю");
    return NextResponse.json(appError.toResponse(), { status: appError.status });
  }
}
