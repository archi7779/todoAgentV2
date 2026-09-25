import { auth } from '@/src/auth'
import Link from 'next/link'

export default async function Home() {
  const session = await auth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">AI Agent V2</h1>

      {session ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-lg">
            Привет, <strong>{session.user.name ?? session.user.email}</strong>!
          </p>

          <div className="flex flex-col gap-1 text-sm text-gray-600">
            <p>
              <span className="font-medium">Email:</span> {session.user.email}
            </p>
            <p>
              <span className="font-medium">ID:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">{session.user.id}</code>
            </p>
            <p>
              <span className="font-medium">ID:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                у вас осталось N токенов - добавим юзеру немнога токенов, чтобы был 1 запрос а потом
                ошибка и все.
              </code>
            </p>
          </div>

          <Link
            href="/api/protected/agent"
            className="mt-3 rounded border px-4 py-2 text-sm hover:bg-gray-100"
          >
            Перейти к Агенту
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-600">Вы не авторизованы</p>
          <div className="flex gap-3">
            <Link href="/login" className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800">
              Войти
            </Link>
            <Link href="/register" className="rounded border px-4 py-2 hover:bg-gray-100">
              Зарегистрироваться
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
