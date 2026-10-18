import type { ChatHistoryMessage } from '@/src/shared/contracts/chat-history'

/**
 * Один пузырь чата. Рендерит и историю с сервера, и live-ответ во время стрима.
 *
 * system-сообщения не показываем: это внутренняя кухня графа, пользователю они
 * не нужны. tool-результаты — сворачиваемый блок, а не реплика.
 */
export function ChatMessage({ message }: { message: ChatHistoryMessage }) {
  if (message.role === 'system') return null

  if (message.role === 'tool') {
    return (
      <details className="rounded border bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <summary className="cursor-pointer select-none">
          Результат инструмента{message.toolName ? `: ${message.toolName}` : ''}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words">{message.content}</pre>
      </details>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser ? 'bg-black text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.reasoning && (
          <details className="mb-2 text-xs opacity-70">
            <summary className="cursor-pointer select-none">Размышления</summary>
            <p className="mt-1 whitespace-pre-wrap">{message.reasoning}</p>
          </details>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <ul className="mb-2 flex flex-col gap-1 text-xs opacity-70">
            {message.toolCalls.map((call, index) => (
              <li key={call.id ?? `${call.name}-${index}`}>→ {call.name}</li>
            ))}
          </ul>
        )}

        {message.content ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          // Пустой assistant-пузырь — это либо стрим, который ещё не прислал
          // текст, либо сообщение, состоящее только из tool_calls.
          <p className="opacity-60">…</p>
        )}
      </div>
    </div>
  )
}
