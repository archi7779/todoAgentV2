import type { z } from "zod";
import { AppError } from "@/src/shared/contracts/error";

/**
 * Разбор + валидация тела запроса на границе роута.
 *
 * Это ДВА разных этапа с разными статусами, поэтому они отдельными функциями:
 *  - `readJson`          — это вообще JSON? битый/пустой → 400 MALFORMED_JSON
 *  - `parseRequestBody`  — те ли поля/типы/лимиты? схема не сошлась → 422 VALIDATION
 *
 * Обе бросают `AppError`, а не возвращают ответ вручную. Роут ловит их общим
 * catch → `toAppError(err).toResponse()`, так тело ошибки ВСЕГДА остаётся
 * `ApiErrorResponse` (`{ error: { code, message, details } }`), которое ждёт
 * `mapHttpError` на клиенте. Ручной `NextResponse.json({ error: "строка" })`
 * ломает контракт: `parseErrorPayload` вернёт null и клиент потеряет детали.
 */

/** Читает JSON из `Request`. Битый или пустой JSON → AppError 400. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "MALFORMED_JSON", "Тело запроса — не валидный JSON");
  }
}

/**
 * Валидирует уже разобранное тело по zod-схеме.
 *
 * `safeParse` (не `parse`): не бросает сырой `ZodError`, а отдаёт юнион —
 * разбираем явно. `details` = карта «поле → сообщение», ровно её
 * `mapHttpError`/`ValidationError` кладёт в `fields` на клиенте.
 */
export function parseRequestBody<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const fields = Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]),
  );
  throw new AppError(422, "VALIDATION", "Некорректный запрос", fields);
}

/** Удобный шорткат: прочитать JSON и сразу провалидировать. */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  return parseRequestBody(schema, await readJson(req));
}
