export class ApiError extends Error {
  constructor(
    public status: number, // HTTP-код: 400, 401, 404, 500...
    public code: string, // машинный код: 'NOT_FOUND', 'VALIDATION'...
    message: string, // человекочитаемое сообщение
    public payload?: unknown // тело ответа от сервера как есть
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 401 — токен отсутствует/протух/неверный.
 * Отдельный класс, потому что реакция особая: обновить токен или разлогинить.
 */
export class UnauthorizedError extends ApiError {
  constructor(payload?: unknown) {
    super(401, 'UNAUTHORIZED', 'Требуется авторизация', payload)
    this.name = 'UnauthorizedError'
  }
}

/**
 * 403 — прав нет. Редирект на логин НЕ поможет, показываем "доступ запрещён".
 */
export class ForbiddenError extends ApiError {
  constructor(payload?: unknown) {
    super(403, 'FORBIDDEN', 'Доступ запрещён', payload)
    this.name = 'ForbiddenError'
  }
}

/**
 * 404 — ресурс не найден. Часто это НЕ ошибка, а нормальный сценарий.
 */
export class NotFoundError extends ApiError {
  constructor(payload?: unknown) {
    super(404, 'NOT_FOUND', 'Не найдено', payload)
    this.name = 'NotFoundError'
  }
}

/**
 * 422 — ошибка валидации. Приходит с полями: какие поля не прошли.
 */
export class ValidationError extends ApiError {
  constructor(
    public fields: Record<string, string>, // { email: 'занят', password: 'короткий' }
    payload?: unknown
  ) {
    super(422, 'VALIDATION', 'Ошибка валидации', payload)
    this.name = 'ValidationError'
  }
}

/**
 * 429 — слишком много запросов. Можно показать "подождите" и retryAfter.
 */
export class RateLimitError extends ApiError {
  constructor(
    public retryAfter?: number,
    payload?: unknown
  ) {
    super(429, 'RATE_LIMIT', 'Слишком много запросов', payload)
    this.name = 'RateLimitError'
  }
}

/**
 * Сетевая ошибка — ответа от сервера НЕТ вообще.
 * Сеть, CORS, DNS. HTTP-кода тут нет.
 */
export class NetworkError extends Error {
  constructor(
    message = 'Нет соединения',
    public cause?: unknown
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * Сервер не ответил за отведённое время.
 * Наследуемся от NetworkError: причина та же — ответа не было.
 * Разница в реакции — таймаут можно повторить, а отмену вызывающим нельзя.
 */
export class TimeoutError extends NetworkError {
  constructor(
    public timeout: number,
    cause?: unknown
  ) {
    super(`Сервер не ответил за ${timeout} мс`, cause)
    this.name = 'TimeoutError'
  }
}

/**
 * Запрос был отменён. Это НЕ ошибка — обычно надо просто молча выйти.
 */
export class CanceledError extends Error {
  constructor(message = 'Запрос отменён') {
    super(message)
    this.name = 'CanceledError'
  }
}
