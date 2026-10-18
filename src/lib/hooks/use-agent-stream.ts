'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mapFetchError, mapHttpError } from '@/src/lib/api/errorParser'
import { CanceledError } from '@/src/lib/api/errors'
import { toMessage } from '@/src/lib/api/to-message'
import type { AgentStreamEvent } from '@/src/shared/contracts/agent-stream'

// Тот же базовый URL, что и в lib/api/client.ts: в дев-режиме он пустой и запрос
// уходит на свой origin (куки сессии едут сами).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
const ENDPOINT = '/api/protected/agent-stream'

export type AgentStreamStatus =
  | 'idle'
  | 'streaming'
  /** Терминальное событие `done`. */
  | 'done'
  /** Терминальное событие `interrupt` — ждём ответа человека. */
  | 'interrupted'
  | 'error'
  /** Отменил пользователь (кнопка или уход со страницы) — это НЕ ошибка. */
  | 'canceled'

export type AgentToolCall = { node: string; tool: string; args: unknown }

/**
 * Тело запроса. Дублирует `agentStreamRequestSchema` намеренно: импортировать
 * zod-схему в клиентский бандл ради типа не хочется. Валидирует всё равно сервер.
 */
export type AgentStreamPayload = {
  message: string
  /** Есть поле → это ответ на interrupt, а не новый запрос. */
  resume?: Record<string, unknown>
  provider?: 'openai' | 'anthropic' | 'deepseek'
  model?: string
}

export type AgentStreamState = {
  status: AgentStreamStatus
  /** Склеенный текст ответа (из `token`). */
  text: string
  /** Склеенные размышления (из `reasoning`). */
  reasoning: string
  toolCalls: AgentToolCall[]
  /** Узлы, которые уже завершились, в порядке завершения. */
  nodes: string[]
  /** Полезная нагрузка последнего `interrupt` (форма HITL). */
  interrupt: unknown | null
  /** Финальный текст из `done`, если прогон дошёл до конца. */
  finalMessage: string | null
  /** Человекочитаемая ошибка для UI. */
  error: string | null
  tokenUsage?: number;
}

const INITIAL_STATE: AgentStreamState = {
  status: 'idle',
  text: '',
  reasoning: '',
  toolCalls: [],
  nodes: [],
  interrupt: null,
  finalMessage: null,
  error: null,
  tokenUsage: 0,
}

/** Разбирает одну строку `data:`. Мусор и неизвестные типы молча отбрасываем. */
function parseEvent(raw: string): AgentStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  return typeof (parsed as { type?: unknown }).type === 'string'
    ? (parsed as AgentStreamEvent)
    : null
}

/**
 * Чистая функция «событие → новое состояние». Никаких сайд-эффектов, поэтому её
 * легко покрыть тестами без рендера хука.
 */
function reduceEvent(state: AgentStreamState, event: AgentStreamEvent): AgentStreamState {
  switch (event.type) {
    case 'token':
      return { ...state, text: state.text + event.content }
    case 'reasoning':
      return { ...state, reasoning: state.reasoning + event.content }
    case 'usage':
       return { ...state, tokenUsage: (state.tokenUsage ?? 0) + event.tokenUsage }
      case 'tool_call':
      return {
        ...state,
        toolCalls: [...state.toolCalls, { node: event.node, tool: event.tool, args: event.args }],
      }
    case 'node_end':
      return { ...state, nodes: [...state.nodes, event.node] }
    case 'interrupt':
      return { ...state, status: 'interrupted', interrupt: event.interrupt }
    case 'done':
      return { ...state, status: 'done', finalMessage: event.message }
    case 'error':
      // message — текст для человека, error — машинный код. Показываем первое.
      return { ...state, status: 'error', error: event.message ?? event.error }
  }
}

/** Отмена приходит как DOMException с name === 'AbortError' — по классу её не поймать. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Читает SSE-поток агента и превращает его в состояние для UI.
 *
 * Само по себе чтение потока — это не «запрос, который вернёт ответ», а
 * последовательность событий, поэтому обычный `api.post` тут не подходит.
 */
export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(INITIAL_STATE)
  const controllerRef = useRef<AbortController | null>(null)

  // Уход со страницы должен гасить запрос: иначе fetch продолжит тянуть поток,
  // а сервер будет держать прогон живым до своего дедлайна.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setState(INITIAL_STATE)
  }, [])

  const run = useCallback(async (payload: AgentStreamPayload) => {
    // Новый запуск отменяет предыдущий: два параллельных прогона в одном UI
    // всё равно некуда рисовать.
    controllerRef.current?.abort()

    const controller = new AbortController()
    controllerRef.current = controller
    setState({ ...INITIAL_STATE, status: 'streaming' })

    try {
      let response: Response
      try {
        response = await fetch(`${API_BASE}${ENDPOINT}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (err) {
        // fetch реджектит только когда ответа НЕ было: сеть или отмена.
        throw mapFetchError(err)
      }

      // Ошибки ДО старта стрима сервер отдаёт обычным JSON — обрабатываем как в api-слое.
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw mapHttpError(response.status, body, response.headers)
      }
      if (!response.body) {
        throw new Error('Сервер вернул пустой поток')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      // Буфер нужен, потому что чанк из сети НЕ обязан совпадать с рамкой SSE:
      // `data: {...}\n\n` может приехать разорванным на две части.
      let buffer = ''

      const emitFrame = (frame: string) => {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue
          const event = parseEvent(line.slice('data:'.length).trim())
          if (event) setState(prev => reduceEvent(prev, event))
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          emitFrame(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')
        }
      }

      // Хвост без завершающего \n\n (сервер закрылся сразу после data:).
      buffer += decoder.decode()
      if (buffer.trim()) emitFrame(buffer)

      // Поток закрылся, а терминального события не было — врать про успех нельзя.
      setState(prev =>
        prev.status === 'streaming'
          ? { ...prev, status: 'error', error: 'Поток завершился, не прислав результат' }
          : prev,
      )
    } catch (err) {
      if (err instanceof CanceledError || isAbortError(err)) {
        console.log('cancel',err)
        setState(prev => ({ ...prev, status: 'canceled', error: null }))
      } else {
        setState(prev => ({ ...prev, status: 'error', error: toMessage(err) }))
      }
    } finally {
      // Только если это всё ещё НАШ контроллер: при быстром «запустить → отмена →
      // запустить» первый finally не должен обнулять ссылку на второй запрос.
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  return {
    ...state,
    isStreaming: state.status === 'streaming',
    run,
    cancel,
    reset,
  }
}
