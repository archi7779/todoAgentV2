import "server-only";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { logger } from "@/src/lib/logger";
import { ConfigurationError } from "../errors";

/**
 * Схема для таблиц LangGraph в ТОЙ ЖЕ базе, что и Prisma.
 *
 * Отдельная схема — не косметика: Prisma считает `public` своей территорией,
 * а `prisma migrate dev` сравнивает БД с историей миграций. Чужие таблицы в
 * `public` он видит как drift и при генерации миграции может попытаться их
 * удалить. `langgraph.checkpoints` и т.д. для него невидимы.
 *
 * `setup()` создаёт схему сам (`CREATE SCHEMA IF NOT EXISTS`), поэтому в dev
 * ничего руками делать не нужно. В проде достаточно права CREATE на БД —
 * либо создать схему заранее миграцией.
 */
const SCHEMA = "langgraph";

type CheckpointerState = {
  /** Промис «савер создан + setup() прошёл». Кэшируется на процесс. */
  ready?: Promise<PostgresSaver>;
};

/**
 * Кэш в globalThis, а не в модуле: в dev Turbopack пересоздаёт модули при
 * HMR, и обычная модульная переменная дала бы новый `pg.Pool` на каждую
 * перезагрузку, оставляя старые соединения висеть.
 */
const globalForCheckpointer = globalThis as unknown as {
  __langgraphCheckpointer?: CheckpointerState;
};

const state: CheckpointerState = (globalForCheckpointer.__langgraphCheckpointer ??= {});

/**
 * Единственный экземпляр PostgresSaver на процесс.
 *
 * Первый вызов создаёт пул, прогоняет `setup()` (таблицы + миграции схемы
 * LangGraph) и запоминает результат. Последующие вызовы получают тот же
 * промис: DDL не выполняется на каждый запрос.
 */
export function getCheckpointer(): Promise<PostgresSaver> {
  if (!state.ready) {
    state.ready = createCheckpointer().catch((err) => {
      // Не кэшируем неудачу: следующий запрос попробует подключиться снова.
      state.ready = undefined;
      throw err;
    });
  }
  return state.ready;
}

async function createCheckpointer(): Promise<PostgresSaver> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ConfigurationError(
      "DATABASE_URL не задан: checkpointer не может подключиться к Postgres",
    );
  }

  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: SCHEMA,
  });

  try {
    // Идемпотентно: создаёт схему/таблицы, если их нет, и добивает недостающие
    // миграции по `checkpoint_migrations`. Вызывать нужно РОВНО один раз на
    // процесс: параллельный setup() из нескольких процессов может упасть на
    // конфликте версий миграций.
    await checkpointer.setup();
  } catch (err) {
    // Пул уже создан — закрываем, чтобы не течь соединениями при ретрае.
    await checkpointer.end().catch(() => {});
    throw err;
  }

  logger.info({ tool: "agent", schema: SCHEMA }, "LangGraph checkpointer готов");

  return checkpointer;
}
