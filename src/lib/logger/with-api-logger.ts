import { NextRequest, NextResponse } from 'next/server'
import { logger } from './index' // подправь путь
import { withRequestContext } from './with-req-context'

type Handler = (req: NextRequest, ctx: any) => Promise<NextResponse | Response>

export function withApiLogger(handler: Handler): Handler {
  return async (req, ctx) => {
    return withRequestContext(req, async () => {
      const start = Date.now()
      const log = logger.child({ route: req.nextUrl.pathname })

      log.info({ query: req.nextUrl.search }, '→ входящий запрос')

      try {
        const res = await handler(req, ctx)
        log.info({ status: res.status, duration: Date.now() - start }, '← ответ отправлен')
        return res
      } catch (err) {
        log.error({ err, duration: Date.now() - start }, '✖ ошибка в обработчике')
        throw err
      }
    })
  }
}
