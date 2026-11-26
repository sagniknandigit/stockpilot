import { motion, useReducedMotion } from 'motion/react'

/** Animated "drawn" checkmark for a completed sale. */
export function SuccessCheck() {
  const reduce = useReducedMotion()
  const draw = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: 0.45, delay, ease: 'easeOut' as const },
        }
  return (
    <motion.div
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      className="mx-auto grid size-16 place-items-center rounded-full bg-success/12"
      aria-hidden="true"
    >
      <svg viewBox="0 0 52 52" className="size-12 text-success">
        <motion.circle
          cx="26"
          cy="26"
          r="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          {...draw(0)}
        />
        <motion.path
          d="M16 27 l7 7 l14 -15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw(0.3)}
        />
      </svg>
    </motion.div>
  )
}
