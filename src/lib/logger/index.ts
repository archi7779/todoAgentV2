import { AsyncLocalStorage } from 'node:async_hooks'
import pino from 'pino'

interface RequestContext {
  requestId: string
  path?: string
  method?: string
  userId?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

const isDev = process.env.NODE_ENV !== 'production'

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,

  // Автоматически подмешиваем контекст запроса в каждую запись
  mixin() {
    const ctx = requestContext.getStore()
    if (!ctx) return {}
    return {
      requestId: ctx.requestId,
      path: ctx.path,
      method: ctx.method,
      userId: ctx.userId,
    }
  },

  // Маскируем чувствительные поля
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', 'secret', 'apiKey'],
    censor: '[REDACTED]',
  },
})

export const logger = baseLogger

// Дочерний логгер с привязкой к конкретному модулю/агенту
export function createLogger(bindings: Record<string, unknown>) {
  return baseLogger.child(bindings)
}
