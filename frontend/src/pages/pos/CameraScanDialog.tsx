import { CameraOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Spinner'
import { startBarcodeScanner, type ScannerEngine } from '@/lib/barcodeScanner'

interface CameraScanDialogProps {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}

export function CameraScanDialog({ open, onClose, onDetected }: CameraScanDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Scan with camera"
      description="Point the camera at a barcode."
    >
      <CameraScanner onDetected={onDetected} onClose={onClose} />
    </Dialog>
  )
}

type Status =
  | { state: 'starting' }
  | { state: 'scanning'; engine: ScannerEngine }
  | { state: 'error'; message: string }

function CameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>({ state: 'starting' })
  // Keep the latest callback without restarting the camera when the parent re-renders.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let stop: (() => void) | undefined

    startBarcodeScanner(video, (code) => {
      if (cancelled) return
      cancelled = true
      stop?.()
      onDetectedRef.current(code)
    })
      .then((handle) => {
        if (cancelled) handle.stop()
        else {
          stop = handle.stop
          setStatus({ state: 'scanning', engine: handle.engine })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const denied = error instanceof DOMException && error.name === 'NotAllowedError'
        setStatus({
          state: 'error',
          message: denied
            ? 'Camera access was blocked. Allow camera permission in your browser settings and try again.'
            : 'Could not start the camera. Make sure one is connected and not in use by another app.',
        })
      })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="size-full object-cover"
          muted
          playsInline
          aria-label="Camera preview"
        />
        {status.state === 'starting' && (
          <div className="absolute inset-0 grid place-items-center text-white/80">
            <Spinner className="size-6" />
          </div>
        )}
        {status.state === 'scanning' && (
          // Aiming guide with a sweeping scan line.
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]">
            <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-danger" />
          </div>
        )}
        {status.state === 'error' && (
          <div className="absolute inset-0 grid place-items-center text-white/70">
            <CameraOff className="size-8" aria-hidden="true" />
          </div>
        )}
      </div>
      {status.state === 'error' ? (
        <Alert>{status.message}</Alert>
      ) : (
        <p className="text-center text-xs text-muted">
          {status.state === 'scanning'
            ? `Scanning… (${status.engine === 'native' ? 'built-in detector' : 'ZXing'})`
            : 'Starting camera…'}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
