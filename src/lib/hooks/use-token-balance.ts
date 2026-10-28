'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/src/lib/api/client'
import { toMessage } from '@/src/lib/api/to-message'
import type { TokenBalanceResponse } from '@/src/shared/contracts/token-balance'

const ENDPOINT = '/api/protected/token-balance'

/**
 * Баланс токенов: остаток + суммарно потрачено.
 * Загружается на маунте и перечитывается после каждого прогона.
 */
export function useTokenBalance() {
  const [data, setData] = useState<TokenBalanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // setState только в асинхронных колбэках — иначе react-hooks ругается на
  // каскадные рендеры из эффекта.
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    let active = true

    api
      .get<TokenBalanceResponse>(ENDPOINT, { signal: controller.signal })
      .then((next) => {
        if (!active) return
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
  }, [])

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  const reload = useCallback(async (): Promise<boolean> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    try {
      const next = await api.get<TokenBalanceResponse>(ENDPOINT, { signal: controller.signal })
      if (controller.signal.aborted) return false

      setData(next)
      setError(null)
      return true
    } catch (err) {
      if (controller.signal.aborted) return false
      setError(toMessage(err))
      return false
    }
  }, [])

  return {
    balance: data?.balance ?? null,
    spentTotal: data?.spentTotal ?? 0,
    loading,
    error,
    reload,
  }
}
