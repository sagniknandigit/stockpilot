import { API_BASE_URL } from '@/api/client'

/** Absolute API base for copy-paste snippets (the app may call it via a relative proxy path). */
export function absoluteApiBase(): string {
  return API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`
}

/** Interactive OpenAPI docs served by the backend. */
export function docsUrl(): string {
  return `${new URL(absoluteApiBase()).origin}/docs`
}
