import { readStorage, writeStorage } from '@/lib/utils'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
}

const STORAGE_KEY = 'stockpilot.tokens'

type Listener = (tokens: StoredTokens | null) => void

let tokens: StoredTokens | null = readStorage<StoredTokens>(STORAGE_KEY)
const listeners = new Set<Listener>()

/**
 * Single source of truth for the JWT pair. The API client reads/rotates tokens here,
 * and the AuthProvider subscribes so that a failed refresh logs the user out of the UI.
 */
export const tokenStore = {
  get(): StoredTokens | null {
    return tokens
  },
  set(next: StoredTokens | null): void {
    tokens = next
    writeStorage(STORAGE_KEY, next)
    listeners.forEach((listener) => listener(next))
  },
  clear(): void {
    tokenStore.set(null)
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
