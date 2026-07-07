import JSZip from 'jszip'

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
function parseAttrs(attrStr) {
  const attrs = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(attrStr))) attrs[m[1]] = m[2]
  return attrs
}

/**
 * Extracts export.xml text from either a raw .xml file or Apple's
 * export.zip (no need for the user to unzip it themselves). Explicitly
 * excludes export_cda.xml, which Apple also bundles but isn't the record
 * export we want.
 */
export async function extractXmlText(file) {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const entry = Object.values(zip.files).find(
      (f) => /export\.xml$/i.test(f.name) && !/cda/i.test(f.name)
    )
    if (!entry) throw new Error('Could not find export.xml inside that zip file.')
    return entry.async('text')
  }
  return file.text()
}

/**
 * Streams through the raw XML text with plain regex rather than DOMParser
 * — Apple Health exports can be hundreds of MB (years of Watch samples),
 * and building a full DOM tree for that is both slow and memory-heavy.
 * Yields back to the event loop periodically so the tab doesn't freeze.
 */
export async function parseAppleHealthXML(xmlText, onProgress) {
  const days = {}
  const workouts = []
  const totalLen = xmlText.length

  function ensureDay(date) {
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

  const recordRe = /<Record\b([^>]*?)\/?>/g
  let match
  let i = 0
  while ((match = recordRe.exec(xmlText)) !== null) {
    const attrs = parseAttrs(match[1])
    const type = attrs.type
    if (type) {
      const value = parseFloat(attrs.value)
      switch (type) {
        case 'HKQuantityTypeIdentifierStepCount': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) d.steps += value || 0
          break
        }
        case 'HKQuantityTypeIdentifierDistanceWalkingRunning': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) {
            let v = value || 0
            if (attrs.unit && /mi/i.test(attrs.unit)) v *= 1.60934
            d.distanceKm += v
          }
          break
        }
        case 'HKQuantityTypeIdentifierActiveEnergyBurned': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) d.activeKcal += value || 0
          break
        }
        case 'HKQuantityTypeIdentifierBasalEnergyBurned': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) d.basalKcal += value || 0
          break
        }
        case 'HKQuantityTypeIdentifierAppleExerciseTime': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) d.exerciseMin += value || 0
          break
        }
        case 'HKQuantityTypeIdentifierDietaryWater': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d) {
            let v = value || 0
            if (attrs.unit && /ml/i.test(attrs.unit)) v /= 1000
            d.hydrationL += v
          }
          break
        }
        case 'HKQuantityTypeIdentifierHeartRate': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) {
            d.hrSum += value
            d.hrCount++
            if (value < d.hrMin) d.hrMin = value
            if (value > d.hrMax) d.hrMax = value
          }
          break
        }
        case 'HKQuantityTypeIdentifierRestingHeartRate': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) {
            d.restingHrSum += value
            d.restingHrCount++
          }
          break
        }
        case 'HKQuantityTypeIdentifierOxygenSaturation': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) {
            let v = value
            if (v <= 1) v *= 100
            d.spo2Sum += v
            d.spo2Count++
          }
          break
        }
        case 'HKQuantityTypeIdentifierBodyMass': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) {
            let v = value
            if (attrs.unit && /lb/i.test(attrs.unit)) v *= 0.453592
            d.weight = v
          }
          break
        }
        case 'HKQuantityTypeIdentifierBodyMassIndex': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) d.bmi = value
          break
        }
        case 'HKQuantityTypeIdentifierVO2Max': {
          const d = ensureDay(dateOnly(attrs.startDate))
          if (d && !isNaN(value)) d.vo2max = value
          break
        }
        case 'HKCategoryTypeIdentifierSleepAnalysis': {
          const startMs = Date.parse(attrs.startDate)
          const endMs = Date.parse(attrs.endDate)
          if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
            const hours = (endMs - startMs) / 3600000
            const d = ensureDay(dateOnly(attrs.endDate))
            const val = attrs.value || ''
            if (d) {
              if (/deep/i.test(val)) d.sleepDeep += hours
              else if (/rem/i.test(val)) d.sleepRem += hours
              else if (/inbed/i.test(val)) d.sleepInBed += hours
              else if (/asleep/i.test(val)) d.sleepLight += hours
            }
          }
          break
        }
        default:
          break
      }
    }
    i++
    if (i % 20000 === 0) {
      if (onProgress) onProgress(Math.min(95, Math.round((match.index / totalLen) * 90)))
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  const workoutRe = /<Workout\b([^>]*?)\/?>/g
  while ((match = workoutRe.exec(xmlText)) !== null) {
    const attrs = parseAttrs(match[1])
    let dist = parseFloat(attrs.totalDistance) || 0
    if (attrs.totalDistanceUnit && /mi/i.test(attrs.totalDistanceUnit)) dist *= 1.60934
    workouts.push({
      type: (attrs.workoutActivityType || 'Workout').replace('HKWorkoutActivityType', ''),
      date: dateOnly(attrs.startDate),
      durationMin: round(parseFloat(attrs.duration) || 0, 1),
      distanceKm: round(dist, 2),
      calories: Math.round(parseFloat(attrs.totalEnergyBurned) || 0),
    })
  }

  if (onProgress) onProgress(97)

  const finalized = Object.values(days)
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
          min: d.hrCount ? Math.round(d.hrMin) : undefined,
          max: d.hrCount ? Math.round(d.hrMax) : undefined,
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

  workouts.sort((a, b) => (a.date < b.date ? 1 : -1))
  return { days: finalized, workouts }
}
