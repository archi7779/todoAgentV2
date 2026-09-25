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
