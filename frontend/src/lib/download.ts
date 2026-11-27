import type { DownloadedFile } from '@/api/client'

/** Save a downloaded blob with the given (or fallback) file name. */
export function saveFile({ blob, filename }: DownloadedFile, fallbackName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename ?? fallbackName
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open a blob (e.g. a PDF) in a new tab. `target` is opened synchronously to avoid popup blockers. */
export function openFileIn(target: Window | null, { blob }: DownloadedFile): void {
  const url = URL.createObjectURL(blob)
  if (target) target.location.href = url
  else window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
