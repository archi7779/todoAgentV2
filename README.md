Agent-todo-v2
Фокус на систем архиктектуру.

25.09.2026 -
Создал апи сервис(Фетч + абортКонтроллер с таймаутом) и парсер ошибок, теперь все ошибки мы
а. Создаем на беке через new AppError(status: number, code: string, message: string, details?: unknown)
б. ловим на фронте Серверные ошибки mapHttpError(status: number, payload: unknown): ApiError
Сетевые ошибки mapFetchError(error: unknown)
Превращаем их автоматически в определнный тип
ApiError,
UnauthorizedError,
ForbiddenError,
NotFoundError,
ValidationError,
RateLimitError,
NetworkError,
CanceledError,
И дальше как-то как нам надо обрабатываем.

28.09.26
Сделал Логер для Апи и логер для Агента(кастомизирую когда буду делать самого агента)

30.09.26

Сделал логику авторизации(постгря + призма + jwt стратегия), страницу логина и миддлВарю для защиты роутов. Кнопка выхода (signOut). Форма /register с полями email, password, name.

Слеудющий шаг =

Деплой Вариант 1 (Рекомендую): Vercel + Neon (PostgreSQL) Вариант 2: Всё на Render.com + (Vercel или Render сами слушают ветку)
ИЛИ
Начать агента
