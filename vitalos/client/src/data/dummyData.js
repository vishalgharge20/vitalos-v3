/**
 * 90 days of realistic dummy health data — shown only as a fallback when
 * the backend has no imported Apple Health data yet, so the dashboard
 * always has something to render. Shaped exactly like what the Apple
 * Health importer produces (see src/utils/appleHealthParser.js), which is
 * itself shaped like the `daily_records` MongoDB schema:
 *
 * {
 *   date: 'YYYY-MM-DD',
 *   sleep: { duration, score, deep, rem, light },
 *   heart: { resting, average, min, max, vo2max },
 *   spo2: number,
 *   weight: { value, bmi },
 *   activity: { steps, distance, calories, basalCalories, exerciseMinutes },
 *   hydration: liters,
 *   notes: string,
 * }
 */

const DAYS = 90

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function round(n, d = 1) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function formatDate(d) {
  return d.toISOString().slice(0, 10)
}

const NOTE_BANK = [
  'Slept late, felt groggy',
  'Great energy all day',
  'Skipped breakfast',
  'Long walk in the evening',
  'Hydrated well today',
  'Workout felt strong',
  'Rough night, woke up twice',
  'Calm and relaxed day',
  '',
  '',
]

export function generateDummyData() {
  const rand = seededRandom(42)
  const records = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let weight = 78.4

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Sleep
    const baseSleep = isWeekend ? 7.6 : 6.7
    const duration = clamp(baseSleep + (rand() - 0.5) * 1.8, 4.5, 9.2)
    const deep = round(duration * (0.18 + rand() * 0.07))
    const rem = round(duration * (0.19 + rand() * 0.08))
    const light = round(duration - deep - rem)
    const sleepScore = Math.round(clamp((duration / 8) * 100, 0, 100))

    // Heart
    const resting = Math.round(clamp(60 - (sleepScore - 70) * 0.05 + rand() * 6, 46, 72))
    const average = resting + Math.round(10 + rand() * 12)
    const min = Math.max(45, resting - Math.round(rand() * 8))
    const max = average + Math.round(45 + rand() * 30)
    const vo2max = round(41 + rand() * 6, 1)

    // SpO2
    const spo2 = round(clamp(97 + rand() * 2.5, 94, 100), 1)

    // Weight — gentle downward drift with noise
    weight = clamp(weight - 0.01 + (rand() - 0.5) * 0.3, 70, 82)
    const heightM = 1.78
    const bmi = round(weight / (heightM * heightM), 1)

    // Activity
    const steps = Math.round(clamp((isWeekend ? 7200 : 6200) + (rand() - 0.3) * 6000, 900, 18000))
    const distance = round(steps * 0.00078, 2)
    const calories = Math.round(250 + steps * 0.045 + rand() * 100)
    const basalCalories = Math.round(1500 + rand() * 150)
    const exerciseMinutes = Math.round(rand() > 0.55 ? 20 + rand() * 55 : rand() * 10)

    const hydration = round(1.4 + rand() * 1.6, 1)

    records.push({
      date: formatDate(date),
      sleep: {
        duration: round(duration),
        score: sleepScore,
        deep,
        rem,
        light: Math.max(light, 0.3),
      },
      heart: { resting, average, min, max, vo2max },
      spo2,
      weight: { value: round(weight), bmi },
      activity: { steps, distance, calories, basalCalories, exerciseMinutes },
      hydration,
      notes: NOTE_BANK[Math.floor(rand() * NOTE_BANK.length)],
    })
  }

  return records
}

export const dummyRecords = generateDummyData()
export const dummyWorkouts = [
  { date: dummyRecords[dummyRecords.length - 1].date, type: 'Running', durationMin: 32, distanceKm: 5.1, calories: 310 },
  { date: dummyRecords[dummyRecords.length - 3].date, type: 'Cycling', durationMin: 48, distanceKm: 15.2, calories: 410 },
  { date: dummyRecords[dummyRecords.length - 5].date, type: 'Yoga', durationMin: 40, distanceKm: 0, calories: 120 },
]

export function getTodayRecord() {
  return dummyRecords[dummyRecords.length - 1]
}

export function getLastNDays(n) {
  return dummyRecords.slice(-n)
}
