import crypto from 'crypto'

/**
 * Universal Apple Health / HealthKit normalizer.
 * Supports:
 * 1. Apple Shortcuts JSON (clean dictionary format)
 * 2. Health Auto Export REST API v2 JSON ({ data: { metrics: [...], workouts: [...] } })
 * 3. Raw HealthKit sample batches ({ samples: [...] })
 */

export function round(n, d = 1) {
  if (n == null || isNaN(n)) return null
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function dateOnly(s) {
  if (!s) return null
  if (typeof s === 'string') return s.slice(0, 10)
  if (s instanceof Date) return s.toISOString().slice(0, 10)
  return null
}

export function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function kjToKcal(v) {
  return v / 4.184
}

export function miToKm(v) {
  return v * 1.60934
}

export function lbToKg(v) {
  return v * 0.453592
}

export function nameIs(normalized, ...aliases) {
  return aliases.some((a) => normalized === normalizeName(a))
}

export function nameIncludes(normalized, ...needles) {
  return needles.some((n) => normalized.includes(normalizeName(n)))
}

export function generateSampleId(type, startDate, value, unit = '', source = '') {
  const str = `${type}_${startDate}_${value}_${unit}_${source}`
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 32)
}

export function convertQty(qty, units, { toKcal = false, toKm = false, toKg = false } = {}) {
  if (qty == null || isNaN(qty)) return null
  const u = (units || '').toLowerCase()
  let v = Number(qty)
  if (toKcal && (u.includes('kj') || u === 'kj')) v = kjToKcal(v)
  if (toKm && (u.includes('mi') || u === 'mi')) v = miToKm(v)
  if (toKg && u.includes('lb')) v = lbToKg(v)
  return v
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
      standHours: 0,
      hydrationL: 0,
      hrSum: 0,
      hrCount: 0,
      hrMin: Infinity,
      hrMax: -Infinity,
      restingHrSum: 0,
      restingHrCount: 0,
      walkingHrSum: 0,
      walkingHrCount: 0,
      hrvSum: 0,
      hrvCount: 0,
      spo2Sum: 0,
      spo2Count: 0,
      respiratoryRateSum: 0,
      respiratoryRateCount: 0,
      weight: null,
      bmi: null,
      bodyFat: null,
      vo2max: null,
      walkingSpeed: null,
      walkingAsymmetry: null,
      stepLength: null,
      tempBody: null,
      tempWrist: null,
      sleepDeep: 0,
      sleepRem: 0,
      sleepLight: 0,
      sleepInBed: 0,
      detectedMetrics: new Set(),
    }
  }
  return days[date]
}

function applySleepAggregatedEntry(days, entry) {
  const date = dateOnly(entry.date)
  const d = ensureDay(days, date)
  if (!d) return
  d.detectedMetrics.add('sleep')
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
  const date = dateOnly(entry.endDate) // bucket by wake-up date
  const d = ensureDay(days, date)
  if (!d) return
  d.detectedMetrics.add('sleep')
  const val = entry.value || ''
  if (/deep/i.test(val)) d.sleepDeep += hours
  else if (/rem/i.test(val)) d.sleepRem += hours
  else if (/in ?bed/i.test(val)) d.sleepInBed += hours
  else if (/asleep|core/i.test(val)) d.sleepLight += hours
}

