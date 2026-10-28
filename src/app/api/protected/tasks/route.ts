import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/auth";
import { AppError } from "@/src/shared/contracts/error";
import { toAppError } from "@/src/lib/server/to-app-error";
import { parseRequestBody } from "@/src/lib/server/parse-body";
import { logger } from "@/src/lib/logger";
import { setRequestUserId, withRequestContext } from "@/src/lib/logger/with-req-context";
import { taskService } from "@/src/lib/tasks";
import { taskListQuerySchema } from "@/src/lib/validations/tasks";
import type { TaskListResponse } from "@/src/shared/contracts/tasks";

export const runtime = "nodejs";

/**
 * Список задач текущего пользователя.
 */
export async function GET(req: NextRequest) {
  return withRequestContext(req, () => handleListTasks(req));
}

async function handleListTasks(req: NextRequest) {
  const log = logger.child({ route: "/api/protected/tasks" });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(401, "UNAUTHORIZED", "Требуется авторизация");
    }
    setRequestUserId(session.user.id);

    // Пустые значения (`?status=`) выбрасываем: иначе zod справедливо скажет
    // «не TaskStatus» и пользователь получит 422 вместо «все задачи».
    const rawQuery: Record<string, string> = {};
    for (const [key, value] of req.nextUrl.searchParams) {
      if (value !== "") rawQuery[key] = value;
    }

    const query = parseRequestBody(taskListQuerySchema, rawQuery);

    const tasks = await taskService.list(session.user.id, query);

    const payload: TaskListResponse = {
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
      })),
    };

    log.info(
      { count: payload.tasks.length, status: query.status ?? null, sort: query.sort ?? "desc" },
      "tasks: список прочитан",
    );

    return NextResponse.json(payload);
  } catch (err) {
    const appError = toAppError(err);

    if (appError.status >= 500) {
      log.error({ err, code: appError.code }, "tasks: не удалось прочитать список");
    } else {
      log.warn({ code: appError.code }, appError.message);
    }

    return NextResponse.json(appError.toResponse(), { status: appError.status });
  }
}
