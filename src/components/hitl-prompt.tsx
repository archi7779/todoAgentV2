'use client'

import type { ConfirmDeleteInterrupt } from '@/src/shared/contracts/hitl'

/**
 * Панель подтверждения удаления — единственный сейчас вид HITL-паузы.
 *
 * Компонент намеренно «глупый»: он не знает ни про стрим, ни про `run`, а только
 * сообщает наружу решение (`onDecision(true|false)`). Всё, что связано с
 * продолжением прогона, живёт в `AgentForm`, где есть доступ к `useAgentStream`.
 */
export function HitlPrompt({
  interrupt,
  disabled = false,
  onDecision,
}: {
  interrupt: ConfirmDeleteInterrupt
  /** Пока идёт отправка решения — блокируем кнопки от двойного клика. */
  disabled?: boolean
  onDecision: (approved: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm text-gray-900">
        Удалить задачу «{interrupt.title}»?
      </p>
      <p className="mt-1 text-xs text-gray-600">Действие необратимо — восстановить задачу будет нельзя.</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDecision(true)}
          disabled={disabled}
          className="rounded bg-red-600 px-3 py-1.5 text-sm text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Удалить
        </button>
        <button
          type="button"
          onClick={() => onDecision(false)}
          disabled={disabled}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
