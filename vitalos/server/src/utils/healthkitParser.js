/**
 * Parses the JSON payload Health Auto Export's "REST API" automation sends
 * (https://github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format).
 *
 * Shape: { data: { metrics: [...], workouts: [...] } }
 * Each metric is { name, units, data: [{ qty, date }, ...] }, with a few
 * named exceptions (heart rate has Min/Avg/Max instead of qty; sleep
 * analysis has its own richer shape).
 *
 * Metric `name` values aren't nailed down to one exact casing/format across
 * app versions, so matching is done on a normalized (lowercased,
 * non-alphanumeric stripped) form rather than exact string equality — more
 * resilient to "step_count" vs "Step Count" vs "stepCount" style drift.
 */

function round(n, d = 1) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}
function dateOnly(s) {
  return s ? s.slice(0, 10) : null
}
function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function kjToKcal(v) {
  return v / 4.184
}
function miToKm(v) {
  return v * 1.60934
}
function lbToKg(v) {
  return v * 0.453592
}

// Matches a normalized metric name against a set of normalized aliases.
function nameIs(normalized, ...aliases) {
  return aliases.some((a) => normalized === normalizeName(a))
}
function nameIncludes(normalized, ...needles) {
  return needles.some((n) => normalized.includes(normalizeName(n)))
}

function ensureDay(days, date) {
  if (!date) return null
  if (!days[date]) {
    days[date] = {
      date,
      steps: 0,
      distanceKm: 0,
      activeKcal: 0,
      basalKcal: 0,
      exerciseMin: 0,
      hydrationL: 0,
      hrSum: 0,
      hrCount: 0,
      hrMin: Infinity,
      hrMax: -Infinity,
      restingHrSum: 0,
      restingHrCount: 0,
      spo2Sum: 0,
      spo2Count: 0,
      weight: null,
      bmi: null,
      vo2max: null,
      sleepDeep: 0,
      sleepRem: 0,
      sleepLight: 0,
      sleepInBed: 0,
    }
  }
  return days[date]
}

function convertQty(qty, units, { toKcal = false, toKm = false, toKg = false } = {}) {
  if (qty == null || isNaN(qty)) return null
  const u = (units || '').toLowerCase()
  let v = qty
  if (toKcal && (u.includes('kj') || u === 'kj')) v = kjToKcal(v)
  if (toKm && (u.includes('mi') || u === 'mi')) v = miToKm(v)
  if (toKg && (u.includes('lb'))) v = lbToKg(v)
  return v
}

function applySleepAggregatedEntry(days, entry) {
  const date = dateOnly(entry.date)
  const d = ensureDay(days, date)
  if (!d) return
  // Aggregated sleep gives us the breakdown directly — no need to sum
  // raw intervals ourselves the way the Apple Health XML importer does.
  d.sleepDeep += entry.deep || 0
  d.sleepRem += entry.rem || 0
  const core = entry.core ?? Math.max((entry.asleep || 0) - (entry.deep || 0) - (entry.rem || 0), 0)
  d.sleepLight += core
  d.sleepInBed += entry.inBed || 0
}

function applySleepUnaggregatedEntry(days, entry) {
  const startMs = Date.parse(entry.startDate)
  const endMs = Date.parse(entry.endDate)
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return
  const hours = (endMs - startMs) / 3600000
  const date = dateOnly(entry.endDate) // bucket by wake-up date, same convention as the XML importer
  const d = ensureDay(days, date)
  if (!d) return
  const val = entry.value || ''
  if (/deep/i.test(val)) d.sleepDeep += hours
  else if (/rem/i.test(val)) d.sleepRem += hours
  else if (/in ?bed/i.test(val)) d.sleepInBed += hours
  else if (/asleep|core/i.test(val)) d.sleepLight += hours
}