function applyMetric(days, metric, rawSamplesOut = []) {
  const normalized = normalizeName(metric.name)
  const units = metric.units || ''
  const entries = Array.isArray(metric.data) ? metric.data : []

  if (nameIs(normalized, 'sleep_analysis', 'sleepanalysis', 'sleep')) {
    for (const entry of entries) {
      if (entry.totalSleep !== undefined || entry.asleep !== undefined) {
        applySleepAggregatedEntry(days, entry)
      } else if (entry.startDate) {
        applySleepUnaggregatedEntry(days, entry)
      }
      if (entry.startDate && entry.endDate) {
        rawSamplesOut.push({
          sampleId: entry.id || generateSampleId('sleep', entry.startDate, entry.value || 1, 'hours'),
          type: 'sleep_analysis',
          date: dateOnly(entry.endDate || entry.startDate),
          startDate: new Date(entry.startDate),
          endDate: new Date(entry.endDate),
          value: entry.qty != null ? Number(entry.qty) : 1,
          unit: 'hours',
          source: entry.source || 'Apple Health',
          metadata: { stage: entry.value },
        })
      }
    }
    return
  }

  if (nameIncludes(normalized, 'heart_rate', 'heartrate') && !nameIncludes(normalized, 'resting', 'variability', 'recovery', 'walking')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (!d) continue
      d.detectedMetrics.add('heartRate')
      if (entry.Avg != null) {
        d.hrSum += entry.Avg
        d.hrCount++
      } else if (entry.qty != null) {
        d.hrSum += entry.qty
        d.hrCount++
      }
      if (entry.Min != null && entry.Min < d.hrMin) d.hrMin = entry.Min
      if (entry.Max != null && entry.Max > d.hrMax) d.hrMax = entry.Max

      if (entry.startDate) {
        rawSamplesOut.push({
          sampleId: entry.id || generateSampleId('heart_rate', entry.startDate, entry.qty ?? entry.Avg, units || 'bpm'),
          type: 'heart_rate',
          date: dateOnly(entry.startDate),
          startDate: new Date(entry.startDate),
          endDate: new Date(entry.endDate || entry.startDate),
          value: Number(entry.qty ?? entry.Avg),
          unit: units || 'bpm',
          source: entry.source || 'Apple Watch',
        })
      }
    }
    return
  }

  if (nameIncludes(normalized, 'resting_heart_rate', 'restingheartrate')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('restingHeartRate')
        d.restingHrSum += entry.qty
        d.restingHrCount++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'walking_heart_rate', 'walkingheartrate')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('walkingHeartRate')
        d.walkingHrSum += entry.qty
        d.walkingHrCount++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'heart_rate_variability', 'hrv', 'variability')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('hrv')
        d.hrvSum += entry.qty
        d.hrvCount++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'blood_oxygen', 'oxygen_saturation', 'oxygensaturation', 'spo2')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('spo2')
        let v = entry.qty
        if (v <= 1) v *= 100
        d.spo2Sum += v
        d.spo2Count++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'respiratory_rate', 'respiratoryrate')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('respiratoryRate')
        d.respiratoryRateSum += entry.qty
        d.respiratoryRateCount++
      }
    }
    return
  }

  if (nameIncludes(normalized, 'step_count', 'stepcount', 'steps')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('steps')
        d.steps += entry.qty
      }
    }
    return
  }

  if (nameIncludes(normalized, 'walking_running_distance', 'walkingrunningdistance', 'distance')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('distance')
        d.distanceKm += convertQty(entry.qty, units, { toKm: true }) || 0
      }
    }
    return
  }

  if (nameIncludes(normalized, 'active_energy', 'activeenergy')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('activeCalories')
        d.activeKcal += convertQty(entry.qty, units, { toKcal: true }) || 0
      }
    }
    return
  }

  if (nameIncludes(normalized, 'basal_energy', 'basalenergy', 'resting_energy', 'restingenergy')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('basalCalories')
        d.basalKcal += convertQty(entry.qty, units, { toKcal: true }) || 0
      }
    }
    return
  }

  if (nameIncludes(normalized, 'apple_exercise_time', 'exercisetime', 'exercise_minutes')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('exerciseMinutes')
        d.exerciseMin += entry.qty
      }
    }
    return
  }

  if (nameIncludes(normalized, 'stand_hour', 'standhour', 'stand_time', 'standtime')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('standHours')
        d.standHours += entry.qty
      }
    }
    return
  }

  if (nameIncludes(normalized, 'dietary_water', 'water', 'hydration')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('hydration')
        let v = entry.qty
        const u = (units || '').toLowerCase()
        if (u.includes('ml')) v /= 1000
        d.hydrationL += v
      }
    }
    return
  }

  if (nameIncludes(normalized, 'weight_body_mass', 'bodymass', 'weight') && !nameIncludes(normalized, 'index', 'fat')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('weight')
        d.weight = convertQty(entry.qty, units, { toKg: true })
      }
    }
    return
  }

  if (nameIncludes(normalized, 'body_mass_index', 'bodymassindex', 'bmi')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('bmi')
        d.bmi = entry.qty
      }
    }
    return
  }

  if (nameIncludes(normalized, 'body_fat', 'bodyfat')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('bodyFat')
        let v = entry.qty
        if (v <= 1) v *= 100
        d.bodyFat = round(v, 1)
      }
    }
    return
  }

  if (nameIncludes(normalized, 'vo2_max', 'vo2max')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('vo2max')
        d.vo2max = entry.qty
      }
    }
    return
  }

  if (nameIncludes(normalized, 'walking_speed', 'walkingspeed')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('walkingSpeed')
        d.walkingSpeed = round(entry.qty, 2)
      }
    }
    return
  }

  if (nameIncludes(normalized, 'walking_asymmetry', 'walkingasymmetry')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('walkingAsymmetry')
        let v = entry.qty
        if (v <= 1) v *= 100
        d.walkingAsymmetry = round(v, 1)
      }
    }
    return
  }

  if (nameIncludes(normalized, 'temperature', 'wrist_temperature')) {
    for (const entry of entries) {
      const d = ensureDay(days, dateOnly(entry.date || entry.startDate))
      if (d && entry.qty != null) {
        d.detectedMetrics.add('temperature')
        let v = entry.qty
        const u = (units || '').toLowerCase()
        if (u.includes('degf') || u.includes('f')) v = (v - 32) * (5 / 9)
        if (nameIncludes(normalized, 'wrist')) {
          d.tempWrist = round(v, 2)
        } else {
          d.tempBody = round(v, 2)
        }
      }
    }
    return
  }
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
        standHours: d.standHours ? Math.round(d.standHours) : undefined,
        hydration: round(d.hydrationL, 2),
        heart: {
          average: d.hrCount ? Math.round(d.hrSum / d.hrCount) : undefined,
          min: d.hrCount && d.hrMin !== Infinity ? Math.round(d.hrMin) : undefined,
          max: d.hrCount && d.hrMax !== -Infinity ? Math.round(d.hrMax) : undefined,
          resting: d.restingHrCount ? Math.round(d.restingHrSum / d.restingHrCount) : undefined,
          walkingAverage: d.walkingHrCount ? Math.round(d.walkingHrSum / d.walkingHrCount) : undefined,
          hrv: d.hrvCount ? Math.round(d.hrvSum / d.hrvCount) : undefined,
          vo2max: d.vo2max != null ? round(d.vo2max, 1) : undefined,
        },
        spo2: d.spo2Count ? round(d.spo2Sum / d.spo2Count, 1) : undefined,
        respiratoryRate: d.respiratoryRateCount ? round(d.respiratoryRateSum / d.respiratoryRateCount, 1) : undefined,
        weight:
          d.weight !== null || d.bodyFat !== null
            ? {
                value: d.weight !== null ? round(d.weight, 1) : undefined,
                bmi: d.bmi ?? undefined,
                bodyFatPercentage: d.bodyFat ?? undefined,
              }
            : undefined,
        mobility:
          d.walkingSpeed != null || d.walkingAsymmetry != null
            ? {
                walkingSpeed: d.walkingSpeed ?? undefined,
                walkingAsymmetry: d.walkingAsymmetry ?? undefined,
                stepLength: d.stepLength ?? undefined,
              }
            : undefined,
        temperature:
          d.tempBody != null || d.tempWrist != null
            ? {
                body: d.tempBody ?? undefined,
                wrist: d.tempWrist ?? undefined,
              }
            : undefined,
        sleep: {
          duration: sleepDuration || undefined,
          deep: round(d.sleepDeep, 2),
          rem: round(d.sleepRem, 2),
          light: round(d.sleepLight, 2),
          score: sleepScore ?? undefined,
        },
        detectedMetrics: Array.from(d.detectedMetrics || []),
      }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function parseWorkouts(workoutsArr) {
  if (!Array.isArray(workoutsArr)) return []
  return workoutsArr
    .map((w) => {
      const start = w.start || w.startDate || w.date
      const distanceQty = w.distance?.qty ?? w.distanceKm ?? w.distance
      const distanceUnits = w.distance?.units ?? 'km'
      let distanceKm = distanceQty != null ? convertQty(distanceQty, distanceUnits, { toKm: true }) : 0
      const caloriesQty = w.activeEnergyBurned?.qty ?? w.totalEnergy?.qty ?? w.calories ?? 0
      const caloriesUnits = w.activeEnergyBurned?.units ?? w.totalEnergy?.units ?? 'kcal'
      const calories = convertQty(caloriesQty, caloriesUnits, { toKcal: true }) || 0
      let durationMin = 0
      if (w.durationMin != null) durationMin = w.durationMin
      else if (w.duration != null) durationMin = round(w.duration > 600 ? w.duration / 60 : w.duration, 1)

      return {
        type: w.name || w.type || 'Workout',
        date: dateOnly(start) || dateOnly(new Date()),
        durationMin: round(durationMin, 1),
        distanceKm: round(distanceKm || 0, 2),
        calories: Math.round(calories),
      }
    })
    .filter((w) => w.date && w.type)
}

