import { randomUUID } from 'node:crypto'
import { requestContext } from './index'

export function withRequestContext<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const ctx = {
    requestId: randomUUID(),
    path: new URL(req.url).pathname,
    method: req.method,
  }
  return requestContext.run(ctx, fn)
}

/**
 * Привязывает пользователя к текущему запросу.
 *
 * Вызывать ПОСЛЕ `auth()` — раньше userId просто неизвестен. Мутируем тот же
 * объект, что лежит в сторе, поэтому `pino.mixin` подхватит его во всех
 * последующих строках, включая логи уже запущенного стрима.
 */
export function setRequestUserId(userId: string): void {
  const ctx = requestContext.getStore()
  if (ctx) ctx.userId = userId
}
