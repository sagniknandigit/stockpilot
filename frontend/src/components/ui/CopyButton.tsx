import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './Button'
import type { ButtonSize, ButtonVariant } from './buttonStyles'
import { toast } from './toast'

interface CopyButtonProps {
  value: string
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export function CopyButton({
  value,
  label = 'Copy',
  variant = 'secondary',
  size = 'sm',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      toast.error('Couldn’t copy', 'Select the text and copy it manually.')
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={copy}
      className={className}
      aria-label={size === 'icon' ? label : undefined}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {size !== 'icon' && (copied ? 'Copied' : label)}
    </Button>
  )
}
