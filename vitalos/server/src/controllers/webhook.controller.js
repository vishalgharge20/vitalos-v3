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

  // TEMP DEBUG: log a compact summary of every metric name this payload
  // contains — not the full payload (that can be tens of MB with "All
  // Selected" metrics). This runs whether or not parsing succeeds, so we
  // can see the *exact* field names Health Auto Export v2 sends (e.g. is
  // it "step_count" or "stepCount"?) even on a run that doesn't error.
  // Safe to remove once the metric-name matching is confirmed correct.
  try {
    const summary = (req.body?.data?.metrics || []).map((m) => ({
      name: m.name,
      units: m.units,
      sampleCount: Array.isArray(m.data) ? m.data.length : 0,
      firstEntry: Array.isArray(m.data) && m.data[0] ? m.data[0] : null,
    }))
    console.log('[webhook] Metrics in this payload:', JSON.stringify(summary))
    console.log('[webhook] Workout count in this payload:', req.body?.data?.workouts?.length ?? 0)
  } catch (logErr) {
    console.error('[webhook] Could not summarize payload for logging:', logErr.message)
  }

  // TEMP DEBUG: the whole thing is wrapped so that whatever throws —
  // parsing, or the DB write after it — we log the real payload and the
  // real error to Render's logs before responding. Remove once the
  // webhook has run reliably for a few days against real data.
  try {
    const parsed = parseHealthAutoExportPayload(req.body)

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

    return res.json({
      daysReceived: parsed.days.length,
      daysUpserted: recordsResult.upsertedCount,
      daysUpdated: recordsResult.modifiedCount,
      workoutsReceived: parsed.workouts.length,
      workoutsUpserted,
    })
  } catch (err) {
    console.error('[webhook] FAILED. Raw payload (truncated to 8000 chars):')
    console.error(JSON.stringify(req.body).slice(0, 8000))
    console.error('[webhook] Error name:', err.name)
    console.error('[webhook] Error message:', err.message)
    console.error('[webhook] Stack:', err.stack)
    throw new ApiError(400, `Webhook processing failed: ${err.message}`)
  }
})
