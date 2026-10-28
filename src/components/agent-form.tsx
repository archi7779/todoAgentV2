'use client'

import { useEffect, useRef, useState } from 'react'
import { ChatMessage } from '@/src/components/chat-message'
import { HitlPrompt } from '@/src/components/hitl-prompt'
import { useAgentStream } from '@/src/lib/hooks/use-agent-stream'
import { useChatHistory } from '@/src/lib/hooks/use-chat-history'
import { useTokenBalance } from '@/src/lib/hooks/use-token-balance'
import type { ChatHistoryMessage } from '@/src/shared/contracts/chat-history'
import { parseInterrupt } from '@/src/shared/contracts/hitl'

export function AgentForm({ onRunFinished }: { onRunFinished?: () => void } = {}) {
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

  const listRef = useRef<HTMLDivElement | null>(null)
  // Прилипаем к низу только если пользователь уже внизу: иначе чтение истории
  // будет дёргаться на каждом новом токене.
  const stickToBottomRef = useRef(true)

  const {
    status,
    text,
    reasoning,
    toolCalls,
    finalMessage,
    error,
    interrupt,
    isStreaming,
    run,
    cancel,
  } = useAgentStream()

  const { messages, loading, error: historyError, interrupt: historyInterrupt, reload } =
    useChatHistory()
  const { balance, spentTotal, reload: reloadBalance } = useTokenBalance()

  const noTokens = balance !== null && balance <= 0

  // Пауза HITL: прогон остановлен внутри тула и ждёт решения человека.
  // Пока ждёт — ввод блокируем, иначе пользователь отправит новую реплику
  // вместо ответа на вопрос, и пауза в чекпоинтере останется висеть.
  //
  // Два источника паузы:
  //   1) стрим только что прислал `interrupt` (status === 'interrupted');
  //   2) страницу перезагрузили — пауза осталась в чекпоинтере, её отдаёт
  //      chat-history. Без этого источнника F5 «теряет» HITL, следующий
  //      запрос отправляет провайдеру историю с висящим tool_calls и падает.
  const pendingInterrupt = status === 'interrupted' ? interrupt : status === 'idle' ? historyInterrupt : null
  const hitl = parseInterrupt(pendingInterrupt)
  const paused = hitl !== null

  // Держим последнее сообщение в поле зрения, не мешая читать историю.
  useEffect(() => {
    const list = listRef.current
    if (!list || !stickToBottomRef.current) return
    list.scrollTop = list.scrollHeight
  }, [messages.length, pendingUser, text])

  // Всё, что нужно сделать после ЛЮБОГО завершения прогона: сообщить наружу
  // (панель задач), перечитать историю и баланс, затем убрать optimistic/live.
  async function finishRun(token: number) {
    // Прогон закончился (done/interrupt) — агент мог создать/изменить/удалить
    // задачу, поэтому панель задач должна перечитаться.
    onRunFinished?.()

    const ok = await reload()
    await reloadBalance()
    if (!ok || runTokenRef.current !== token) return

    setLiveVisible(false)
    setPendingUser(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || isStreaming || noTokens || paused) return

    const token = ++runTokenRef.current
    setPrompt('')
    setPendingUser(trimmed)
    setLiveVisible(true)
    stickToBottomRef.current = true

    // thread_id сервер выводит из сессии: одному пользователю соответствует
    // ровно один тред, поэтому клиенту его знать и присылать не нужно.
    await run({ message: trimmed })
    await finishRun(token)
  }

  // Ответ на HITL-паузу: продолжаем ТОТ ЖЕ прогон, а не начинаем новый.
  // `pendingUser` не выставляем — новой реплики пользователя нет.
  async function handleDecision(approved: boolean) {
    if (isStreaming || !paused) return

    const token = ++runTokenRef.current
    setLiveVisible(true)
    stickToBottomRef.current = true

    await run({ resume: { approved } })
    await finishRun(token)
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Сам чат — единственная скроллируемая область. */}
      <div
        ref={listRef}
        onScroll={(event) => {
          const el = event.currentTarget
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border bg-white p-3"
      >
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
      </div>

      {/* HITL: прогон на паузе, ждём решения человека. */}
      {hitl && (
        <HitlPrompt interrupt={hitl} disabled={isStreaming} onDecision={handleDecision} />
      )}

      {/* Форма, баланс и управление — один компактный блок снизу. */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border bg-white p-3">
        {balance !== null && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Осталось:{' '}
              <strong className="text-gray-900">{balance.toLocaleString('ru-RU')}</strong> токенов
            </span>
            <span>
              Потрачено:{' '}
              <strong className="text-gray-900">{spentTotal.toLocaleString('ru-RU')}</strong>
            </span>
          </div>
        )}

        {noTokens && (
          <p className="text-xs text-red-600">
            Баланс исчерпан — пополните токены, чтобы отправить сообщение.
          </p>
        )}

        <textarea
          value={prompt}
          disabled={paused}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            // Enter отправляет, Shift+Enter — перенос строки (как в чатах).
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (isStreaming || noTokens || prompt.trim().length === 0) return
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={2}
          placeholder={paused ? 'Сначала ответьте на вопрос выше' : 'Например: напомни купить хлеб'}
          className="resize-none rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-50 disabled:text-gray-400"
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isStreaming || noTokens || paused || prompt.trim().length === 0}
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
              status === 'canceled' && 'Отменено',
              status === 'error' && 'Прервано из-за ошибки',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>

        {error && <p className="rounded bg-red-100 p-2 text-xs text-red-700">{error}</p>}
      </form>
    </div>
  )
}
