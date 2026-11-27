import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/components/ui/CopyButton'
import { maskSecret } from './webhookMeta'

/** Signing secret, masked until revealed. */
export function WebhookSecret({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-subtle/50 py-1 pr-1 pl-3">
      <code
        className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
        aria-label="Signing secret"
      >
        {shown ? secret : maskSecret(secret)}
      </code>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="grid size-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-foreground"
        aria-label={shown ? 'Hide signing secret' : 'Reveal signing secret'}
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <CopyButton
        value={secret}
        size="icon"
        variant="ghost"
        label="Copy signing secret"
        className="size-7"
      />
    </div>
  )
}
