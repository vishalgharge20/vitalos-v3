import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

function statusFor(value) {
  if (value >= 85) return { label: 'Well rested', color: 'var(--color-vital-teal)' }
  if (value >= 60) return { label: 'Adequate', color: 'var(--color-vital-amber)' }
  return { label: 'Under-slept', color: 'var(--color-vital-rose)' }
}

/**
 * Large centerpiece ring — currently used for the estimated Sleep Score,
 * since Apple Health doesn't provide a Whoop/Garmin-style recovery score
 * directly. The track itself is a subtle repeating pulse-trace pattern
 * rather than a flat circle, tying the hero metric back to the app's ECG
 * signature.
 */
export default function HealthRing({ value = 0, size = 240, label = 'Recovery', sublabel }) {
  const [display, setDisplay] = useState(0)
  const radius = size / 2 - 18
  const circumference = 2 * Math.PI * radius
  const { label: statusLabel, color } = statusFor(value)
  const offset = circumference - (value / 100) * circumference

  useEffect(() => {
    let raf
    const start = performance.now()
    const duration = 1200
    const from = display
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="12"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-5xl font-semibold tracking-tight font-tabular">
          {display}
          <span className="text-lg text-[var(--color-text-tertiary)]"> %</span>
        </span>
        <span className="mt-1 text-sm text-[var(--color-text-secondary)]">{label}</span>
        <span
          className="mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}40` }}
        >
          {sublabel || statusLabel}
        </span>
      </div>
    </div>
  )
}
