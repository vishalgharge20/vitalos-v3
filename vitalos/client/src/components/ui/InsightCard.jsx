import { HiOutlineLightBulb } from 'react-icons/hi2'

export function InsightCard({ title, description, icon: Icon = HiOutlineLightBulb, color = 'var(--color-ion-500)' }) {
  return (
    <div className="glass rounded-2xl p-5 flex gap-3.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <Icon size={18} />
      </span>
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </div>
  )
}

export function RecommendationCard({ items = [] }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-display text-sm font-medium mb-4">Today's Advice</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color || 'var(--color-ion-500)' }}
            />
            <span className="text-[var(--color-text-secondary)] leading-relaxed">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
