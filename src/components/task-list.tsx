'use client'

import { useEffect, useRef, useState } from 'react'
import { useTasks } from '@/src/lib/hooks/use-tasks'
import type { TaskStatus } from '@/src/generated/prisma/enums'
import type { TaskListItem } from '@/src/shared/contracts/tasks'

/**
 * Панель задач рядом с чатом.
 *
 * Зачем она вообще нужна: без неё единственный способ проверить, что агент
 * реально что-то сделал, — открыть Prisma Studio. С панелью видно сразу и
 * живьём, и заодно это первый «не-чат» потребитель того же сервиса.
 *
 * Данные только читаются: все изменения идут через агента (v1). Поэтому здесь
 * нет кнопок edit/delete — иначе пришлось бы решать конфликт «человек поменял
 * в UI, агент поменял в чате».
 */

type Filter = TaskStatus | undefined

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'Все', value: undefined },
  { label: 'К выполнению', value: 'TODO' },
  { label: 'В работе', value: 'IN_PROGRESS' },
  { label: 'Готово', value: 'DONE' },
]

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'к выполнению',
  IN_PROGRESS: 'в работе',
  DONE: 'готово',
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  TODO: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  DONE: 'bg-green-50 text-green-700',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TaskRow({ task }: { task: TaskListItem }) {
  const done = task.status === 'DONE'

  return (
    <li className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{formatDate(task.createdAt)}</p>
      </div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_CLASS[task.status]}`}>
        {STATUS_LABEL[task.status]}
      </span>
    </li>
  )
}

export function TaskList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [filter, setFilter] = useState<Filter>(undefined)
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')

  const { tasks, loading, error, refresh } = useTasks({ status: filter, sort })

  // refreshKey меняет родитель, когда прогон агента закончился (done/interrupt).
  // Первый запуск пропускаем: начальную загрузку уже сделал сам хук.
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    refresh()
  }, [refreshKey, refresh])

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          Задачи{!loading && !error ? ` · ${tasks.length}` : ''}
        </h2>
        <button
          type="button"
          onClick={() => setSort((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          title="Порядок по дате создания"
        >
          {sort === 'desc' ? 'Сначала новые' : 'Сначала старые'}
        </button>
      </header>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map(({ label, value }) => {
          const active = filter === value
          return (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading && <p className="py-4 text-sm text-gray-500">Загружаю…</p>}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 rounded border border-red-300 px-2 py-1 text-xs hover:bg-red-100"
          >
            Повторить
          </button>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <p className="py-4 text-sm text-gray-500">
          {filter ? 'В этой колонке пока пусто.' : 'Задач пока нет — попроси агента создать.'}
        </p>
      )}

      {!loading && !error && tasks.length > 0 && (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </section>
  )
}
