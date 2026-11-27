import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { cn } from '@/lib/utils'

const PYTHON = `import hmac, hashlib

def verify(secret: str, header: str, raw_body: bytes) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    signed = f"{parts['t']}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])`

const NODE = `import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(secret, header, rawBody) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  const expected = createHmac('sha256', secret).update(\`\${parts.t}.\${rawBody}\`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}`

/** Collapsible help: how receivers verify the X-StockPilot-Signature header. */
export function SignatureHelp() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<'python' | 'node'>('python')

  return (
    <div className="rounded-2xl border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-foreground">Verifying signatures</span>
          <span className="block text-[13px] text-muted">
            Check every delivery really came from StockPilot.
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-3 border-t px-5 pt-4 pb-5 text-[13px] text-muted">
          <p>Each request carries this header, signed with the endpoint’s secret:</p>
          <CodeBlock
            code={'X-StockPilot-Signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<raw body>")>'}
          />
          <p>
            Recompute the HMAC over the <em>raw</em> request body, compare in constant time, and
            reject timestamps older than a few minutes to stop replays.
          </p>
          <div
            role="radiogroup"
            aria-label="Language"
            className="flex w-fit rounded-lg border bg-subtle p-0.5"
          >
            {(['python', 'node'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={lang === value}
                onClick={() => setLang(value)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium',
                  lang === value
                    ? 'bg-surface text-foreground shadow-card'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {value === 'python' ? 'Python' : 'Node.js'}
              </button>
            ))}
          </div>
          <CodeBlock code={lang === 'python' ? PYTHON : NODE} />
        </div>
      )}
    </div>
  )
}
