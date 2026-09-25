import { logger } from './index'
//Когда прикрутичивать агента будем - добавить вывод токенов!
export function withAgentLog<TArgs extends any[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>
) {
  const log = logger.child({ component: 'agent', agent: name })

  return async (...args: TArgs): Promise<TResult> => {
    const start = Date.now()
    log.info({ input: args }, 'агент: старт')

    try {
      const result = await fn(...args)
      log.info({ duration: Date.now() - start, result }, 'агент: успех')
      return result
    } catch (err) {
      log.error({ err, duration: Date.now() - start }, 'агент: ошибка')
      throw err
    }
  }
}
