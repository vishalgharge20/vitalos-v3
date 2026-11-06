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
  HiOutlineBolt,
  HiOutlineClock,
} from 'react-icons/hi2'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'

import StatCard from '@/components/ui/StatCard'
import ChartCard from '@/components/ui/ChartCard'
import { RecommendationCard } from '@/components/ui/InsightCard'
import ImportModal from '@/components/ui/ImportModal'
import MetricDetailModal from '@/components/ui/MetricDetailModal'
import SyncStatusModal from '@/components/ui/SyncStatusModal'
import { getTodayRecord, getLastNDays, dummyWorkouts } from '@/data/dummyData'
import { getRecords, getWorkouts, getSyncStatus } from '@/api/client'
import { computeStrain, computeRecovery } from '@/utils/wellness'

const CACHE_KEY = 'vitalos_dashboard_cache_v1'
const FETCH_WINDOW_DAYS = 120 // dashboard only ever needs recent history — cuts payload size a lot on multi-year exports

// ---- Whoop-style zone coloring ------------------------------------------
const NEUTRAL = 'var(--color-text-secondary)'
const GOOD = 'var(--color-vital-teal)'
const OK = 'var(--color-vital-amber)'
const LOW = 'var(--color-vital-rose)'

function zone(value, { goodMin, okMin, invert = false } = {}) {
  if (value == null) return NEUTRAL
  if (invert) {
    if (value <= goodMin) return GOOD
    if (value <= okMin) return OK
    return LOW
  }
  if (value >= goodMin) return GOOD
  if (value >= okMin) return OK
  return LOW
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}
function round(n, d = 1) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

// Sleep need scales with how hard the day was — same idea as Whoop's
// "Sleep Need", built honestly from what we actually have (est. Strain),
// not a fixed 8h line. Falls back to a neutral midpoint if there's no
// activity data for that day at all.
function estimateSleepNeed(day) {
  const strain = computeStrain(day)
  const s = strain ?? 10.5
  return round(7 + clamp(s, 0, 21) / 21 * 2, 1) // ranges ~7h–9h
}

function computeStreak(days) {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    const hasData = (d.activity?.steps ?? 0) > 0 || (d.sleep?.duration ?? 0) > 0
    if (hasData) streak++
    else break
  }
  return streak
}

function buildAdvice(today) {
  const advice = []
  const sleepScore = today?.sleep?.score
  const steps = today?.activity?.steps
  const restingHr = today?.heart?.resting
  const spo2 = today?.spo2
  const exerciseMin = today?.activity?.exerciseMinutes

  if (sleepScore != null && sleepScore < 60) {
    advice.push({ text: `Sleep score was ${sleepScore} — an earlier night tonight would help.`, color: 'var(--color-vital-amber)' })
  } else if (sleepScore != null) {
    advice.push({ text: `Sleep score was ${sleepScore} — solid recovery runway for today.`, color: 'var(--color-vital-teal)' })
  }
  if (steps != null && steps < 4000) {
    advice.push({ text: 'Step count is low so far — a 15 minute walk would help hit your daily target.', color: 'var(--color-ion-500)' })
  }
  if (restingHr != null) {
    advice.push({ text: `Resting heart rate at ${restingHr} bpm.`, color: 'var(--color-vital-violet)' })
  }
  if (spo2 != null && spo2 < 95) {
    advice.push({ text: `SpO2 read ${spo2}% — a little lower than typical, worth keeping an eye on.`, color: 'var(--color-vital-rose)' })
  }
  if (exerciseMin != null && exerciseMin < 20) {
    advice.push({ text: `Only ${exerciseMin} exercise minutes so far — WHO guidance is ~30/day.`, color: 'var(--color-vital-amber)' })
  }
  return advice.slice(0, 4)
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeCache(records, workouts) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ records, workouts, cachedAt: Date.now() }))
  } catch {
    // localStorage full/unavailable — non-fatal, just skip caching
  }
}

