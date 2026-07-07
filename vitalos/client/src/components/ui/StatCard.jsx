import { motion } from 'framer-motion'

export default function StatCard({ icon: Icon, label, value, unit, delta, color = 'var(--color-ion-500)', onClick }) {
  const isPositive = typeof delta === 'number' ? delta >= 0 : null
  const Wrapper = onClick ? motion.button : motion.div

  return (
    <Wrapper
      onClick={onClick}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className={`glass rounded-2xl p-4 flex flex-col gap-3 text-left w-full ${onClick ? 'cursor-pointer hover:bg-[var(--color-surface-hover)]' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {Icon && <Icon size={17} />}
        </span>
        {delta !== undefined && delta !== null && (
          <span
            className={`text-xs font-medium font-tabular ${
              isPositive ? 'text-[var(--color-vital-teal)]' : 'text-[var(--color-vital-rose)]'
            }`}
          >
            {isPositive ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      <div>
        <div className="font-display font-tabular text-2xl font-semibold leading-none">
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-[var(--color-text-tertiary)]">{unit}</span>}
        </div>
        <div className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{label}</div>
      </div>
    </Wrapper>
  )
}
