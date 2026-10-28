import "server-only";

import { prisma } from "@/src/lib/prisma";
import { InsufficientTokensError } from "./errors";

export type ChargeTokensInput = {
  userId: string;
  threadId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/**
 * Ранняя проверка перед стартом прогона. Не заменяет атомарное списание:
 * между проверкой и вызовом модели баланс может измениться. Нужна, чтобы
 * не открывать SSE и не тратить вызов модели, если баланс уже нулевой.
 */
export async function assertHasTokens(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });

  if (!user) {
    // Пользователь удалён между auth() и запросом — это не биллинг-ошибка.
    throw new Error(`Пользователь ${userId} не найден`);
  }

  if (user.tokenBalance <= 0) {
    throw new InsufficientTokensError(0, user.tokenBalance);
  }

  return user.tokenBalance;
}

/**
 * Атомарное списание полной стоимости вызова + запись в журнал в одной
 * транзакции.
 *
 * Баланс МОЖЕТ уйти в минус — это осознанно. Провайдер уже сгенерировал токены
 * и выставит счёт, поэтому расход нельзя «не записать». Отрицательный баланс
 * означает долг: новый прогон заблокирует `assertHasTokens` на входе.
 *
 * `decrement` — один атомарный `UPDATE`, поэтому параллельные списания не
 * теряют друг друга.
 */
export async function chargeTokens(input: ChargeTokensInput): Promise<void> {
  const total = Math.max(0, Math.trunc(input.totalTokens));
  if (total === 0) return;

  const inputTokens = Math.max(0, Math.trunc(input.inputTokens));
  const outputTokens = Math.max(0, Math.trunc(input.outputTokens));

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { tokenBalance: { decrement: total } },
    });

    await tx.tokenUsage.create({
      data: {
        userId: input.userId,
        threadId: input.threadId ?? null,
        model: input.model,
        inputTokens,
        outputTokens,
        totalTokens: total,
      },
    });
  });
}