// ---- Gamified dial ring ---------------------------------------------------
// Whoop's rings read as a "dial" — tick marks, a glow that matches the
// zone color, and a badge instead of a plain percentage. This is built
// from plain SVG + CSS transitions (no new deps) so it drops straight
// into this one file.
function DialRing({ value = 0, size = 180, label, sublabel, icon: Icon, color }) {
  const strokeWidth = 14
  const radius = size / 2 - strokeWidth - 8
  const circumference = 2 * Math.PI * radius
  const pct = clamp(value, 0, 100)
  const offset = circumference - (pct / 100) * circumference
  const gradientId = `dial-grad-${label?.replace(/\s+/g, '-')}`
  const ticks = Array.from({ length: 30 })
  const center = size / 2

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-2 rounded-full"
        style={{
          boxShadow: `0 0 36px 4px ${color}30`,
          animation: 'vitalPulse 3.2s ease-in-out infinite',
        }}
      />
      <svg width={size} height={size} className="relative -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>

        {ticks.map((_, i) => {
          const angle = (i / ticks.length) * 360
          const isMajor = i % 5 === 0
          const rad = (angle * Math.PI) / 180
          const rOuter = radius + strokeWidth / 2 + 8
          const rInner = radius + strokeWidth / 2 + (isMajor ? 2 : 4)
          const x1 = center + rInner * Math.cos(rad)
          const y1 = center + rInner * Math.sin(rad)
          const x2 = center + rOuter * Math.cos(rad)
          const y2 = center + rOuter * Math.sin(rad)
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isMajor ? 'var(--color-border-strong)' : 'var(--color-border)'}
              strokeWidth={isMajor ? 2 : 1}
              strokeLinecap="round"
            />
          )
        })}

        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)',
            filter: `drop-shadow(0 0 8px ${color}90)`,
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {Icon && <Icon size={16} style={{ color }} className="mb-1" />}
        <span className="font-display tabular-nums text-4xl font-bold">
          {Math.round(pct)}
          {/* <span className="text-base font-normal text-[var(--color-text-tertiary)]">%</span> */}
          <span className="text-base font-normal text-white">%</span>
        </span>
        <span className="mt-1 text-xs text-[var(--color-text-secondary)]">{label}</span>
        <span
          className="mt-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
          style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}40` }}
        >
          {sublabel}
        </span>
      </div>
    </div>
  )
}

export default function App() {
  const cached = useState(() => readCache())[0]

  // Paint instantly from cache if we have it; only show the full loading
  // screen on a genuinely cold start with nothing cached yet.
  const [records, setRecords] = useState(cached?.records ?? null)
  const [workouts, setWorkouts] = useState(cached?.workouts ?? [])
  const [usingDemoData, setUsingDemoData] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [activeMetric, setActiveMetric] = useState(null)

  const fetchSyncStatus = useCallback(async () => {
    try {
      const data = await getSyncStatus()
      setSyncStatus(data)
    } catch {
      // Server offline or initial dev start
    }
  }, [])

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (background) setRefreshing(true)
    try {
      const from = new Date(Date.now() - FETCH_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
      const [recordsData, workoutsData] = await Promise.all([getRecords({ from }), getWorkouts(15)])
      if (recordsData.length) {
        setRecords(recordsData)
        setWorkouts(workoutsData)
        setUsingDemoData(false)
        writeCache(recordsData, workoutsData)
      } else if (!cached) {
        setRecords(getLastNDays(90))
        setWorkouts(dummyWorkouts)
        setUsingDemoData(true)
      }
    } catch {
      if (!cached) {
        setRecords(getLastNDays(90))
        setWorkouts(dummyWorkouts)
        setUsingDemoData(true)
      }
    } finally {
      setRefreshing(false)
    }
  }, [cached])

  useEffect(() => {
    // Cache paints immediately (if present); this fetch always runs to
    // pick up anything imported since the cache was written.
    loadData({ background: !!cached })
    fetchSyncStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = records ? records[records.length - 1] : getTodayRecord()
  const last14 = useMemo(() => (records ? records.slice(-14) : getLastNDays(14)), [records])
  const last30 = useMemo(() => (records ? records.slice(-30) : getLastNDays(30)), [records])

  const recovery = useMemo(() => computeRecovery(today, last30), [today, last30])
  const strain = useMemo(() => computeStrain(today), [today])
  const streak = useMemo(() => computeStreak(records ?? []), [records])

  const trendData = useMemo(
    () =>
      last14.map((r) => ({
        label: r.date.slice(5),
        sleepTaken: r.sleep?.duration ?? null,
        sleepRequired: estimateSleepNeed(r),
        sleepScore: r.sleep?.score ?? null,
        restingHr: r.heart?.resting ?? null,
        steps: r.activity?.steps ?? null,
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
      <style>{`
        @keyframes vitalPulse {
          0%, 100% { opacity: 0.5; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1.02); }
        }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-base)]/80 px-5 py-4 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="var(--color-surface)" />
            <path d="M4 17H10L13 9L18 24L21 17H28" stroke="var(--color-ion-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="font-display text-[15px] font-semibold leading-none">VitalOS</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)] leading-none">
              {refreshing ? 'Updating…' : 'Your Personal Health Dashboard'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSyncModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-white"
            title="Apple Health Live Sync Status"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                syncStatus?.connected
                  ? 'bg-[var(--color-vital-teal)] shadow-[0_0_8px_var(--color-vital-teal)]'
                  : 'bg-[var(--color-vital-amber)]'
              }`}
            />
            <span className="hidden sm:inline">
              {syncStatus?.connected ? 'Apple Health: Synced' : 'Apple Health Sync'}
            </span>
            <span className="sm:hidden">Sync</span>
          </button>

          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-ion-500)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <HiOutlineArrowUpTray size={16} />
            <span className="hidden sm:inline">Import Apple Health</span>
            <span className="sm:hidden">Import</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8">
        {usingDemoData && (
          <div className="glass rounded-xl border border-[var(--color-vital-amber)]/30 px-4 py-3 text-xs text-[var(--color-vital-amber)]">
            Showing demo data — import your Apple Health export to see your real numbers. If you already
            imported, make sure the VitalOS server is running and reachable.
          </div>
        )}

        {/* Whoop-style triple dial hero: Recovery / Sleep / Strain */}
        <section className="glass rounded-3xl p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="flex flex-col items-center">
              <DialRing
                value={recovery ?? 0}
                size={180}
                label="Recovery"
                icon={HiOutlineHeart}
                color={zone(recovery, { goodMin: 67, okMin: 34 })}
                sublabel={recovery == null ? 'Not enough data' : 'est.'}
              />
            </div>
            <div className="flex flex-col items-center">
              <DialRing
                value={today?.sleep?.score ?? 0}
                size={180}
                label="Sleep"
                icon={HiOutlineMoon}
                color={zone(today?.sleep?.score, { goodMin: 85, okMin: 60 })}
                sublabel={today?.sleep?.score == null ? 'No sleep data' : 'est.'}
              />
            </div>
            <div className="flex flex-col items-center">
              <DialRing
                value={strain != null ? Math.round((strain / 21) * 100) : 0}
                size={180}
                label="Strain"
                icon={HiOutlineBolt}
                color={strain == null ? NEUTRAL : strain >= 14 ? 'var(--color-vital-rose)' : strain >= 7 ? 'var(--color-vital-amber)' : 'var(--color-ion-500)'}
                sublabel={strain != null ? `${strain} / 21` : 'No activity data'}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ color: 'var(--color-vital-amber)', backgroundColor: 'var(--color-vital-amber)1a', border: '1px solid var(--color-vital-amber)40' }}
            >
              <HiOutlineFire size={14} />
              {streak}-day logging streak
            </span>
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-[var(--color-text-tertiary)]">
            Recovery and Strain are estimates built from resting heart rate, sleep, and activity —
            Apple Health doesn't provide Whoop-style scores directly, so these are transparent
            approximations, not clinical measurements.
          </p>
        </section>

        {/* Full metric grid */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          <StatCard
            icon={HiOutlineMoon}
            label="Sleep"
            value={today?.sleep?.duration ?? '—'}
            unit="h"
            color={zone(today?.sleep?.duration, { goodMin: 7, okMin: 6 })}
            onClick={() => setActiveMetric('sleep')}
          />
          <StatCard
            icon={HiOutlineHeart}
            label="Resting HR"
            value={today?.heart?.resting ?? '—'}
            unit="bpm"
            color={zone(today?.heart?.resting, { goodMin: 60, okMin: 70, invert: true })}
            onClick={() => setActiveMetric('heart')}
          />
          <StatCard
            icon={HiOutlineHeart}
            label="Avg Heart Rate"
            value={today?.heart?.average ?? '—'}
            unit="bpm"
            color="var(--color-vital-rose)"
            onClick={() => setActiveMetric('heart')}
          />
          <StatCard
            icon={HiOutlineMapPin}
            label="Steps"
            value={today?.activity?.steps != null ? today.activity.steps.toLocaleString() : '—'}
            unit=""
            color={zone(today?.activity?.steps, { goodMin: 8000, okMin: 4000 })}
            onClick={() => setActiveMetric('steps')}
          />
          <StatCard
            icon={HiOutlineMapPin}
            label="Distance"
            value={today?.activity?.distance ?? '—'}
            unit="km"
            color="var(--color-ion-500)"
            onClick={() => setActiveMetric('steps')}
          />
          <StatCard
            icon={HiOutlineClock}
            label="Exercise"
            value={today?.activity?.exerciseMinutes ?? '—'}
            unit="min"
            color={zone(today?.activity?.exerciseMinutes, { goodMin: 30, okMin: 10 })}
            onClick={() => setActiveMetric('activeCalories')}
          />
          <StatCard
            icon={HiOutlineFire}
            label="Active Calories"
            value={today?.activity?.calories ?? '—'}
            unit="kcal"
            color="var(--color-vital-teal)"
            onClick={() => setActiveMetric('activeCalories')}
          />
          <StatCard
            icon={HiOutlineFire}
            label="Basal Calories"
            value={today?.activity?.basalCalories ?? '—'}
            unit="kcal"
            color="var(--color-ion-400)"
            onClick={() => setActiveMetric('activeCalories')}
          />
          <StatCard
            icon={HiOutlineCloud}
            label="SpO2"
            value={today?.spo2 ?? '—'}
            unit="%"
            color={zone(today?.spo2, { goodMin: 97, okMin: 94 })}
            onClick={() => setActiveMetric('spo2')}
          />
        </section>

        {/* Advice */}
        {buildAdvice(today).length > 0 && <RecommendationCard items={buildAdvice(today)} />}

        {/* Trend */}
        <ChartCard title="Sleep Required vs. Sleep Taken" subtitle="Last 14 days — the gap is your sleep debt">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="sleepTakenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-vital-violet)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-vital-violet)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  domain={[0, 10]}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  formatter={(v, name) => [`${v}h`, name]}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
                <Area
                  type="monotone"
                  dataKey="sleepTaken"
                  name="Sleep Taken"
                  stroke="var(--color-vital-violet)"
                  fill="url(#sleepTakenFill)"
                  strokeWidth={2}
                  spanGaps
                />
                <Line
                  type="monotone"
                  dataKey="sleepRequired"
                  name="Sleep Required (est.)"
                  stroke="var(--color-vital-amber)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  spanGaps
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Recent Workouts */}
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display text-sm font-medium mb-4">Recent Workouts</h3>
          {workouts.length ? (
            <div className="space-y-2">
              {workouts.slice(0, 3).map((w, i) => (
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

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          loadData({ background: true })
          fetchSyncStatus()
        }}
      />
      <SyncStatusModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        syncStatus={syncStatus}
        onRefreshStatus={fetchSyncStatus}
      />
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