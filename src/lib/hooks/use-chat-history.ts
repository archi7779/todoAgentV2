'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/src/lib/api/client'
import { toMessage } from '@/src/lib/api/to-message'
import type { ChatHistoryResponse } from '@/src/shared/contracts/chat-history'

const ENDPOINT = '/api/protected/chat-history'

/**
 * История чата из чекпоинтера.
 *
 * Загружается один раз на маунте и перечитывается после каждого прогона:
 * сервер уже записал чекпоинт, поэтому история — источник правды, а не
 * локально накопленный стейт стрима.
 */
export function useChatHistory() {
  const [history, setHistory] = useState<ChatHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // Первичная загрузка. setState — только в асинхронных колбэках: синхронный
  // setState в теле эффекта вызывает каскадные рендеры (react-hooks правило).
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    let active = true

    api
      .get<ChatHistoryResponse>(ENDPOINT, { signal: controller.signal })
      .then((next) => {
        if (!active) return
        setHistory(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return
        setError(toMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  // Отменяем последний запрос при размонтировании (reload мог заменить
  // контроллер на новый).
  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  /** Возвращает true, если история реально обновилась (нужно вызывающему для pending-сообщения). */
  const reload = useCallback(async (): Promise<boolean> => {
    // Быстрый повторный reload отменяет предыдущий: старый ответ не должен
    // перетереть более свежий.
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    try {
      const next = await api.get<ChatHistoryResponse>(ENDPOINT, { signal: controller.signal })
      if (controller.signal.aborted) return false

      setHistory(next)
      setError(null)
      return true
    } catch (err) {
      // Отмена — это не ошибка: её инициировали мы сами.
      if (controller.signal.aborted) return false

      setError(toMessage(err))
      return false
    }
  }, [])

  return {
    history,
    messages: history?.messages ?? [],
    /** Пауза HITL, сохранённая в чекпоинтере (после перезагрузки страницы). */
    interrupt: history?.interrupt ?? null,
    loading,
    error,
    reload,
  }
}
