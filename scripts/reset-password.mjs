/**
 * Сброс пароля пользователя (не «восстановление» — bcrypt необратим).
 *
 * Использование:
 *   npm run user:reset-password -- you@example.com
 *
 * Пароль спрашивается интерактивно и не эхоится. Скрипт обновляет только
 * `User.password` (новый bcrypt-хеш с cost 12) и проверяет, что хеш сходится.
 * Сообщения, треды и остальные данные пользователя не трогаются.
 */
import readline from "node:readline";
import bcrypt from "bcryptjs";
import pg from "pg";

const BCRYPT_COST = 12;

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Не эхоим ввод в терминал.
    rl._writeToOutput = () => {};

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });

    rl.on("SIGINT", () => {
      rl.close();
      reject(new Error("Отменено"));
    });
  });
}

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Использование: npm run user:reset-password -- user@example.com");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан (ожидается в .env или в окружении)");
  process.exit(1);
}

let password;
try {
  password = await promptHidden(`Новый пароль для ${email}: `);
} catch {
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("Пароль должен быть не короче 8 символов");
  process.exit(1);
}

const hash = await bcrypt.hash(password, BCRYPT_COST);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(
    'UPDATE "User" SET password = $1 WHERE email = $2 RETURNING id, email',
    [hash, email],
  );

  if (result.rowCount === 0) {
    console.error(`Пользователь с email ${email} не найден`);
    process.exitCode = 1;
  } else {
    const ok = await bcrypt.compare(password, hash);
    console.log(`OK: пароль обновлён для ${result.rows[0].email} (проверка хеша: ${ok ? "успешно" : "ОШИБКА"})`);
  }
} finally {
  // Иначе процесс не завершится из-за открытого пула.
  await pool.end();
}
