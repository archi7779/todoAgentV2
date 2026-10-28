import type { Metadata } from 'next'
import { auth } from '@/src/auth'
import { LogoutButton } from '@/src/components/logout-button'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Agent V2',
  description: 'AI Agent',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="ru">
      <body className="flex h-dvh flex-col">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6">
          <span className="font-semibold">AI Agent V2</span>
          {session && (
            <div className="flex items-center gap-3">
              {/* Десктоп: почта и выход в строку. */}
              <span className="hidden max-w-[240px] truncate text-sm text-gray-600 sm:inline">
                {session.user.email}
              </span>
              <div className="hidden sm:block">
                <LogoutButton />
              </div>

              {/*
                Мобилка: почта и выход спрятаны под кнопку.
                Берём нативный <details>, а не useState: это работает без JS,
                не требует превращать layout (серверный компонент) в клиентский
                и не мешает рендерить внутри серверную форму с server action.
              */}
              <details className="relative sm:hidden">
                <summary className="cursor-pointer list-none rounded-full border px-3 py-1.5 text-sm text-gray-700 [&::-webkit-details-marker]:hidden">
                  Профиль
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border bg-white p-3 shadow-lg">
                  <p className="truncate text-xs text-gray-600">{session.user.email}</p>
                  <div className="mt-2">
                    <LogoutButton />
                  </div>
                </div>
              </details>
            </div>
          )}
        </header>
        {children}
      </body>
    </html>
  )
}
