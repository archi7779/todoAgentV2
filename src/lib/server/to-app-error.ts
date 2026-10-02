import { AppError } from "@/src/shared/contracts/error";
import {
  AuthError,
  CanceledError,
  ConfigurationError,
  ContextLengthError,
  LLMError,
  NetworkError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "@/src/agent/errors";

/**
 * Переводит ошибку серверного слоя в `AppError` (HTTP-контракт API).
 *
 * Единственная точка перевода на границе роута: роут ловит что угодно,
 * отдаёт сюда, наружу уходит `appError.toResponse()` + `appError.status`.
 * Клиент далее через `mapHttpError` получает свой `ApiError`.
 *
 * ВАЖНО: подклассы `ProviderError` (Auth/RateLimit/ContextLength) проверяем
 * ДО базового класса, иначе они никогда не сработают.
 */
export function toAppError(err: unknown): AppError {
  // Уже HTTP-контракт — не трогаем (например, наши же 401/422 из роута).
  if (err instanceof AppError) return err;

  if (err instanceof RateLimitError) {
    return new AppError(
      429,
      "RATE_LIMIT",
      err.message,
      err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : null,
    );
  }

  if (err instanceof TimeoutError) {
    return new AppError(504, "TIMEOUT", err.message);
  }

  if (err instanceof ContextLengthError) {
    return new AppError(413, "CONTEXT_LENGTH", err.message);
  }

  if (err instanceof AuthError) {
    // Это НАШ ключ к провайдеру, а НЕ сессия пользователя. Поэтому 502, а не 401 —
    // иначе клиент по 401 решит, что юзер разлогинен, и выкинет его на /login.
    return new AppError(502, "PROVIDER_AUTH", "Проблема с доступом к провайдеру");
  }

  if (err instanceof NotSupportedError) {
    return new AppError(501, "NOT_SUPPORTED", err.message);
  }

  if (err instanceof NetworkError) {
    return new AppError(502, "NETWORK", err.message);
  }

  if (err instanceof ProviderError) {
    return new AppError(502, "PROVIDER", err.message);
  }

  if (err instanceof ConfigurationError) {
    // Детали конфигурации наружу не отдаём.
    return new AppError(500, "CONFIG", "Ошибка конфигурации сервера");
  }

  if (err instanceof CanceledError) {
    // Клиент уже отключился — ответ, скорее всего, никто не увидит.
    return new AppError(499, "CANCELED", err.message);
  }

  if (err instanceof LLMError) {
    return new AppError(500, err.code, err.message);
  }

  return new AppError(500, "INTERNAL", "Внутренняя ошибка сервера");
}
