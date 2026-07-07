import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HiOutlineMoon,
  HiOutlineHeart,
  HiOutlineScale,
  HiOutlineFire,
  HiOutlineBeaker,
  HiOutlineArrowUpTray,
  HiOutlineMapPin,
  HiOutlineCloud,
} from 'react-icons/hi2'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

import HealthRing from '@/components/ui/HealthRing'
import StatCard from '@/components/ui/StatCard'
import ChartCard from '@/components/ui/ChartCard'
import { RecommendationCard } from '@/components/ui/InsightCard'
import PulseDivider from '@/components/ui/PulseDivider'
import ImportModal from '@/components/ui/ImportModal'
import MetricDetailModal from '@/components/ui/MetricDetailModal'
import { getTodayRecord, getLastNDays, dummyWorkouts } from '@/data/dummyData'
import { getRecords, getWorkouts } from '@/api/client'

function buildAdvice(today) {
  const advice = []
  if (today.sleep.score != null && today.sleep.score < 60) {
    advice.push({ text: `Sleep score was ${today.sleep.score} — an earlier night tonight would help.`, color: 'var(--color-vital-amber)' })
  } else if (today.sleep.score != null) {
    advice.push({ text: `Sleep score was ${today.sleep.score} — solid recovery runway for today.`, color: 'var(--color-vital-teal)' })
  }
  if (today.activity.steps < 4000) {
    advice.push({ text: 'Step count is low so far — a 15 minute walk would help hit your daily target.', color: 'var(--color-ion-500)' })
  }
  if (today.heart.resting != null) {
    advice.push({ text: `Resting heart rate at ${today.heart.resting} bpm.`, color: 'var(--color-vital-violet)' })
  }
  if (today.spo2 != null && today.spo2 < 95) {
    advice.push({ text: `SpO2 read ${today.spo2}% — a little lower than typical, worth keeping an eye on.`, color: 'var(--color-vital-rose)' })
  }
  return advice.slice(0, 4)
}

