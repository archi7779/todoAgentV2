/**
 * Полезные нагрузки `interrupt()` — то, что граф отдаёт клиенту в паузе HITL.
 *
 * `interrupt` в SSE-контракте типизирован как `unknown` намеренно: граф не знает
 * про домены приложения. Здесь мы сужаем его до конкретных форм — и делаем это
 * через type guard, а не приведением типа. Причина: payload приходит по сети и
 * со временем получит новые варианты; `as` уронил бы UI на первом же из них,
 * guard просто не покажет незнакомую панель.
 */

/** Подтверждение удаления: спрашиваем перед необратимым действием. */
export type ConfirmDeleteInterrupt = {
  type: "confirm_delete";
  taskId: string;
  title: string;
  status?: string;
};

/** Все известные виды пауз. Новый вид — новый член union + ветка в `parseInterrupt`. */
export type InterruptPayload = ConfirmDeleteInterrupt;

export function isConfirmDelete(value: unknown): value is ConfirmDeleteInterrupt {
  if (typeof value !== "object" || value === null) return false;

  const payload = value as Record<string, unknown>;
  return (
    payload.type === "confirm_delete" &&
    typeof payload.taskId === "string" &&
    typeof payload.title === "string"
  );
}

/**
 * Приводит `unknown` из SSE к известному виду или к `null`.
 *
 * `null` = «пауза есть, но этот клиент её не понимает» (например, старый фронт
 * после добавления нового типа). Это не ошибка: панель просто не рендерим.
 */
export function parseInterrupt(value: unknown): InterruptPayload | null {
  if (isConfirmDelete(value)) return value;
  return null;
}
