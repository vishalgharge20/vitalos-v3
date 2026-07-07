import DailyRecord from '../models/DailyRecord.js'
import Workout from '../models/Workout.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError, isValidDateString } from '../utils/validation.js'

// Fields the Apple Health importer is allowed to write per day. Kept
// explicit (rather than trusting the whole request body) so a malformed
// import can't inject arbitrary fields into a record.
const IMPORTABLE_FIELDS = ['sleep', 'heart', 'spo2', 'weight', 'activity', 'hydration']

function sanitizeDay(day) {
  if (!isValidDateString(day.date)) return null
  const set = { date: day.date }
  for (const field of IMPORTABLE_FIELDS) {
    if (day[field] !== undefined) set[field] = day[field]
  }
  return set
}

// POST /api/import/records — bulk upsert, body: { days: [...] }
// Uses one bulkWrite instead of N round-trips so importing years of
// history (hundreds of days) stays fast on a free-tier cluster.
export const importRecords = asyncHandler(async (req, res) => {
  const { days } = req.body
  if (!Array.isArray(days) || !days.length) {
    throw new ApiError(400, '"days" must be a non-empty array.')
  }
  if (days.length > 5000) {
    throw new ApiError(400, 'Too many days in one import (max 5000).')
  }

  const ops = []
  let skipped = 0
  for (const day of days) {
    const doc = sanitizeDay(day)
    if (!doc) {
      skipped++
      continue
    }
    const { date, ...rest } = doc
    ops.push({
      updateOne: {
        filter: { date },
        update: { $set: rest, $setOnInsert: { date } },
        upsert: true,
      },
    })
  }

  if (!ops.length) {
    throw new ApiError(400, 'None of the supplied days had a valid date.')
  }

  const result = await DailyRecord.bulkWrite(ops, { ordered: false })
  res.json({
    imported: ops.length,
    skipped,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  })
})

// POST /api/import/workouts — bulk upsert, body: { workouts: [...] }
export const importWorkouts = asyncHandler(async (req, res) => {
  const { workouts } = req.body
  if (!Array.isArray(workouts)) {
    throw new ApiError(400, '"workouts" must be an array.')
  }
  if (!workouts.length) {
    return res.json({ imported: 0, skipped: 0 })
  }
  if (workouts.length > 2000) {
    throw new ApiError(400, 'Too many workouts in one import (max 2000).')
  }

  const ops = []
  let skipped = 0
  for (const w of workouts) {
    if (!w.date || !isValidDateString(w.date) || !w.type) {
      skipped++
      continue
    }
    const filter = { date: w.date, type: w.type, durationMin: w.durationMin ?? 0 }
    ops.push({
      updateOne: {
        filter,
        update: {
          $setOnInsert: {
            ...filter,
            distanceKm: w.distanceKm ?? 0,
            calories: w.calories ?? 0,
          },
        },
        upsert: true,
      },
    })
  }

  if (!ops.length) {
    return res.json({ imported: 0, skipped })
  }

  const result = await Workout.bulkWrite(ops, { ordered: false })
  res.json({ imported: ops.length, skipped, upserted: result.upsertedCount })
})
