import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Renders assistant markdown. `marked` + DOMPurify are loaded on first use so they stay out
 * of the main bundle; until then the raw text is shown. Output is always sanitized.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([import('marked'), import('dompurify')]).then(
      ([{ marked }, { default: DOMPurify }]) => {
        const raw = marked.parse(source, { gfm: true, breaks: true, async: false })
        if (!cancelled) setHtml(DOMPurify.sanitize(raw))
      },
    )
    return () => {
      cancelled = true
    }
  }, [source])

  if (html === null) return <p className={cn('whitespace-pre-wrap', className)}>{source}</p>
  return <div className={cn('markdown', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
