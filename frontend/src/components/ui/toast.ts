import { useSyncExternalStore } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  variant: ToastVariant
  title: string
  description?: string
}

type Listener = () => void

const DURATION_MS = 4500
let nextId = 1
let toasts: ToastItem[] = []
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((listener) => listener())
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(variant: ToastVariant, title: string, description?: string) {
  const id = nextId++
  // Keep the stack short; the oldest toast makes room.
  toasts = [...toasts.slice(-2), { id, variant, title, description }]
  emit()
  window.setTimeout(() => dismiss(id), DURATION_MS)
}

/**
 * A tiny global toast store. Being framework-agnostic lets non-component code (like the
 * React Query mutation cache) raise toasts without prop drilling or context.
 */
export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  error: (title: string, description?: string) => push('error', title, description),
  info: (title: string, description?: string) => push('info', title, description),
  dismiss,
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => toasts)
}
