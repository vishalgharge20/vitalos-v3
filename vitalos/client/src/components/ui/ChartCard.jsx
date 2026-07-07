import { motion } from 'framer-motion'

export default function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`glass rounded-2xl p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-display text-sm font-medium text-[var(--color-text-primary)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.div>
  )
}