export default function App() {
  const [records, setRecords] = useState(null) // null = still loading
  const [workouts, setWorkouts] = useState([])
  const [usingDemoData, setUsingDemoData] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [activeMetric, setActiveMetric] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [recordsData, workoutsData] = await Promise.all([getRecords(), getWorkouts(15)])
      if (recordsData.length) {
        setRecords(recordsData)
        setWorkouts(workoutsData)
        setUsingDemoData(false)
      } else {
        // Server reachable but nothing imported yet — show demo data so
        // the dashboard isn't empty, clearly labeled as such.
        setRecords(getLastNDays(90))
        setWorkouts(dummyWorkouts)
        setUsingDemoData(true)
      }
    } catch {
      setRecords(getLastNDays(90))
      setWorkouts(dummyWorkouts)
      setUsingDemoData(true)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const today = records ? records[records.length - 1] : getTodayRecord()
  const last14 = useMemo(() => (records ? records.slice(-14) : getLastNDays(14)), [records])

  const trendData = useMemo(
    () =>
      last14.map((r) => ({
        label: r.date.slice(5),
        sleepScore: r.sleep?.score ?? null,
        steps: r.activity?.steps ?? null,
        restingHr: r.heart?.resting ?? null,
        weight: r.weight?.value ?? null,
        spo2: r.spo2 ?? null,
        activeCalories: r.activity?.calories ?? null,
        hydration: r.hydration ?? null,
      })),
    [last14]
  )

  if (!records) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-base)] text-[var(--color-text-tertiary)]">
        Loading your dashboard…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-base)] text-[var(--color-text-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-base)]/80 px-5 py-4 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="var(--color-surface)" />
            <path d="M4 17H10L13 9L18 24L21 17H28" stroke="var(--color-ion-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="font-display text-[15px] font-semibold leading-none">VitalOS</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)] leading-none">Your Personal Health Dashboard</p>
          </div>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-ion-500)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <HiOutlineArrowUpTray size={16} />
          Import Apple Health
        </button>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8">
        {usingDemoData && (
          <div className="glass rounded-xl border border-[var(--color-vital-amber)]/30 px-4 py-3 text-xs text-[var(--color-vital-amber)]">
            Showing demo data — import your Apple Health export to see your real numbers. If you already
            imported, make sure the VitalOS server is running and reachable.
          </div>
        )}

        {/* Hero */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[auto_1fr]">
          <div className="glass flex flex-col items-center justify-center rounded-3xl p-8">
            <HealthRing
              value={today.sleep.score ?? 0}
              label="Sleep Score (est.)"
              sublabel={today.sleep.score == null ? 'No sleep data' : undefined}
            />
            <PulseDivider className="mt-6 max-w-[180px]" />
            <p className="mt-4 max-w-[200px] text-center text-xs leading-relaxed text-[var(--color-text-tertiary)]">
              Estimated from duration vs. an 8h target
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={HiOutlineMoon} label="Sleep" value={today.sleep.duration ?? '—'} unit="h" color="var(--color-vital-violet)" onClick={() => setActiveMetric('sleep')} />
            <StatCard icon={HiOutlineHeart} label="Resting HR" value={today.heart.resting ?? '—'} unit="bpm" color="var(--color-vital-rose)" onClick={() => setActiveMetric('heart')} />
            <StatCard icon={HiOutlineMapPin} label="Steps" value={today.activity.steps ? today.activity.steps.toLocaleString() : '—'} unit="" color="var(--color-ion-500)" onClick={() => setActiveMetric('steps')} />
            <StatCard icon={HiOutlineScale} label="Weight" value={today.weight?.value ?? '—'} unit="kg" color="var(--color-ion-400)" onClick={() => setActiveMetric('weight')} />
            <StatCard icon={HiOutlineFire} label="Active Calories" value={today.activity.calories ?? '—'} unit="kcal" color="var(--color-vital-teal)" onClick={() => setActiveMetric('activeCalories')} />
            <StatCard icon={HiOutlineCloud} label="SpO2" value={today.spo2 ?? '—'} unit="%" color="var(--color-vital-amber)" onClick={() => setActiveMetric('spo2')} />
            <StatCard icon={HiOutlineBeaker} label="Hydration" value={today.hydration ?? '—'} unit="L" color="var(--color-ion-400)" onClick={() => setActiveMetric('hydration')} />
            <StatCard icon={HiOutlineMapPin} label="Distance" value={today.activity.distance ?? '—'} unit="km" color="var(--color-ion-500)" onClick={() => setActiveMetric('steps')} />
          </div>
        </section>

        {/* Advice */}
        {buildAdvice(today).length > 0 && <RecommendationCard items={buildAdvice(today)} />}

        {/* Trend */}
        <ChartCard title="Recent Trend" subtitle="Sleep score vs. steps — last 14 days">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="sleepFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-vital-violet)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-vital-violet)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="stepsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-ion-500)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-ion-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="sleepScore" stroke="var(--color-vital-violet)" fill="url(#sleepFill)" strokeWidth={2} yAxisId={0} spanGaps />
                <Area type="monotone" dataKey="steps" stroke="var(--color-ion-500)" fill="url(#stepsFill)" strokeWidth={2} yAxisId={0} spanGaps />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Recent Workouts */}
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display text-sm font-medium mb-4">Recent Workouts</h3>
          {workouts.length ? (
            <div className="space-y-2">
              {workouts.map((w, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-[var(--color-surface)] px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-ion-500)]" />
                    <span>{w.type || 'Workout'}</span>
                  </div>
                  <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                    {w.date} · {w.durationMin}min{w.distanceKm ? ` · ${w.distanceKm}km` : ''}{w.calories ? ` · ${w.calories}kcal` : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)]">
              No workouts found in your import yet.
            </p>
          )}
        </div>
      </main>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={loadData} />
      <MetricDetailModal
        open={!!activeMetric}
        onClose={() => setActiveMetric(null)}
        metric={activeMetric}
        today={today}
        trend={trendData}
      />
    </div>
  )
}
