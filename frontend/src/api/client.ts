import { tokenStore } from './tokenStore'
import type { TokenPair } from './types'

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '')

/** An error returned by the API ({"error": {code, message, details}}) or a network failure. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** True when the request never got a response (offline, DNS, CORS, server down). */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: object
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Attach the bearer token and refresh it on expiry (default true). */
  auth?: boolean
}

export interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

function buildUrl(path: string, query?: object): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query) as [string, QueryValue][]) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown }
    }
    if (body.error) {
      return new ApiError(
        response.status,
        body.error.code ?? 'error',
        body.error.message ?? response.statusText,
        body.error.details ?? null,
      )
    }
  } catch {
    // Not JSON (e.g. a proxy error page); fall through to a generic error.
  }
  return new ApiError(response.status, 'http_error', response.statusText || 'Request failed')
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.')
  }
}

// --- Token refresh ---------------------------------------------------------------------------

let refreshInFlight: Promise<string | null> | null = null

/**
 * Exchange the refresh token for a new pair. Concurrent callers share one request so a burst
 * of expired requests triggers a single refresh. Resolves to the new access token, or null
 * (and logs out) when the session can't be renewed.
 */
function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    const refreshToken = tokenStore.get()?.refreshToken
    if (!refreshToken) return null
    try {
      const response = await send(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!response.ok) {
        tokenStore.clear()
        return null
      }
      const pair = (await response.json()) as TokenPair
      tokenStore.set({ accessToken: pair.access_token, refreshToken: pair.refresh_token })
      return pair.access_token
    } catch {
      // Network failure: keep the session; the original request surfaces the error.
      return null
    }
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// --- Core request ------------------------------------------------------------------------------

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, query, headers = {}, signal, auth = true } = options
  const url = buildUrl(path, query)

  const doFetch = (accessToken: string | undefined) =>
    send(url, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  let response = await doFetch(tokenStore.get()?.accessToken)

  if (auth && response.status === 401) {
    const error = await parseError(response)
    if (error.code !== 'token_expired') {
      // Invalid token or deactivated user: the session is unusable.
      if (tokenStore.get()) tokenStore.clear()
      throw error
    }
    const newToken = await refreshAccessToken()
    if (!newToken) throw error
    response = await doFetch(newToken)
  }

  if (!response.ok) throw await parseError(response)

  const data = (response.status === 204 ? undefined : await response.json()) as T
  return { data, status: response.status, headers: response.headers }
}

/** Thin verb helpers that return just the parsed body. */
export const api = {
  get: <T>(path: string, query?: object, signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }).then((r) => r.data),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: (path: string) => apiRequest<void>(path, { method: 'DELETE' }).then(() => undefined),
}