/**
 * Parses Shortcuts JSON format:
 * {
 *   client: 'shortcuts',
 *   date: 'YYYY-MM-DD',
 *   metrics: { steps, distanceKm, activeCalories, basalCalories, heartRate, hrv, spo2, ... },
 *   workouts: [...],
 *   samples: [...]
 * }
 */
export function parseShortcutsPayload(payload) {
  const date = payload.date || dateOnly(new Date())
  const m = payload.metrics || payload
  const detectedMetrics = new Set()
  const rawSamples = []

  const hr = typeof m.heartRate === 'object' && m.heartRate !== null ? m.heartRate : typeof m.heart === 'object' && m.heart !== null ? m.heart : {}
  const hrNum = typeof m.heartRate === 'number' ? m.heartRate : typeof m.heart === 'number' ? m.heart : null

  const sleep = typeof m.sleep === 'object' && m.sleep !== null ? m.sleep : {}
  const sleepNum = typeof m.sleep === 'number' ? m.sleep : typeof m.sleepHours === 'number' ? m.sleepHours : null

  const weight = typeof m.weight === 'object' && m.weight !== null ? m.weight : {}
  const mobility = typeof m.mobility === 'object' && m.mobility !== null ? m.mobility : {}
  const temperature = typeof m.temperature === 'object' && m.temperature !== null ? m.temperature : {}

  const dayDoc = {
    date,
    activity: {
      steps: m.steps != null ? Math.round(m.steps) : undefined,
      distance: m.distanceKm != null ? round(m.distanceKm, 2) : m.distance != null ? round(m.distance, 2) : undefined,
      calories: m.activeCalories != null ? Math.round(m.activeCalories) : undefined,
      basalCalories: m.basalCalories != null ? Math.round(m.basalCalories) : undefined,
      exerciseMinutes: m.exerciseMinutes != null ? Math.round(m.exerciseMinutes) : undefined,
    },
    standHours: m.standHours != null ? Math.round(m.standHours) : undefined,
    hydration: m.hydrationL != null ? round(m.hydrationL, 2) : m.hydration != null ? round(m.hydration, 2) : undefined,
    heart: {
      average: hr.average != null ? Math.round(hr.average) : hr.latest != null ? Math.round(hr.latest) : hrNum != null ? Math.round(hrNum) : undefined,
      resting: hr.resting != null ? Math.round(hr.resting) : m.restingHeartRate != null ? Math.round(m.restingHeartRate) : undefined,
      walkingAverage: hr.walkingAverage != null ? Math.round(hr.walkingAverage) : m.walkingHeartRateAverage != null ? Math.round(m.walkingHeartRateAverage) : undefined,
      min: hr.min != null ? Math.round(hr.min) : undefined,
      max: hr.max != null ? Math.round(hr.max) : undefined,
      hrv: m.hrv != null ? Math.round(m.hrv) : hr.hrv != null ? Math.round(hr.hrv) : undefined,
      vo2max: m.vo2max != null ? round(m.vo2max, 1) : hr.vo2max != null ? round(hr.vo2max, 1) : undefined,
    },
    spo2: m.spo2 != null ? round(m.spo2, 1) : undefined,
    respiratoryRate: m.respiratoryRate != null ? round(m.respiratoryRate, 1) : undefined,
    weight: {
      value: weight.value != null ? round(weight.value, 1) : typeof m.weight === 'number' ? round(m.weight, 1) : undefined,
      bmi: weight.bmi != null ? round(weight.bmi, 1) : m.bmi != null ? round(m.bmi, 1) : undefined,
      bodyFatPercentage: weight.bodyFatPercentage != null ? round(weight.bodyFatPercentage, 1) : m.bodyFat != null ? round(m.bodyFat, 1) : undefined,
    },
    mobility: {
      walkingSpeed: mobility.walkingSpeed != null ? round(mobility.walkingSpeed, 2) : m.walkingSpeed != null ? round(m.walkingSpeed, 2) : undefined,
      walkingAsymmetry: mobility.walkingAsymmetry != null ? round(mobility.walkingAsymmetry, 1) : m.walkingAsymmetry != null ? round(m.walkingAsymmetry, 1) : undefined,
      stepLength: mobility.stepLength != null ? round(mobility.stepLength, 1) : m.stepLength != null ? round(m.stepLength, 1) : undefined,
    },
    temperature: {
      body: temperature.body != null ? round(temperature.body, 2) : m.bodyTemperature != null ? round(m.bodyTemperature, 2) : undefined,
      wrist: temperature.wrist != null ? round(temperature.wrist, 2) : m.wristTemperature != null ? round(m.wristTemperature, 2) : undefined,
    },
    sleep: {
      duration: sleep.duration != null ? round(sleep.duration, 2) : sleepNum != null ? round(sleepNum, 2) : undefined,
      score: sleep.score != null ? Math.round(sleep.score) : undefined,
      deep: sleep.deep != null ? round(sleep.deep, 2) : undefined,
      rem: sleep.rem != null ? round(sleep.rem, 2) : undefined,
      light: sleep.light != null ? round(sleep.light, 2) : undefined,
      debt: sleep.debt != null ? round(sleep.debt, 2) : undefined,
    },
    extensibleMetrics: m.extensible || {},
  }

  // Record detected metrics & synthesize raw samples for deduplicated storage
  if (dayDoc.activity.steps != null) {
    detectedMetrics.add('steps')
    rawSamples.push({
      sampleId: generateSampleId('steps', date, dayDoc.activity.steps, 'count'),
      type: 'steps',
      date,
      startDate: new Date(date + 'T00:00:00Z'),
      endDate: new Date(date + 'T23:59:59Z'),
      value: dayDoc.activity.steps,
      unit: 'count',
      source: 'Apple Health (Shortcuts)',
    })
  }
  if (dayDoc.activity.distance != null) detectedMetrics.add('distance')
  if (dayDoc.activity.calories != null) detectedMetrics.add('activeCalories')
  if (dayDoc.activity.basalCalories != null) detectedMetrics.add('basalCalories')
  if (dayDoc.activity.exerciseMinutes != null) detectedMetrics.add('exerciseMinutes')
  if (dayDoc.standHours != null) detectedMetrics.add('standHours')
  if (dayDoc.heart.average != null) {
    detectedMetrics.add('heartRate')
    rawSamples.push({
      sampleId: generateSampleId('heart_rate', date, dayDoc.heart.average, 'bpm'),
      type: 'heart_rate',
      date,
      startDate: new Date(date + 'T00:00:00Z'),
      endDate: new Date(date + 'T23:59:59Z'),
      value: dayDoc.heart.average,
      unit: 'bpm',
      source: 'Apple Health (Shortcuts)',
    })
  }
  if (dayDoc.heart.resting != null) detectedMetrics.add('restingHeartRate')
  if (dayDoc.heart.walkingAverage != null) detectedMetrics.add('walkingHeartRate')
  if (dayDoc.heart.hrv != null) detectedMetrics.add('hrv')
  if (dayDoc.spo2 != null) detectedMetrics.add('spo2')
  if (dayDoc.respiratoryRate != null) detectedMetrics.add('respiratoryRate')
  if (dayDoc.heart.vo2max != null) detectedMetrics.add('vo2max')
  if (dayDoc.weight.value != null) detectedMetrics.add('weight')
  if (dayDoc.weight.bodyFatPercentage != null) detectedMetrics.add('bodyFat')
  if (dayDoc.mobility.walkingSpeed != null) detectedMetrics.add('walkingSpeed')
  if (dayDoc.mobility.walkingAsymmetry != null) detectedMetrics.add('walkingAsymmetry')
  if (dayDoc.temperature.body != null || dayDoc.temperature.wrist != null) detectedMetrics.add('temperature')
  if (dayDoc.sleep.duration != null) detectedMetrics.add('sleep')

  // Explicit raw samples in payload
  if (Array.isArray(payload.samples)) {
    for (const s of payload.samples) {
      if (s.type && s.value != null) {
        const sDate = s.date || dateOnly(s.startDate) || date
        rawSamples.push({
          sampleId: s.sampleId || generateSampleId(s.type, s.startDate || sDate, s.value, s.unit || '', s.source || ''),
          type: s.type,
          date: sDate,
          startDate: s.startDate ? new Date(s.startDate) : new Date(sDate + 'T00:00:00Z'),
          endDate: s.endDate ? new Date(s.endDate) : new Date(sDate + 'T23:59:59Z'),
          value: Number(s.value),
          unit: s.unit || '',
          source: s.source || 'Apple Health (Shortcuts)',
          device: s.device || null,
          metadata: s.metadata || null,
        })
        detectedMetrics.add(s.type)
      }
    }
  }

  const workouts = parseWorkouts(payload.workouts || [])

  return {
    days: [dayDoc],
    workouts,
    samples: rawSamples,
    detectedMetrics: Array.from(detectedMetrics),
  }
}

