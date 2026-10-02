'use client'

import { useRef, useState } from 'react'
import { api } from '@/src/lib/api/client'
import { CanceledError } from '@/src/lib/api/errors'
import { toMessage } from '@/src/lib/api/to-message'

type AgentResponse = {
  text: string
  model: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

export function AgentForm() {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<AgentResponse | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || isLoading) return

    const controller = new AbortController()
    controllerRef.current = controller

    setIsLoading(true)
    setError(null)
    setAnswer(null)

    try {
      // таймаут больше дефолтных 10с из клиента — LLM отвечает медленно
      const res = await api.post<AgentResponse>(
        '/api/protected/agent',
        { prompt: trimmed },
        { timeout: 60_000, signal: controller.signal },
      )
      setAnswer(res)
    } catch (err) {
      // отмена — это НЕ ошибка: молча выходим, ничего не показываем
      if (!(err instanceof CanceledError)) {
        setError(toMessage(err))
      }
    } finally {
      // Только если это всё ещё НАШ контроллер: при быстром «отправить → отмена
      // → отправить» первый finally может прийти, когда ref уже указывает на
      // второй запрос — тогда его нельзя обнулять и гасить загрузку.
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setIsLoading(false)
      }
    }
  }

  function handleCancel() {
    controllerRef.current?.abort()
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Запрос</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Например: придумай название для кофейни"
            className="resize-none rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </label>

        <div className="flex gap-3 self-start">
          <button
            type="submit"
            disabled={isLoading || prompt.trim().length === 0}
            className="rounded bg-black px-4 py-2 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Думаю…' : 'Отправить'}
          </button>

          {isLoading && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border px-4 py-2 transition hover:bg-gray-100"
            >
              Отменить
            </button>
          )}
        </div>
      </form>

      {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      {answer && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="whitespace-pre-wrap">{answer.text}</p>
          <p className="mt-3 text-xs text-gray-500">
            {answer.model}
            {answer.usage?.outputTokens !== undefined &&
              ` · ${answer.usage.outputTokens} токенов на выходе`}
          </p>
        </div>
      )}
    </div>
  )
}
