import { ApiErrorResponse } from '@/src/shared/contracts/error'
import {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  CanceledError,
} from './errors'

/** Безопасно достаём error-объект из тела ответа (payload может быть null или мусором). */
function parseErrorPayload(payload: unknown): ApiErrorResponse['error'] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const error = (payload as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  return error as ApiErrorResponse['error']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** details для 422 — это карта «поле → сообщение». */
function pickValidationFields(details: unknown): Record<string, string> {
  if (!isRecord(details)) return {}
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') fields[key] = value
  }
  return fields
}

/**
 * Приоритет: details.retryAfter → заголовок Retry-After (стандарт) → undefined.
 * Заголовок обычно число секунд; HTTP-date не поддерживаем — редкий кейс.
 */
function pickRetryAfter(details: unknown, headers?: Headers): number | undefined {
  if (isRecord(details) && typeof details.retryAfter === 'number') {
    return details.retryAfter
  }
  const header = headers?.get('Retry-After')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return seconds
  }
  return undefined
}

/**
 * Превращает ответ сервера (со статусом 4xx/5xx) в доменную ошибку.
 * Вызывается ТОЛЬКО когда response.ok === false, то есть сервер ответил, но с ошибкой.
 * Форма тела — ApiErrorResponse: { error: { code, message, details } }.
 */
export function mapHttpError(status: number, payload: unknown, headers?: Headers): ApiError {
  const error = parseErrorPayload(payload)
  const message = error?.message ?? `HTTP ${status}`
  const code = error?.code ?? 'UNKNOWN'

  switch (status) {
    // 401: токен невалидный/протух — особый сценарий (refresh или logout)
    case 401:
      return new UnauthorizedError(payload)

    // 403: авторизован, но прав нет — показываем "доступ запрещён"
    case 403:
      return new ForbiddenError(payload)

    // 404: не найдено — часто нормальный сценарий, не паника
    case 404:
      return new NotFoundError(payload)

    // 422: валидация — details содержит карту «поле → сообщение»
    case 422:
      return new ValidationError(pickValidationFields(error?.details), payload)

    // 429: rate limit — retryAfter из details или из заголовка Retry-After
    case 429: {
      const retryAfter = pickRetryAfter(error?.details, headers)
      return new RateLimitError(retryAfter, payload)
    }

    // Все остальные 4xx (400, 409, ...) и все 5xx — общая ApiError
    default:
      return new ApiError(status, code, message, payload)
  }
}

/**
 * То, что знает вызывающий, но не знает mapFetchError.
 * timedOut и timeout идут парой: таймаут без длительности бессмысленен.
 */
export type FetchErrorContext = {
  timedOut: true
  timeout: number
}

/**
 * Имя ошибки читаем через свойство, а не через instanceof: в разных средах
 * DOMException наследуется от Error по-разному, а abort приезжает именно им.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Превращает техническую ошибку fetch (сеть, отмена, таймаут) в доменную.
 * Вызывается, когда fetch РЕДЖЕКТИТ промис — то есть ответа НЕ было.
 */
export function mapFetchError(error: unknown, context?: FetchErrorContext): Error {
  // fetch реджектит одинаковым AbortError и когда мы сами оборвали
  // запрос по таймауту, и когда отмену запросил вызывающий.
  // Различить их можно только по внешнему флагу — сам AbortError причины не несёт.
  if (isAbortError(error)) {
    return context?.timedOut ? new TimeoutError(context.timeout, error) : new CanceledError()
  }

  // fetch реджектит с TypeError: Failed to fetch при сетевых проблемах,
  // CORS, DNS. Деталей браузер не даёт — только факт "не дошло".
  if (error instanceof TypeError) {
    return new NetworkError('Нет соединения или запрос заблокирован', error)
  }

  // Что-то совсем неожиданное — оборачиваем как есть
  if (error instanceof Error) {
    return new NetworkError(error.message, error)
  }

  return new NetworkError('Неизвестная сетевая ошибка', error)
}
