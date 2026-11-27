import { twMerge } from 'tailwind-merge'

type ClassValue = string | false | null | undefined

/**
 * Join class names, skipping falsy values. Conflicting Tailwind utilities are merged so the
 * last one wins (e.g. a `size-8` override beats a component's default `size-9`).
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
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

/** "PS" for "Priya Sharma"; skips sizes like "340ml" so "Shampoo 340ml" becomes "SH". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere (for shortcut hints). */
export const modKey =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
