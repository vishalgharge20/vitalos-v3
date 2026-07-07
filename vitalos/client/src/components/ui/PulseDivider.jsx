import { motion } from 'framer-motion'

/**
 * VitalOS signature element — a hand-authored ECG-style trace used as a
 * structural divider instead of a plain hairline. It draws itself in on
 * mount, echoing the "your data has a pulse" idea that runs through the
 * whole app (also reused, scaled down, as the Recovery Ring's track).
 */
export default function PulseDivider({ className = '', color = 'var(--color-ion-500)' }) {
  const path =
    'M0 12 H30 L38 2 L46 22 L54 12 L60 12 L66 20 L72 4 L78 12 H400'

  return (
    <div className={`w-full overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 24" preserveAspectRatio="none" className="w-full h-6 opacity-60">
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.6 }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  )
}