/**
 * Universal dispatcher: checks incoming payload shape and processes accordingly.
 */
export function parseUnifiedSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object.')
  }

  // Format 1: Health Auto Export v2 structure ({ data: { metrics: [...] } })
  if (payload.data && Array.isArray(payload.data.metrics)) {
    const rawSamples = []
    const daysObj = {}
    const detected = new Set()

    for (const metric of payload.data.metrics) {
      applyMetric(daysObj, metric, rawSamples)
    }

    const days = finalizeDays(daysObj)
    for (const d of days) {
      for (const m of d.detectedMetrics || []) detected.add(m)
    }

    const workouts = parseWorkouts(payload.data.workouts)
    if (workouts.length) detected.add('workouts')

    return {
      days,
      workouts,
      samples: rawSamples,
      detectedMetrics: Array.from(detected),
    }
  }

  // Format 2: Array of days ({ days: [...] })
  if (Array.isArray(payload.days)) {
    const allDays = []
    const allWorkouts = parseWorkouts(payload.workouts || [])
    const detected = new Set()

    for (const d of payload.days) {
      const parsed = parseShortcutsPayload({ ...payload, metrics: d, date: d.date })
      if (parsed.days[0]) allDays.push(parsed.days[0])
      parsed.detectedMetrics.forEach((m) => detected.add(m))
    }

    return {
      days: allDays,
      workouts: allWorkouts,
      samples: [],
      detectedMetrics: Array.from(detected),
    }
  }

  // Format 3: Apple Shortcuts single-day payload
  return parseShortcutsPayload(payload)
}

// Retain backward-compatible alias for existing webhook code
export function parseHealthAutoExportPayload(payload) {
  return parseUnifiedSyncPayload(payload)
}
