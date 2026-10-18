'use client'

import { useEffect, useRef, useState } from 'react'
import { ChatMessage } from '@/src/components/chat-message'
import { useAgentStream } from '@/src/lib/hooks/use-agent-stream'
import { useChatHistory } from '@/src/lib/hooks/use-chat-history'
import type { ChatHistoryMessage } from '@/src/shared/contracts/chat-history'

export function AgentForm() {
  const [prompt, setPrompt] = useState('')
  // Оптимистичное сообщение пользователя: чекпоинт запишется не мгновенно,
  // но исчезать из UI на время стрима сообщение не должно.
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  // Live-ответ показываем, пока сервер не подтвердил историю. Это state, а не
  // ref: значение участвует в рендере, а refs читать в рендере нельзя.
  const [liveVisible, setLiveVisible] = useState(false)

  // Токен прогона: защищает от того, что запоздавший reload первого прогона
  // уберёт live-пузырь второго.
  const runTokenRef = useRef(0)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const {
    status,
    text,
    reasoning,
    toolCalls,
    finalMessage,
    error,
    isStreaming,
    run,
    cancel,
    tokenUsage,
  } = useAgentStream()

  const { messages, loading, error: historyError, reload } = useChatHistory()

  // Держим последнее сообщение в поле зрения.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pendingUser, text])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || isStreaming) return

    const token = ++runTokenRef.current
    setPrompt('')
    setPendingUser(trimmed)
    setLiveVisible(true)

    // thread_id сервер выводит из сессии: одному пользователю соответствует
    // ровно один тред, поэтому клиенту его знать и присылать не нужно.
    await run({ message: trimmed })

    // Стрим закрылся (done/interrupt/error/canceled) — чекпоинт уже записан.
    // Перечитываем историю и только после успеха убираем optimistic/live.
    const ok = await reload()
    if (!ok || runTokenRef.current !== token) return

    setLiveVisible(false)
    setPendingUser(null)
  }

  const liveContent = text || finalMessage || ''
  const showLive = liveVisible

  const liveMessage: ChatHistoryMessage | null = showLive
    ? {
        id: 'live',
        role: 'assistant',
        content: liveContent,
        reasoning: reasoning || undefined,
        toolCalls:
          toolCalls.length > 0
            ? toolCalls.map((call) => ({ id: null, name: call.tool, args: call.args }))
            : undefined,
      }
    : null

  const isEmpty = !loading && messages.length === 0 && !pendingUser && !liveMessage

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {loading && <p className="text-sm text-gray-500">Загружаю историю…</p>}

        {historyError && (
          <p className="rounded bg-red-100 p-2 text-sm text-red-700">{historyError}</p>
        )}

        {isEmpty && (
          <p className="text-sm text-gray-500">
            Истории пока нет. Задайте первый вопрос — дальше она будет храниться в базе.
          </p>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {pendingUser && (
          <ChatMessage message={{ id: 'pending', role: 'user', content: pendingUser }} />
        )}

        {liveMessage && <ChatMessage message={liveMessage} />}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            // Enter отправляет, Shift+Enter — перенос строки (как в чатах).
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={2}
          placeholder="Например: придумай название для кофейни"
          className="resize-none rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isStreaming || prompt.trim().length === 0}
            className="rounded bg-black px-4 py-2 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStreaming ? 'Думаю…' : 'Отправить'}
          </button>

          {isStreaming && (
            <button
              type="button"
              onClick={cancel}
              className="rounded border px-4 py-2 transition hover:bg-gray-100"
            >
              Отменить
            </button>
          )}

          <span className="text-xs text-gray-500">
            {[
              status === 'streaming' && 'Думаю…',
              status === 'done' && `Готово · токенов: ${tokenUsage}`,
              status === 'canceled' && 'Отменено',
              status === 'error' && 'Прервано из-за ошибки',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>

        {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      </form>
    </div>
  )
}
