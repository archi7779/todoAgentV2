/**
 * Доменная ошибка биллинга. Не `AppError`: этот слой не знает про HTTP.
 * Роут переводит её в 402 через `toAppError`.
 */
export class InsufficientTokensError extends Error {
  readonly code = "INSUFFICIENT_TOKENS";

  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super("Закончились токены. Пополните баланс, чтобы продолжить.");
    this.name = "InsufficientTokensError";
  }
}
