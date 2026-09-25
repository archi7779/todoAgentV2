import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Неверный формат email').toLowerCase().trim(),
  password: z
    .string()
    .min(6, 'Пароль должен быть не короче 6  символов')
    .max(24, 'Пароль слишком длинный'),
})

export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.string().email('Неверный формат email').toLowerCase().trim(),
  password: z.string().min(1, 'Введите пароль'),
})

export type LoginInput = z.infer<typeof loginSchema>

// Схема для профиля (пригодится позже)
export const profileSchema = z.object({
  name: z
    .string()
    .min(2, 'Имя должно быть не короче 2 символов')
    .max(50, 'Имя слишком длинное')
    .trim(),
})

export type ProfileInput = z.infer<typeof profileSchema>
