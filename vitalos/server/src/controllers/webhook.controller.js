import DailyRecord from '../models/DailyRecord.js'
import Workout from '../models/Workout.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError, isValidDateString } from '../utils/validation.js'
import { parseHealthAutoExportPayload } from '../utils/healthkitParser.js'

const IMPORTABLE_FIELDS = ['sleep', 'heart', 'spo2', 'weight', 'activity', 'hydration']

function sanitizeDay(day) {
  if (!isValidDateString(day.date)) return null
  const set = { date: day.date }
  for (const field of IMPORTABLE_FIELDS) {
    if (day[field] !== undefined) set[field] = day[field]
  }
  return set
}

// POST /api/webhook/healthkit?secret=...  (or header x-webhook-secret)
// This endpoint has to be publicly reachable for Health Auto Export's
// Automation to hit it — the shared secret is the only thing stopping
// randoms on the internet from writing fake health data into your DB.
export const receiveHealthKitWebhook = asyncHandler(async (req, res) => {
  const expected = process.env.WEBHOOK_SECRET
  if (!expected) {
    throw new ApiError(500, 'WEBHOOK_SECRET is not configured on the server.')
  }
  const provided = req.query.secret || req.get('x-webhook-secret')
  if (provided !== expected) {
    throw new ApiError(401, 'Invalid or missing webhook secret.')
  }

  let parsed
  try {
    parsed = parseHealthAutoExportPayload(req.body)
  } catch (err) {
    throw new ApiError(400, err.message)
  }

  if (!parsed.days.length && !parsed.workouts.length) {
    return res.json({ imported: 0, workoutsImported: 0, message: 'Payload parsed but contained no recognizable data.' })
  }

  let recordsResult = { upsertedCount: 0, modifiedCount: 0 }
  if (parsed.days.length) {
    const ops = parsed.days
      .map(sanitizeDay)
      .filter(Boolean)
      .map((doc) => {
        const { date, ...rest } = doc
        return {
          updateOne: {
            filter: { date },
            update: { $set: rest, $setOnInsert: { date } },
            upsert: true,
          },
        }
      })
    if (ops.length) recordsResult = await DailyRecord.bulkWrite(ops, { ordered: false })
  }

  let workoutsUpserted = 0
  if (parsed.workouts.length) {
    const ops = parsed.workouts
      .filter((w) => w.date && w.type)
      .map((w) => {
        const filter = { date: w.date, type: w.type, durationMin: w.durationMin ?? 0 }
        return {
          updateOne: {
            filter,
            update: { $setOnInsert: { ...filter, distanceKm: w.distanceKm ?? 0, calories: w.calories ?? 0 } },
            upsert: true,
          },
        }
      })
    if (ops.length) {
      const result = await Workout.bulkWrite(ops, { ordered: false })
      workoutsUpserted = result.upsertedCount
    }
  }

  res.json({
    daysReceived: parsed.days.length,
    daysUpserted: recordsResult.upsertedCount,
    daysUpdated: recordsResult.modifiedCount,
    workoutsReceived: parsed.workouts.length,
    workoutsUpserted,
  })
})