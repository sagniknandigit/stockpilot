import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  format: (value: number) => string
  /** Seconds. */
  duration?: number
  className?: string
}

/**
 * Counts up to `value` (and tweens between later values). Writes to the DOM directly instead
 * of re-rendering every frame. Screen readers get the final value via aria-label.
 */
export function AnimatedNumber({ value, format, duration = 0.9, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(0)
  const reduceMotion = useReducedMotion()
  // React only renders the starting text; the effect below drives the DOM from there.
  const [initialText] = useState(() => format(0))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      el.textContent = format(value)
      previous.current = value
      return
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        el.textContent = format(latest)
      },
    })
    previous.current = value
    return () => controls.stop()
  }, [value, format, duration, reduceMotion])

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {initialText}
    </span>
  )
}
