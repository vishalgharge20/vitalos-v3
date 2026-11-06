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

export function parseNum(val) {
  if (val == null) return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').replace(/[^0-9.-]/g, '').trim()
    if (!cleaned) return null
    const n = Number(cleaned)
    return isNaN(n) ? null : n
  }
  return null
}

export function getField(source, ...aliases) {
  if (!source || typeof source !== 'object') return null
  // 1. Direct case-sensitive check
  for (const a of aliases) {
    if (source[a] !== undefined && source[a] !== null) return source[a]
  }
  // 2. Case-insensitive / symbol-stripped check
  const normMap = new Map()
  for (const [k, v] of Object.entries(source)) {
    normMap.set(normalizeName(k), v)
  }
  for (const a of aliases) {
    const na = normalizeName(a)
    if (normMap.has(na)) {
      const v = normMap.get(na)
      if (v !== undefined && v !== null) return v
    }
  }
  return null
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
  const m = payload.metrics && typeof payload.metrics === 'object' ? { ...payload, ...payload.metrics } : payload
  const detectedMetrics = new Set()
  const rawSamples = []

  // Extract raw values with fuzzy key matching
  const rawSteps = getField(m, 'steps', 'stepCount', 'step_count')
  const rawDistance = getField(m, 'distanceKm', 'distance', 'distance_km', 'walkingRunningDistance', 'walking_running_distance')
  const rawActiveCalories = getField(m, 'activeCalories', 'active_calories', 'activeEnergy', 'active_energy', 'calories')
  const rawBasalCalories = getField(m, 'basalCalories', 'basal_calories', 'basalEnergy', 'basal_energy', 'restingCalories')
  const rawExerciseMinutes = getField(m, 'exerciseMinutes', 'exercise_minutes', 'exerciseTime', 'appleExerciseTime')
  const rawStandHours = getField(m, 'standHours', 'stand_hours', 'standTime')
  const rawHydration = getField(m, 'hydrationL', 'hydration', 'water', 'dietaryWater')

  const rawHeart = getField(m, 'heartRate', 'heart_rate', 'heart', 'hr')
  const rawRestingHeart = getField(m, 'restingHeartRate', 'resting_heart_rate', 'restingHr', 'resting')
  const rawWalkingHeart = getField(m, 'walkingHeartRate', 'walking_heart_rate', 'walkingAverage', 'walkingHeartRateAverage')
  const rawHrv = getField(m, 'hrv', 'heartRateVariability', 'heart_rate_variability')
  const rawVo2max = getField(m, 'vo2max', 'vo2_max', 'vo2Max')
  const rawSpo2 = getField(m, 'spo2', 'oxygenSaturation', 'oxygen_saturation', 'bloodOxygen')
  const rawRespiratoryRate = getField(m, 'respiratoryRate', 'respiratory_rate')

  const rawSleep = getField(m, 'sleep', 'sleepHours', 'sleep_hours', 'sleepDuration', 'sleep_duration', 'sleepAnalysis')
  const rawWeight = getField(m, 'weight', 'bodyMass', 'body_mass')
  const rawBmi = getField(m, 'bmi', 'bodyMassIndex')
  const rawBodyFat = getField(m, 'bodyFat', 'bodyFatPercentage', 'body_fat')
  const rawMobility = getField(m, 'mobility')
  const rawTemperature = getField(m, 'temperature')

  // Parse Heart Rate (can be number, string, or object)
  let hrAverage, hrMin, hrMax, hrResting, hrWalking, hrHrvVal, hrVo2Val
  if (typeof rawHeart === 'object' && rawHeart !== null) {
    hrAverage = parseNum(getField(rawHeart, 'average', 'avg', 'value', 'latest'))
    hrMin = parseNum(getField(rawHeart, 'min'))
    hrMax = parseNum(getField(rawHeart, 'max'))
    hrResting = parseNum(getField(rawHeart, 'resting'))
    hrWalking = parseNum(getField(rawHeart, 'walkingAverage', 'walking'))
    hrHrvVal = parseNum(getField(rawHeart, 'hrv'))
    hrVo2Val = parseNum(getField(rawHeart, 'vo2max'))
  } else {
    hrAverage = parseNum(rawHeart)
  }
  const finalRestingHr = hrResting ?? parseNum(rawRestingHeart)
  const finalWalkingHr = hrWalking ?? parseNum(rawWalkingHeart)
  const finalHrv = hrHrvVal ?? parseNum(rawHrv)
  const finalVo2 = hrVo2Val ?? parseNum(rawVo2max)

  // Parse Sleep Duration (can be hours, minutes, seconds, or an object)
  let sleepDuration, sleepScore, sleepDeep, sleepRem, sleepLight, sleepDebt
  if (typeof rawSleep === 'object' && rawSleep !== null) {
    const rawDur = getField(rawSleep, 'duration', 'hours', 'total', 'time')
    const numDur = parseNum(rawDur)
    if (numDur != null) {
      if (numDur > 600) sleepDuration = numDur / 3600 // in seconds
      else if (numDur > 24) sleepDuration = numDur / 60 // in minutes
      else sleepDuration = numDur
    }
    sleepScore = parseNum(getField(rawSleep, 'score'))
    sleepDeep = parseNum(getField(rawSleep, 'deep'))
    sleepRem = parseNum(getField(rawSleep, 'rem'))
    sleepLight = parseNum(getField(rawSleep, 'light', 'core'))
    sleepDebt = parseNum(getField(rawSleep, 'debt'))
  } else {
    const numSleep = parseNum(rawSleep)
    if (numSleep != null) {
      if (numSleep > 600) sleepDuration = numSleep / 3600 // in seconds
      else if (numSleep > 24) sleepDuration = numSleep / 60 // in minutes
      else sleepDuration = numSleep
    }
  }

  // Parse Distance (if in meters > 200, convert to km)
  let distanceKm = parseNum(rawDistance)
  if (distanceKm != null && distanceKm > 200) {
    distanceKm = distanceKm / 1000
  }

  const stepsVal = parseNum(rawSteps)
  const caloriesVal = parseNum(rawActiveCalories)
  const basalCaloriesVal = parseNum(rawBasalCalories)
  const exerciseMinutesVal = parseNum(rawExerciseMinutes)
  const standHoursVal = parseNum(rawStandHours)
  const hydrationVal = parseNum(rawHydration)
  const spo2Val = parseNum(rawSpo2)
  const respiratoryRateVal = parseNum(rawRespiratoryRate)

  const dayDoc = {
    date,
    activity: {
      steps: stepsVal != null ? Math.round(stepsVal) : undefined,
      distance: distanceKm != null ? round(distanceKm, 2) : undefined,
      calories: caloriesVal != null ? Math.round(caloriesVal) : undefined,
      basalCalories: basalCaloriesVal != null ? Math.round(basalCaloriesVal) : undefined,
      exerciseMinutes: exerciseMinutesVal != null ? Math.round(exerciseMinutesVal) : undefined,
    },
    standHours: standHoursVal != null ? Math.round(standHoursVal) : undefined,
    hydration: hydrationVal != null ? round(hydrationVal, 2) : undefined,
    heart: {
      average: hrAverage != null ? Math.round(hrAverage) : undefined,
      resting: finalRestingHr != null ? Math.round(finalRestingHr) : undefined,
      walkingAverage: finalWalkingHr != null ? Math.round(finalWalkingHr) : undefined,
      min: hrMin != null ? Math.round(hrMin) : undefined,
      max: hrMax != null ? Math.round(hrMax) : undefined,
      hrv: finalHrv != null ? Math.round(finalHrv) : undefined,
      vo2max: finalVo2 != null ? round(finalVo2, 1) : undefined,
    },
    spo2: spo2Val != null ? round(spo2Val, 1) : undefined,
    respiratoryRate: respiratoryRateVal != null ? round(respiratoryRateVal, 1) : undefined,
    weight: {
      value: parseNum(typeof rawWeight === 'object' ? getField(rawWeight, 'value') : rawWeight) != null
        ? round(parseNum(typeof rawWeight === 'object' ? getField(rawWeight, 'value') : rawWeight), 1)
        : undefined,
      bmi: parseNum(rawBmi) != null ? round(parseNum(rawBmi), 1) : undefined,
      bodyFatPercentage: parseNum(rawBodyFat) != null ? round(parseNum(rawBodyFat), 1) : undefined,
    },
    mobility: {
      walkingSpeed: parseNum(typeof rawMobility === 'object' ? getField(rawMobility, 'walkingSpeed') : null) != null
        ? round(parseNum(getField(rawMobility, 'walkingSpeed')), 2)
        : undefined,
      walkingAsymmetry: parseNum(typeof rawMobility === 'object' ? getField(rawMobility, 'walkingAsymmetry') : null) != null
        ? round(parseNum(getField(rawMobility, 'walkingAsymmetry')), 1)
        : undefined,
      stepLength: parseNum(typeof rawMobility === 'object' ? getField(rawMobility, 'stepLength') : null) != null
        ? round(parseNum(getField(rawMobility, 'stepLength')), 1)
        : undefined,
    },
    temperature: {
      body: parseNum(typeof rawTemperature === 'object' ? getField(rawTemperature, 'body') : null) != null
        ? round(parseNum(getField(rawTemperature, 'body')), 2)
        : undefined,
      wrist: parseNum(typeof rawTemperature === 'object' ? getField(rawTemperature, 'wrist') : null) != null
        ? round(parseNum(getField(rawTemperature, 'wrist')), 2)
        : undefined,
    },
    sleep: {
      duration: sleepDuration != null ? round(sleepDuration, 2) : undefined,
      score: sleepScore != null ? Math.round(sleepScore) : (sleepDuration != null ? Math.round(clamp((sleepDuration / 8) * 100, 0, 100)) : undefined),
      deep: sleepDeep != null ? round(sleepDeep, 2) : undefined,
      rem: sleepRem != null ? round(sleepRem, 2) : undefined,
      light: sleepLight != null ? round(sleepLight, 2) : undefined,
      debt: sleepDebt != null ? round(sleepDebt, 2) : undefined,
    },
    extensibleMetrics: m.extensible || {},
  }

  // Heuristic recovery for shortcuts where variables were accidentally placed into Dictionary Keys
  for (const [key, val] of Object.entries(payload)) {
    if (typeof key === 'string' && key.includes('\n')) {
      const parts = key.split('\n').map((s) => Number(s.trim())).filter((n) => !isNaN(n))
      if (parts.length > 5) {
        const sum = parts.reduce((a, b) => a + b, 0)
        const avg = sum / parts.length
        // 1. All integers > 0 and sum > 100 -> Steps
        if (dayDoc.activity.steps == null && parts.every((n) => Number.isInteger(n) && n >= 0) && sum > 100) {
          dayDoc.activity.steps = Math.round(sum)
        }
        // 2. All values between 70 and 100 -> SpO2 percentage
        else if (dayDoc.spo2 == null && parts.every((n) => n >= 70 && n <= 100)) {
          dayDoc.spo2 = round(avg, 1)
        }
        // 3. Small floats summing < 50 -> Distance (km)
        else if (dayDoc.activity.distance == null && parts.some((n) => !Number.isInteger(n)) && sum < 50) {
          dayDoc.activity.distance = round(sum, 2)
        }
        // 4. Floats or integers summing between 50 and 5000 -> Active Calories
        else if (dayDoc.activity.calories == null && sum >= 50 && sum < 5000) {
          dayDoc.activity.calories = Math.round(sum)
        }
      }
    } else if (typeof key === 'string' && /^\d+$/.test(key.trim())) {
      const n = Number(key.trim())
      if (n >= 40 && n <= 110 && dayDoc.heart.resting == null) {
        dayDoc.heart.resting = n
      }
    }
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
