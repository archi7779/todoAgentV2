import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma' // Импортируйте ваш Prisma Client
import { logger } from './lib/logger'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' }, // Рекомендуется для Credentials [citation:4][citation:13]
  callbacks: {
    async jwt({ token, user }) {
      // user присутствует только при первом входе
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      logger.info({ userId: user.id, email: user.email, isNewUser }, '← вход выполнен')
    },
    async signOut(message) {
      const userId = 'token' in message ? message.token?.id : undefined
      logger.info({ userId }, '← выход выполнен')
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password

        // Проверка типа в рантайме — после неё email и password точно string
        if (typeof email !== 'string' || typeof password !== 'string') return null

        // Дополнительно отсеиваем пустые строки
        if (email.length === 0 || password.length === 0) return null

        const user = await prisma.user.findUnique({
          where: { email }, // ← чистая string, без as
        })

        if (!user || !user.password) return null

        const passwordsMatch = await bcrypt.compare(password, user.password) // ← без as

        return passwordsMatch ? user : null
      },
    }),
  ],
})
