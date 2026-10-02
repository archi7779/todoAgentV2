/**
 * Доменные ошибки LLM-слоя (провайдеры ↔ агент).
 *
 * Это ОТДЕЛЬНЫЙ словарь, а не клиентские `ApiError` из `lib/api/errors.ts`
 * (те описывают HTTP-ответы нашего API) и не `AppError` (то вообще про HTTP).
 *
 * Поток ошибки между слоями:
 *   провайдер бросает `LLMError`
 *     → роут переводит в `AppError` (+ HTTP-статус) → `toResponse()`
 *       → клиент через `mapHttpError` получает `ApiError`.
 *
 * Каждый слой знает только свой словарь.
 */

export type LLMErrorCode =
  | "CONFIG"
  | "NOT_SUPPORTED"
  | "AUTH"
  | "RATE_LIMIT"
  | "CONTEXT_LENGTH"
  | "TIMEOUT"
  | "CANCELED"
  | "NETWORK"
  | "PROVIDER";

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly retryable: boolean = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Проблема конфигурации: нет ключа, неизвестный провайдер, пустое имя. Обычно фатально. */
export class ConfigurationError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG", false, cause);
    this.name = "ConfigurationError";
  }
}

/** Провайдер не поддерживает операцию (например, embed у Anthropic). Вызывающий ветвится. */
export class NotSupportedError extends LLMError {
  constructor(message: string) {
    super(message, "NOT_SUPPORTED", false);
    this.name = "NotSupportedError";
  }
}

/** Сеть: ответа от провайдера не было. Обычно retryable. */
export class NetworkError extends LLMError {
  constructor(message = "Нет соединения с провайдером", cause?: unknown) {
    super(message, "NETWORK", true, cause);
    this.name = "NetworkError";
  }
}

/** Провайдер не ответил за отведённое время. Retryable. */
export class TimeoutError extends LLMError {
  constructor(
    public readonly timeout?: number,
    cause?: unknown,
  ) {
    super(
      timeout ? `Провайдер не ответил за ${timeout} мс` : "Таймаут провайдера",
      "TIMEOUT",
      true,
      cause,
    );
    this.name = "TimeoutError";
  }
}

/** Отмена (клик/аборт). Это НЕ ошибка — обычно надо молча выйти. НЕ retryable. */
export class CanceledError extends LLMError {
  constructor(message = "Запрос отменён") {
    super(message, "CANCELED", false);
    this.name = "CanceledError";
  }
}

/** Базовая ошибка API провайдера: есть HTTP-статус и/или машинный код. */
export class ProviderError extends LLMError {
  constructor(
    message: string,
    public readonly provider: string,
    opts: {
      code?: LLMErrorCode;
      status?: number;
      providerCode?: string;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, opts.code ?? "PROVIDER", opts.retryable ?? false, opts.cause);
    this.name = "ProviderError";
    this.status = opts.status;
    this.providerCode = opts.providerCode;
  }

  readonly status?: number;
  readonly providerCode?: string;
}

/** Провайдер отклонил ключ/доступ (401/403). Не retryable. */
export class AuthError extends ProviderError {
  constructor(
    provider: string,
    message = "Провайдер отклонил ключ доступа",
    opts: { status?: number; providerCode?: string; cause?: unknown } = {},
  ) {
    super(message, provider, {
      code: "AUTH",
      status: opts.status,
      providerCode: opts.providerCode,
      retryable: false,
      cause: opts.cause,
    });
    this.name = "AuthError";
  }
}

