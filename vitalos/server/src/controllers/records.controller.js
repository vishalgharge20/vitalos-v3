import DailyRecord from '../models/DailyRecord.js'
import Screenshot from '../models/Screenshot.js'
import Workout from '../models/Workout.js'
import HealthSample from '../models/HealthSample.js'
import SyncDevice from '../models/SyncDevice.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/validation.js'
import { isValidDateString } from '../utils/validation.js'

// Fields a client is allowed to write via POST/PUT — keeps arbitrary
// request bodies from injecting unexpected fields into a document.
const WRITABLE_FIELDS = [
  'recovery',
  'readiness',
  'sleep',
  'heart',
  'stress',
  'spo2',
  'weight',
  'activity',
  'hydration',
]

function pickWritableFields(body) {
  const update = {}
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field]
  }
  return update
}

function requireValidDate(date) {
  if (!isValidDateString(date)) {
    throw new ApiError(400, `Invalid date "${date}" — expected format YYYY-MM-DD.`)
  }
}

// GET /api/records?from=YYYY-MM-DD&to=YYYY-MM-DD
export const listRecords = asyncHandler(async (req, res) => {
  const { from, to } = req.query
  const filter = {}
  if (from || to) {
    filter.date = {}
    if (from) {
      requireValidDate(from)
      filter.date.$gte = from
    }
    if (to) {
      requireValidDate(to)
      filter.date.$lte = to
    }
  }

  const records = await DailyRecord.find(filter).sort({ date: 1 }).lean()
  res.json(records)
})

// GET /api/records/:date
export const getRecord = asyncHandler(async (req, res) => {
  const { date } = req.params
  requireValidDate(date)

  const record = await DailyRecord.findOne({ date }).lean()
  if (!record) throw new ApiError(404, `No record found for ${date}.`)

  res.json(record)
})

// POST /api/records/:date — create or update (upsert) a day's metrics
export const upsertRecord = asyncHandler(async (req, res) => {
  const { date } = req.params
  requireValidDate(date)

  const update = pickWritableFields(req.body)

  const record = await DailyRecord.findOneAndUpdate(
    { date },
    { $set: update, $setOnInsert: { date } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  )

  res.json(record)
})

// PATCH /api/records/:date/notes
export const updateNotes = asyncHandler(async (req, res) => {
  const { date } = req.params
  requireValidDate(date)

  const { notes } = req.body
  if (typeof notes !== 'string') {
    throw new ApiError(400, '"notes" must be a string.')
  }

  const record = await DailyRecord.findOneAndUpdate(
    { date },
    { $set: { notes }, $setOnInsert: { date } },
    { upsert: true, new: true }
  )

  res.json(record)
})

// DELETE /api/records/:date — removes the day's record and its screenshots
export const deleteRecord = asyncHandler(async (req, res) => {
  const { date } = req.params
  requireValidDate(date)

  const record = await DailyRecord.findOneAndDelete({ date })
  if (!record) throw new ApiError(404, `No record found for ${date}.`)

  await Screenshot.deleteMany({ date })

  res.json({ deleted: true, date })
})

// DELETE /api/records — wipes everything and initializes today to 0
export const deleteAllRecords = asyncHandler(async (req, res) => {
  await Promise.all([
    DailyRecord.deleteMany({}),
    Screenshot.deleteMany({}),
    Workout.deleteMany({}),
    HealthSample.deleteMany({}),
  ])

  // Reset sync device state
  await SyncDevice.updateMany(
    { deviceId: 'primary-ios' },
    {
      $set: {
        lastSyncStatus: 'idle',
        lastSyncMessage: 'Ready for initial sync from iPhone',
        lastSyncMetricsCount: 0,
        lastSyncWorkoutsCount: 0,
        totalSyncs: 0,
        activeMetrics: [],
        lastError: null,
        lastPayloadSummary: null,
      },
    }
  )

  // Initialize today's record cleanly with 0s so frontend displays fresh zeros (not demo data)
  const todayStr = new Date().toISOString().slice(0, 10)
  const initializedToday = await DailyRecord.create({
    date: todayStr,
    activity: {
      steps: 0,
      distance: 0,
      calories: 0,
      basalCalories: 0,
      exerciseMinutes: 0,
    },
    sleep: {
      duration: 0,
      deep: 0,
      rem: 0,
      light: 0,
      score: 0,
    },
    heart: {
      average: null,
      resting: null,
      hrv: null,
      walkingAverage: null,
      min: null,
      max: null,
    },
    spo2: null,
    recovery: 0,
    readiness: 0,
    hydration: 0,
    screenshots: [],
    notes: '',
  })

  res.json({
    deleted: true,
    message: 'Database reset successfully. Today initialized to 0.',
    today: initializedToday,
  })
})
