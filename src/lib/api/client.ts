import { mapFetchError, mapHttpError } from './errorParser'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

type RequestOptions = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] }
  timeout?: number
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = 10_000, headers, signal: externalSignal, ...rest } = options

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const controller = new AbortController()

  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  const signal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal

  let response: Response
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal,
    })
  } catch (error) {
    throw mapFetchError(error, timedOut ? { timedOut: true, timeout } : undefined)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = mapHttpError(response.status, payload, response.headers)

    if (error.status >= 500 || error.code === 'UNKNOWN') {
      // Логируем ТОЛЬКО неожиданные ошибки:
      //ТУТ ЛОГИРОВАНИЕ ОШИБОК КОТОРЫХ БЫТЬ НЕ ДОЛЖНО ПО ХОРОШЕМУ
    }

    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(url: string, options?: RequestOptions) => request<T>(url, { ...options, method: 'GET' }),

  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' }),
}