function applyMetric(days, metric) {
  const normalized = normalizeName(metric.name)
  const units = metric.units
  const entries = Array.isArray(metric.data) ? metric.data : []

  if (nameIs(normalized, 'sleep_analysis', 'sleep analysis')) {
    for (const entry of entries) {
      if (entry.totalSleep !== undefined || entry.asleep !== undefined) {
        applySleepAggregatedEntry(days, entry)
      } else if (entry.startDate) {
        applySleepUnaggregatedEntry(days, entry)
      }
    }
    return
  }

  if (nameIncludes(normalized, 'heart_rate') && !nameIncludes(normalized, 'resting', 'variability', 'recovery')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (!d) continue
      if (entry.Avg != null) {
        d.hrSum += entry.Avg
        d.hrCount++
      }
      if (entry.Min != null && entry.Min < d.hrMin) d.hrMin = entry.Min
      if (entry.Max != null && entry.Max > d.hrMax) d.hrMax = entry.Max
    }
    return
  }

  if (nameIncludes(normalized, 'resting_heart_rate', 'restingheartrate')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) {
        d.restingHrSum += entry.qty
        d.restingHrCount++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'blood_oxygen', 'oxygen_saturation', 'oxygensaturation')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) {
        let v = entry.qty
        if (v <= 1) v *= 100
        d.spo2Sum += v
        d.spo2Count++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'step_count', 'stepcount')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.steps += entry.qty
    }
    return
  }

  if (nameIncludes(normalized, 'walking_running_distance', 'walkingrunningdistance')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.distanceKm += convertQty(entry.qty, units, { toKm: true })
    }
    return
  }

  if (nameIncludes(normalized, 'active_energy', 'activeenergy')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.activeKcal += convertQty(entry.qty, units, { toKcal: true })
    }
    return
  }

  if (nameIncludes(normalized, 'basal_energy', 'basalenergy', 'resting_energy', 'restingenergy')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.basalKcal += convertQty(entry.qty, units, { toKcal: true })
    }
    return
  }

  if (nameIncludes(normalized, 'apple_exercise_time', 'exercisetime')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.exerciseMin += entry.qty
    }
    return
  }

  if (nameIncludes(normalized, 'dietary_water', 'water')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) {
        let v = entry.qty
        const u = (units || '').toLowerCase()
        if (u.includes('ml')) v /= 1000
        d.hydrationL += v
      }
    }
    return
  }

  if (nameIncludes(normalized, 'weight_body_mass', 'bodymass') && !nameIncludes(normalized, 'index')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.weight = convertQty(entry.qty, units, { toKg: true })
    }
    return
  }

  if (nameIncludes(normalized, 'body_mass_index', 'bodymassindex')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.bmi = entry.qty
    }
    return
  }

  if (nameIncludes(normalized, 'vo2_max', 'vo2max')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date))
      if (d && entry.qty != null) d.vo2max = entry.qty
    }
    return
  }

  // Unrecognized metric — safely ignored. New HealthKit types get added
  // over time; the importer should degrade gracefully, not throw.
}

function finalizeDays(days) {
  return Object.values(days)
    .map((d) => {
      const sleepDuration = round(d.sleepDeep + d.sleepRem + d.sleepLight, 2)
      const sleepScore = sleepDuration ? Math.round(clamp((sleepDuration / 8) * 100, 0, 100)) : null
      return {
        date: d.date,
        activity: {
          steps: Math.round(d.steps),
          distance: round(d.distanceKm, 2),
          calories: Math.round(d.activeKcal),
          basalCalories: Math.round(d.basalKcal),
          exerciseMinutes: Math.round(d.exerciseMin),
        },
        hydration: round(d.hydrationL, 2),
        heart: {
          average: d.hrCount ? Math.round(d.hrSum / d.hrCount) : undefined,
          min: d.hrCount && d.hrMin !== Infinity ? Math.round(d.hrMin) : undefined,
          max: d.hrCount && d.hrMax !== -Infinity ? Math.round(d.hrMax) : undefined,
          resting: d.restingHrCount ? Math.round(d.restingHrSum / d.restingHrCount) : undefined,
          vo2max: d.vo2max ?? undefined,
        },
        spo2: d.spo2Count ? round(d.spo2Sum / d.spo2Count, 1) : undefined,
        weight: d.weight !== null ? { value: round(d.weight, 1), bmi: d.bmi ?? undefined } : undefined,
        sleep: {
          duration: sleepDuration || undefined,
          deep: round(d.sleepDeep, 2),
          rem: round(d.sleepRem, 2),
          light: round(d.sleepLight, 2),
          score: sleepScore ?? undefined,
        },
      }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

function parseWorkouts(workoutsArr) {
  if (!Array.isArray(workoutsArr)) return []
  return workoutsArr
    .map((w) => {
      const start = w.start
      const distanceQty = w.distance?.qty
      const distanceUnits = w.distance?.units
      let distanceKm = distanceQty != null ? convertQty(distanceQty, distanceUnits, { toKm: true }) : 0
      const caloriesQty = w.activeEnergyBurned?.qty ?? w.totalEnergy?.qty ?? 0
      const caloriesUnits = w.activeEnergyBurned?.units ?? w.totalEnergy?.units
      const calories = convertQty(caloriesQty, caloriesUnits, { toKcal: true }) || 0
      const durationMin = w.duration != null ? round(w.duration / 60, 1) : 0 // v2 duration is in seconds
      return {
        type: w.name || 'Workout',
        date: dateOnly(start),
        durationMin,
        distanceKm: round(distanceKm || 0, 2),
        calories: Math.round(calories),
      }
    })
    .filter((w) => w.date)
}

export function parseHealthAutoExportPayload(payload) {
  const metrics = payload?.data?.metrics
  const workoutsRaw = payload?.data?.workouts

  if (!Array.isArray(metrics)) {
    throw new Error('Payload is missing data.metrics — is this a Health Auto Export REST API export?')
  }

  const days = {}
  for (const metric of metrics) {
    applyMetric(days, metric)
  }

  return {
    days: finalizeDays(days),
    workouts: parseWorkouts(workoutsRaw),
  }
}