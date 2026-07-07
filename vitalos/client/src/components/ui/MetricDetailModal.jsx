import Modal from './Modal'
import MiniTrend from './MiniTrend'
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from 'recharts'

function DetailStat({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-3.5">
      <div className="font-display font-tabular text-lg font-semibold">
        {value ?? '—'}
        {value != null && unit && <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{label}</div>
    </div>
  )
}

const METRIC_CONFIG = {
  sleep: { title: 'Sleep', color: 'var(--color-vital-violet)' },
  heart: { title: 'Heart Rate', color: 'var(--color-vital-rose)' },
  steps: { title: 'Steps & Distance', color: 'var(--color-ion-500)' },
  weight: { title: 'Weight', color: 'var(--color-ion-400)' },
  activeCalories: { title: 'Active Calories', color: 'var(--color-vital-teal)' },
  spo2: { title: 'Blood Oxygen (SpO2)', color: 'var(--color-vital-amber)' },
  hydration: { title: 'Hydration', color: 'var(--color-ion-400)' },
}

export default function MetricDetailModal({ open, onClose, metric, today, trend }) {
  if (!metric || !today) return null
  const { title, color } = METRIC_CONFIG[metric]

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={today.date} maxWidth="max-w-xl">
      {metric === 'sleep' && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-2.5">
            <DetailStat label="Duration" value={today.sleep.duration} unit="h" />
            <DetailStat label="Score (est.)" value={today.sleep.score} />
            <DetailStat label="Deep" value={today.sleep.deep} unit="h" />
            <DetailStat label="REM" value={today.sleep.rem} unit="h" />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
            Sleep score is a simple estimate based on duration relative to an 8-hour target — Apple Health
            doesn't provide a clinical sleep score directly.
          </p>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Sleep score — last 14 days</p>
            <MiniTrend data={trend} dataKey="sleepScore" color={color} />
          </div>
        </div>
      )}

      {metric === 'heart' && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-2.5">
            <DetailStat label="Resting" value={today.heart.resting} unit="bpm" />
            <DetailStat label="Average" value={today.heart.average} unit="bpm" />
            <DetailStat label="Min" value={today.heart.min} unit="bpm" />
            <DetailStat label="Max" value={today.heart.max} unit="bpm" />
          </div>
          {today.heart.vo2max != null && (
            <div className="grid grid-cols-2 gap-2.5">
              <DetailStat label="VO2 Max" value={today.heart.vo2max} />
            </div>
          )}
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Resting heart rate — last 14 days</p>
            <MiniTrend data={trend} dataKey="restingHr" color={color} unit=" bpm" />
          </div>
        </div>
      )}

      {metric === 'steps' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            <DetailStat label="Steps" value={today.activity.steps?.toLocaleString()} />
            <DetailStat label="Distance" value={today.activity.distance} unit="km" />
            <DetailStat label="Exercise" value={today.activity.exerciseMinutes} unit="min" />
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Steps — last 14 days</p>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ left: -20, right: 8, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="steps" fill={color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {metric === 'weight' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5">
            <DetailStat label="Weight" value={today.weight?.value} unit="kg" />
            <DetailStat label="BMI" value={today.weight?.bmi} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Weight — last 14 days</p>
            <MiniTrend data={trend} dataKey="weight" color={color} unit=" kg" />
          </div>
        </div>
      )}

      {metric === 'activeCalories' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            <DetailStat label="Active" value={today.activity.calories} unit="kcal" />
            <DetailStat label="Resting (basal)" value={today.activity.basalCalories} unit="kcal" />
            <DetailStat label="Exercise" value={today.activity.exerciseMinutes} unit="min" />
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Active calories — last 14 days</p>
            <MiniTrend data={trend} dataKey="activeCalories" color={color} unit=" kcal" />
          </div>
        </div>
      )}

      {metric === 'spo2' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5">
            <DetailStat label="SpO2" value={today.spo2} unit="%" />
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">SpO2 — last 14 days</p>
            <MiniTrend data={trend} dataKey="spo2" color={color} unit="%" />
          </div>
        </div>
      )}

      {metric === 'hydration' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5">
            <DetailStat label="Today" value={today.hydration} unit="L" />
            <DetailStat label="Target" value="2.5" unit="L" />
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--color-text-tertiary)]">Hydration — last 14 days</p>
            <MiniTrend data={trend} dataKey="hydration" color={color} unit=" L" />
          </div>
        </div>
      )}
    </Modal>
  )
}
