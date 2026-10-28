'use client'

import { useState } from 'react'
import { AgentForm } from '@/src/components/agent-form'
import { TaskList } from '@/src/components/task-list'

/**
 * Рабочая область: чат + панель задач.
 *
 * Появился потому, что `page.tsx` — серверный компонент и не может держать
 * состояние. Здесь живёт единственная связь между панелями: когда прогон
 * агента закончился (`done`/`interrupt`), список задач перечитывается.
 *
 * Альтернатива — тащить `refresh` в AgentForm — хуже: форма начала бы знать
 * про задачи, хотя её дело только отправить сообщение.
 */
export function AgentWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0)
  // На мобиле панель задач — выезжающий лист снизу; на десктопе кнопки нет,
  // панель всегда справа. Состояние одно на оба режима (см. классы ниже).
  const [tasksOpen, setTasksOpen] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Мобильная шапка: единственное место, откуда открывается панель. */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <span className="text-sm font-semibold text-gray-900">Чат</span>
        <button
          type="button"
          onClick={() => setTasksOpen(true)}
          className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
        >
          Задачи
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Чат: колонка фиксированной высоты, скролл внутри AgentForm. */}
        <div className="flex min-h-0 flex-col">
          <AgentForm onRunFinished={() => setRefreshKey((key) => key + 1)} />
        </div>

        {/*
          Панель задач — ОДИН экземпляр на оба режима, чтобы не было двух
          параллельных запросов и двух независимых фильтров.
          На мобиле: `fixed` лист снизу (по умолчанию `hidden`).
          На lg:        `static` колонка справа (`lg:flex` перебивает `hidden`,
                        `lg:static` перебивает `fixed`).
        */}
        <aside
          className={[
            'min-h-0 flex-col overflow-hidden border bg-white',
            'lg:static lg:flex lg:max-h-none lg:rounded-lg lg:border-gray-200 lg:p-3 lg:shadow-none',
            tasksOpen
              ? 'fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] rounded-t-2xl border-gray-200 p-4 shadow-2xl'
              : 'hidden',
          ].join(' ')}
        >
          {/* Шапка листа — только на мобиле: закрыть и убрать его с глаз. */}
          <div className="mb-2 flex items-center justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setTasksOpen(false)}
              className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              Закрыть
            </button>
          </div>

          <TaskList refreshKey={refreshKey} />
        </aside>
      </div>

      {/* Затемнение под листом: клик по нему закрывает панель. */}
      {tasksOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setTasksOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
