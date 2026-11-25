/**
 * Camera barcode scanning. Uses the native BarcodeDetector API where the browser has it
 * (Chrome on Android/macOS), otherwise lazy-loads ZXing so it stays out of the main bundle.
 */

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats(): Promise<string[]>
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorClass
  }
}

export type ScannerEngine = 'native' | 'zxing'

export interface ScannerHandle {
  engine: ScannerEngine
  stop: () => void
}

const SCAN_INTERVAL_MS = 200

/**
 * Open the rear camera into `video` and call `onCode` once per distinct barcode seen.
 * Resolves with a handle whose `stop()` releases the camera.
 */
export async function startBarcodeScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScannerHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  const stopStream = () => {
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
  }

  try {
    const Detector = window.BarcodeDetector
    if (Detector) {
      const formats = await Detector.getSupportedFormats()
      if (formats.length > 0)
        return startNative(new Detector({ formats }), video, onCode, stopStream)
    }
    return await startZxing(video, onCode, stopStream)
  } catch (error) {
    stopStream()
    throw error
  }
}

function startNative(
  detector: BarcodeDetectorInstance,
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  stopStream: () => void,
): ScannerHandle {
  let stopped = false
  let timer = 0

  const tick = async () => {
    if (stopped) return
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const [first] = await detector.detect(video)
        if (first?.rawValue && !stopped) onCode(first.rawValue)
      }
    } catch {
      // A frame can fail to decode; keep scanning.
    }
    if (!stopped) timer = window.setTimeout(tick, SCAN_INTERVAL_MS)
  }
  void tick()

  return {
    engine: 'native',
    stop: () => {
      stopped = true
      window.clearTimeout(timer)
      stopStream()
    },
  }
}

async function startZxing(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  stopStream: () => void,
): Promise<ScannerHandle> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser')
  const reader = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: SCAN_INTERVAL_MS,
  })
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) onCode(result.getText())
  })
  return {
    engine: 'zxing',
    stop: () => {
      controls.stop()
      stopStream()
    },
  }
}
