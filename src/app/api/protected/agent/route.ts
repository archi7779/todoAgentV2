import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/auth";
import { getProvider } from "@/src/agent/providers";
import { toAppError } from "@/src/lib/server/to-app-error";
import { agentRequestSchema } from "@/src/lib/validations/agent";
import { AppError } from "@/src/shared/contracts/error";
import { TimeoutError } from "@/src/agent/errors";
import { logger } from "@/src/lib/logger";

// SDK-провайдеры и Prisma требуют Node — не Edge.
export const runtime = "nodejs";

// Потолок на один вызов LLM. Вызовы моделей медленные, но не бесконечные: без
// этого подвисший upstream держит соединение до Next-овского maxDuration.
const LLM_TIMEOUT_MS = 60_000;

export async function POST(req: NextRequest) {
  const log = logger.child({ route: "/api/protected/agent" });

  // Заполняется только перед вызовом провайдера — в catch по нему отличаем наш
  // таймаут от отмены клиентом (оба дают один и тот же AbortError).
  let timeoutSignal: AbortSignal | undefined;

  try {
    // middleware уже закрывает /api/protected, но проверяем и здесь (defense in depth).
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(401, "UNAUTHORIZED", "Требуется авторизация");
    }

    const parsed = agentRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      // details = карта «поле → сообщение»: mapHttpError на клиенте разложит её в ValidationError.
      const fields = Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]),
      );
      throw new AppError(422, "VALIDATION", "Некорректный запрос", fields);
    }

    const { prompt, provider: providerName, model } = parsed.data;
    const provider = getProvider(providerName);

    // TODO: заменить на runAgent(...) когда появится цикл агента (инструменты, итерации).
    // Склеиваем отмену клиента (req.signal) с per-request таймаутом: любой из них
    // обрывает SDK, при этом таймер таймаута сам себя очищает по завершении.
    timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
    const signal = AbortSignal.any([req.signal, timeoutSignal]);

    const result = await provider.chat([{ role: "user", content: prompt }], {
      model,
      signal,
    });

    log.info(
      {
        userId: session.user.id,
        provider: providerName,
        model: result.model,
        usage: result.usage,
      },
      "агент: ответ отправлен",
    );

    // raw наружу не отдаём — это лишний вес и потенциальная утечка.
    return NextResponse.json({
      text: result.text,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    const baseError = toAppError(err);

    // AbortSignal.any() даёт одинаковый AbortError и при отмене кликом, и при
    // таймауте — провайдер маппит любой аборт в CanceledError (= 499). Если
    // сработал именно наш таймаут, а клиент ещё ждёт ответ — это 504, не «отменено».
    const appError =
      baseError.code === "CANCELED" && timeoutSignal?.aborted && !req.signal.aborted
        ? toAppError(new TimeoutError(LLM_TIMEOUT_MS, err))
        : baseError;

    if (appError.code === "CANCELED") {
      log.info("запрос отменён клиентом");
    } else if (appError.status >= 500) {
      log.error({ err, code: appError.code }, "ошибка обработки запроса агента");
    } else {
      log.warn({ code: appError.code }, appError.message);
    }

    return NextResponse.json(appError.toResponse(), { status: appError.status });
  }
}
