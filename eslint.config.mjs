import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig([
  // Игноры — выносим в globalIgnores, чтобы ESLint не пытался их линтить
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/generated/**',
  ]),

  // Базовые конфиги Next.js 16 (flat, без FlatCompat)
  ...nextVitals,
  ...nextTs,

  // Отключаем правила ESLint, конфликтующие с Prettier
  prettierConfig,

  // Твои кастомные правила
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])