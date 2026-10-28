import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/auth";
import { prisma } from "@/src/lib/prisma";
import { AppError } from "@/src/shared/contracts/error";
import { toAppError } from "@/src/lib/server/to-app-error";
import { logger } from "@/src/lib/logger";
import { setRequestUserId, withRequestContext } from "@/src/lib/logger/with-req-context";
import type { TokenBalanceResponse } from "@/src/shared/contracts/token-balance";

export const runtime = "nodejs";

/**
 * Баланс и суммарный расход токенов текущего пользователя.
 *
 * Два источника: быстрый счётчик в User (остаток) и журнал TokenUsage (сколько
 * потрачено). Считаем их в одном запросе, чтобы цифры на UI были согласованы.
 */
export async function GET(req: NextRequest) {
  return withRequestContext(req, () => handleGetTokenBalance());
}

async function handleGetTokenBalance() {
  const log = logger.child({ route: "/api/protected/token-balance" });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(401, "UNAUTHORIZED", "Требуется авторизация");
    }
    setRequestUserId(session.user.id);

    const userId = session.user.id;

    const [user, usage] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
      }),
      prisma.tokenUsage.aggregate({
        where: { userId },
        _sum: { totalTokens: true },
      }),
    ]);

    const payload: TokenBalanceResponse = {
      balance: user?.tokenBalance ?? 0,
      spentTotal: usage._sum.totalTokens ?? 0,
    };

    log.info(payload, "token-balance: баланс прочитан");

    return NextResponse.json(payload);
  } catch (err) {
    const appError = toAppError(err);
    log.error({ err, code: appError.code }, "token-balance: не удалось прочитать баланс");
    return NextResponse.json(appError.toResponse(), { status: appError.status });
  }
}
