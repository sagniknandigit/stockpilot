import { motion, useReducedMotion } from 'motion/react'

export function ThinkingDots() {
  const reduce = useReducedMotion()
  return (
    <span
      className="inline-flex items-center gap-1"
      role="status"
      aria-label="StockPilot is thinking"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-accent"
          animate={reduce ? undefined : { y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}
