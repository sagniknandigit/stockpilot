import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const controlStyles =
  'w-full rounded-lg border bg-surface px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/20'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlStyles, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlStyles, 'min-h-20 py-2', className)} {...props} />
}
