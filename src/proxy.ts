import { auth } from '@/src/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { nextUrl } = req

  const isAuthPage = nextUrl.pathname === '/login' || nextUrl.pathname === '/register'

  const isProtectedApi = nextUrl.pathname.startsWith('/api/protected')

  // 1. Залогинен и на странице логина/регистрации → на главную
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/', nextUrl))
  }

  // 2. Защищённый API без логина → 401 JSON (НЕ редирект)
  if (isProtectedApi && !isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
