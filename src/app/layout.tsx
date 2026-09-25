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
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="font-semibold">AI Agent V2</span>
          {session && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{session.user.email}</span>
              <LogoutButton />
            </div>
          )}
        </header>
        {children}
      </body>
    </html>
  )
}
