// src/app/login/page.tsx
import { signIn } from '@/src/auth'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    callbackUrl?: string
    registered?: string
  }>
}) {
  const params = await searchParams
  const hasError = params.error === 'credentials'
  const justRegistered = params.registered === '1'
  const callbackUrl = params.callbackUrl ?? '/'

  async function handleLogin(formData: FormData) {
    'use server'

    try {
      await signIn('credentials', {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        redirectTo: callbackUrl,
      })
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/login?error=credentials&callbackUrl=${encodeURIComponent(callbackUrl)}`)
      }
      throw error
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        action={handleLogin}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Вход</h1>

        {justRegistered && (
          <p className="rounded bg-green-100 p-2 text-sm text-green-700">
            Аккаунт создан! Войдите, чтобы продолжить.
          </p>
        )}

        {hasError && (
          <p className="rounded bg-red-100 p-2 text-sm text-red-700">Неверный email или пароль</p>
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
            autoComplete="current-password"
            className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </label>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white transition hover:bg-gray-800"
        >
          Войти
        </button>

        <p className="text-center text-sm text-gray-600">
          Нет аккаунта?{' '}
          <Link href="/register" className="underline">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  )
}
