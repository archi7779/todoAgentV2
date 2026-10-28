/**
 * Контракт ручки баланса токенов (GET /api/protected/token-balance).
 *
 * `balance` — текущий остаток из User.tokenBalance.
 * `spentTotal` — сумма всех списаний из журнала TokenUsage (за всё время).
 * Welcome-бонус в журнал не пишется, поэтому spentTotal — это именно расход.
 */
export type TokenBalanceResponse = {
  balance: number;
  spentTotal: number;
};