/** Превышен лимит запросов (429). Retryable; может нести retryAfter (сек). */
export class RateLimitError extends ProviderError {
  constructor(
    provider: string,
    opts: {
      message?: string;
      status?: number;
      providerCode?: string;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(opts.message ?? "Превышен лимит запросов к провайдеру", provider, {
      code: "RATE_LIMIT",
      status: opts.status ?? 429,
      providerCode: opts.providerCode,
      retryable: true,
      cause: opts.cause,
    });
    this.name = "RateLimitError";
    this.retryAfter = opts.retryAfter;
  }

  readonly retryAfter?: number;
}

/** Превышено окно контекста модели. Не retryable — надо резать историю. */
export class ContextLengthError extends ProviderError {
  constructor(
    provider: string,
    opts: { message?: string; status?: number; providerCode?: string; cause?: unknown } = {},
  ) {
    super(opts.message ?? "Превышено окно контекста модели", provider, {
      code: "CONTEXT_LENGTH",
      status: opts.status,
      providerCode: opts.providerCode,
      retryable: false,
      cause: opts.cause,
    });
    this.name = "ContextLengthError";
  }
}

// --- Маппинг ошибок SDK → LLMError -----------------------------------------

export interface ProviderErrorContext {
  /** Сигнал, которым отменяли запрос (для распознавания отмены). */
  signal?: AbortSignal;
  /** Если оборвали мы по таймауту — передать true (как в `mapFetchError`). */
  timedOut?: boolean;
  timeout?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return undefined;
}

/**
 * Имя ошибки читаем по свойству (не instanceof). Внимание: SDK OpenAI/Anthropic
 * НЕ выставляют `error.name` — там всегда "Error", поэтому "AbortError" ловим
 * только у сырых fetch-ошибок, а отмену SDK определяем по `signal`.
 */
function nameOf(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.name === "string") return error.name;
  return undefined;
}

function statusOf(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.status === "number") return error.status;
  return undefined;
}

function providerCodeOf(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.code === "string") return error.code; // OpenAI
  const nested = error.error;
  if (isRecord(nested) && typeof nested.type === "string") return nested.type; // Anthropic
  if (typeof error.type === "string") return error.type;
  return undefined;
}

function retryAfterOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const headers = error.headers;
  if (headers && typeof (headers as Headers).get === "function") {
    const raw = (headers as Headers).get("retry-after");
    if (raw) {
      const seconds = Number(raw);
      if (Number.isFinite(seconds)) return seconds;
    }
  }
  return undefined;
}

const CONTEXT_LENGTH_HINTS = [
  "context_length_exceeded",
  "context length",
  "too long",
  "too many tokens",
  "maximum context",
];

function looksLikeContextLength(
  status: number | undefined,
  code: string | undefined,
  message: string | undefined,
): boolean {
  if (status !== 400 && status !== 413) return false;
  const hay = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  return CONTEXT_LENGTH_HINTS.some((hint) => hay.includes(hint));
}

/**
 * Переводит ошибку SDK провайдера в доменную `LLMError`.
 *
 * Проверка структурная (`status`/`name`/`signal`) — без импорта SDK, чтобы
 * модуль ошибок не тянул за собой OpenAI/Anthropic.
 */
export function mapProviderError(
  error: unknown,
  provider: string,
  ctx: ProviderErrorContext = {},
): LLMError {
  if (error instanceof LLMError) return error;

  // 1. Отмена/таймаут — раньше всего: SDK отдают их без HTTP-статуса.
  if (ctx.timedOut) return new TimeoutError(ctx.timeout, error);
  if (ctx.signal?.aborted || nameOf(error) === "AbortError") {
    return new CanceledError();
  }

  const message = messageOf(error);
  const status = statusOf(error);
  const providerCode = providerCodeOf(error);

  // 2. Таймаут соединения от SDK (статуса нет, только текст).
  if (status === undefined && message && /timed out/i.test(message)) {
    return new TimeoutError(undefined, error);
  }

  // 3. Есть HTTP-статус.
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return new AuthError(provider, message, { status, providerCode, cause: error });
    }
    if (status === 429) {
      return new RateLimitError(provider, {
        status,
        providerCode,
        retryAfter: retryAfterOf(error),
        cause: error,
      });
    }
    if (looksLikeContextLength(status, providerCode, message)) {
      return new ContextLengthError(provider, { status, providerCode, cause: error });
    }
    return new ProviderError(message ?? `Провайдер ответил статусом ${status}`, provider, {
      status,
      providerCode,
      retryable: status >= 500,
      cause: error,
    });
  }

  // 4. Статуса нет — ответа от провайдера не было, считаем сетевой проблемой.
  return new NetworkError(message ?? "Нет соединения с провайдером", error);
}
