type ClassValue = string | false | null | undefined

/** Join class names, skipping falsy values. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Short, human-friendly prefix of a UUID (e.g. for references in tables). */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/** Read a JSON value from localStorage, tolerating missing keys, bad JSON and disabled storage. */
export function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode, quota); the app still works without it.
  }
}

/**
 * Random key for the Idempotency-Key header. crypto.randomUUID() needs a secure context
 * (https or localhost); fall back to getRandomValues elsewhere.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
