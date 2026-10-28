'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/src/lib/api/client'
import { toMessage } from '@/src/lib/api/to-message'
import type { TaskStatus } from '@/src/generated/prisma/enums'
import type { TaskListResponse } from '@/src/shared/contracts/tasks'

const ENDPOINT = '/api/protected/tasks'

export type UseTasksParams = {
  /** Без значения — все задачи. */
  status?: TaskStatus
  /** Направление по createdAt, по умолчанию на сервере — desc. */
  sort?: 'desc' | 'asc'
}

/** Собирает URL: пустые параметры не добавляем, чтобы не ловить 422 на `?status=`. */
function buildUrl({ status, sort }: UseTasksParams): string {
  const search = new URLSearchParams()
  if (status) search.set('status', status)
  if (sort) search.set('sort', sort)

  const qs = search.toString()
  return qs ? `${ENDPOINT}?${qs}` : ENDPOINT
}

/**
 * Задачи текущего пользователя + фильтры.
 *
 * `refresh()` — не отдельная копия запроса, а бамп версии: эффект с зависимостями
 * перезапустится сам. Так правило «где грузим» живёт в одном месте, а не в двух
 * (эффект + императивный reload), которые со временем разъезжаются.
 */
export function useTasks({ status, sort }: UseTasksParams = {}) {
  const [data, setData] = useState<TaskListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // Спиннер показываем только на ПЕРВОЙ загрузке: при обновлении после прогона
  // агента список не должен мигать «Загружаю…».
  const hasLoadedRef = useRef(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    if (!hasLoadedRef.current) setLoading(true)

    api
      .get<TaskListResponse>(buildUrl({ status, sort }), { signal: controller.signal })
      .then((next) => {
        if (!active) return
        hasLoadedRef.current = true
        setData(next)
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
  }, [status, sort, version])

  return {
    tasks: data?.tasks ?? [],
    loading,
    error,
    refresh,
  }
}
