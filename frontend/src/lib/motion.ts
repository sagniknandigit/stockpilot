import type { Transition, Variants } from 'motion/react'

/** Shared motion language so every animation in the app feels like the same product. */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 30 }

/** Parent variant: children fade up one after another on first render. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
}
