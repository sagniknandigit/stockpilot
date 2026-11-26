import { useId } from 'react'

interface SparklineProps {
  values: number[]
  className?: string
  /** CSS color for the line; defaults to currentColor. */
  color?: string
}

/** Tiny decorative trend line (the numbers it summarises are shown next to it). */
export function Sparkline({ values, className, color = 'currentColor' }: SparklineProps) {
  const id = useId()
  if (values.length < 2) return null
  const width = 120
  const height = 36
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  )
}
