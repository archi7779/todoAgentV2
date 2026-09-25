import { prisma } from '@/src/lib/prisma'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { registerSchema } from '@/src/lib/validations/auth'
import { logger } from '@/src/lib/logger'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error

  async function handleRegister(formData: FormData) {
    'use server'

    const log = logger.child({ action: 'register' })

    // 1. Валидация через Zod
    const parsed = registerSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      log.warn({ error: firstError.message }, 'ошибка валидации')
      redirect(`/register?error=validation`)
    }

    const { email, password } = parsed.data

    // 2. Проверка, что email не занят
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      log.warn({ email }, 'email уже занят')
      redirect('/register?error=exists')
    }

    // 3. Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10)

    // 4. Создание пользователя (name = null, заполнит в профиле)
    try {
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
        },
      })

      log.info({ userId: user.id, email }, 'пользователь создан')
    } catch (err) {
      log.error({ err, email }, 'ошибка создания пользователя')
      redirect('/register?error=server')
    }

    // 5. Редирект на логин с флагом успеха
    redirect('/login?registered=1')
  }

  const errorMessages: Record<string, string> = {
    validation: 'Проверьте правильность заполнения полей',
    exists: 'Пользователь с таким email уже существует',
    server: 'Что-то пошло не так. Попробуйте ещё раз',
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        action={handleRegister}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Регистрация</h1>

        {error && errorMessages[error] && (
          <p className="rounded bg-red-100 p-2 text-sm text-red-700">{errorMessages[error]}</p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Пароль</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={6}
            maxLength={24}
            className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
          />
          <span className="text-xs text-gray-500">От 6 до 24 символов</span>
        </label>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white transition hover:bg-gray-800"
        >
          Зарегистрироваться
        </button>

        <p className="text-center text-sm text-gray-600">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="underline">
            Войти
          </Link>
        </p>
      </form>
    </div>
  )
}
