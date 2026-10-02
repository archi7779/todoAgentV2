import {
  ApiError,
  CanceledError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from './errors'

/**
 * Превращает ошибку из api-слоя в человекочитаемый текст для UI.
 *
 * Порядок важен: `ValidationError` наследуется от `ApiError`, а `TimeoutError` —
 * от `NetworkError`, поэтому подклассы проверяем раньше базовых.
 * `CanceledError`/`NetworkError`/`TimeoutError` вообще НЕ `ApiError`
 * (ответа от сервера не было) — их обрабатываем отдельно.
 */
export function toMessage(err: unknown): string {
  if (err instanceof ValidationError) {
    return Object.values(err.fields)[0] ?? err.message
  }
  if (err instanceof CanceledError) return 'Запрос отменён'
  if (err instanceof TimeoutError) return err.message
  if (err instanceof NetworkError) return err.message
  if (err instanceof ApiError) return err.message
  return 'Что-то пошло не так. Попробуйте ещё раз'
}

