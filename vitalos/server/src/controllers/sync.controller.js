import crypto from 'crypto'
import DailyRecord from '../models/DailyRecord.js'
import Workout from '../models/Workout.js'
import HealthSample from '../models/HealthSample.js'
import SyncDevice from '../models/SyncDevice.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError, isValidDateString } from '../utils/validation.js'
import { parseUnifiedSyncPayload } from '../utils/healthkitParser.js'

function buildGranularSet(day) {
  const setDoc = {}
  for (const [key, val] of Object.entries(day)) {
    if (key === 'date' || val === undefined || key === 'detectedMetrics') continue
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      for (const [subKey, subVal] of Object.entries(val)) {
        if (subVal !== undefined && subVal !== null) {
          setDoc[`${key}.${subKey}`] = subVal
        }
      }
    } else if (val !== null) {
      setDoc[key] = val
    }
  }
  return setDoc
}

/**
 * Validates request credentials against WEBHOOK_SECRET env var or stored SyncDevice token.
 */
async function authenticateSyncRequest(req) {
  const envSecret = process.env.WEBHOOK_SECRET
  const provided =
    req.get('x-sync-secret') ||
    req.get('x-webhook-secret') ||
    req.query.secret ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null)

  // 1. Direct match with WEBHOOK_SECRET env var
  if (envSecret && provided === envSecret) {
    return { authenticated: true, source: 'env' }
  }

  // 2. Check stored device token in DB
  if (provided) {
    const device = await SyncDevice.findOne({ syncToken: provided })
    if (device) return { authenticated: true, source: 'device', device }
  }

  // 3. Fallback for initial local development if no secret is configured anywhere
  if (!envSecret) {
    const device = await SyncDevice.findOne({ deviceId: 'primary-ios' })
    if (!device?.syncToken) {
      return { authenticated: true, source: 'unsecured-dev' }
    }
  }

  return { authenticated: false }
}

/**
 * POST /api/sync/healthkit
 * Secure ingestion endpoint for Apple Health data (Shortcuts, Health Auto Export, batch samples).
 */
export const receiveHealthKitSync = asyncHandler(async (req, res) => {
  const auth = await authenticateSyncRequest(req)
  if (!auth.authenticated) {
    throw new ApiError(401, 'Unauthorized: Invalid or missing sync secret.')
  }

  let parsed
  try {
    parsed = parseUnifiedSyncPayload(req.body)
  } catch (err) {
    console.error('[sync] Parsing failed:', err.message)
    await SyncDevice.findOneAndUpdate(
      { deviceId: 'primary-ios' },
      {
        $set: {
          lastSyncStatus: 'error',
          lastError: `Payload parsing failed: ${err.message}`,
        },
      },
      { upsert: true }
    )
    throw new ApiError(400, `Payload validation error: ${err.message}`)
  }

  if (!parsed.days.length && !parsed.workouts.length && !parsed.samples.length) {
    return res.json({
      success: true,
      imported: 0,
      message: 'Payload processed but contained no recognizable metrics or workouts.',
    })
  }

  // 1. Upsert raw samples in health_samples (Deduplicated by unique sampleId)
  let samplesUpserted = 0
  if (parsed.samples.length) {
    const sampleOps = parsed.samples.map((s) => ({
      updateOne: {
        filter: { sampleId: s.sampleId },
        update: {
          $set: {
            type: s.type,
            date: s.date,
            startDate: s.startDate,
            endDate: s.endDate,
            value: s.value,
            unit: s.unit,
            source: s.source,
            device: s.device,
            metadata: s.metadata,
          },
          $setOnInsert: { sampleId: s.sampleId },
        },
        upsert: true,
      },
    }))
    const samplesResult = await HealthSample.bulkWrite(sampleOps, { ordered: false })
    samplesUpserted = samplesResult.upsertedCount + samplesResult.modifiedCount
  }

  // 2. Incremental merge into daily_records (granular $set so existing daily metrics aren't wiped)
  let recordsResult = { upsertedCount: 0, modifiedCount: 0 }
  if (parsed.days.length) {
    const dayOps = parsed.days
      .filter((d) => d.date && isValidDateString(d.date))
      .map((d) => {
        const updateFields = buildGranularSet(d)
        return {
          updateOne: {
            filter: { date: d.date },
            update: {
              $set: updateFields,
              $setOnInsert: { date: d.date },
            },
            upsert: true,
          },
        }
      })
    if (dayOps.length) {
      recordsResult = await DailyRecord.bulkWrite(dayOps, { ordered: false })
    }
  }

  // 3. Upsert workouts (idempotent on date, type, duration)
  let workoutsUpserted = 0
  if (parsed.workouts.length) {
    const workoutOps = parsed.workouts
      .filter((w) => w.date && isValidDateString(w.date) && w.type)
      .map((w) => {
        const filter = { date: w.date, type: w.type, durationMin: w.durationMin ?? 0 }
        return {
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
        }
      })
    if (workoutOps.length) {
      const wResult = await Workout.bulkWrite(workoutOps, { ordered: false })
      workoutsUpserted = wResult.upsertedCount
    }
  }

  // 4. Update sync device health and statistics
  const device = await SyncDevice.findOneAndUpdate(
    { deviceId: 'primary-ios' },
    {
      $set: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncMessage: `Sync successful: ${recordsResult.upsertedCount + recordsResult.modifiedCount} days, ${workoutsUpserted} workouts, ${samplesUpserted} samples`,
        lastSyncMetricsCount: parsed.detectedMetrics.length,
        lastSyncWorkoutsCount: workoutsUpserted,
        lastError: null,
      },
      $inc: { totalSyncs: 1 },
      $addToSet: { activeMetrics: { $each: parsed.detectedMetrics } },
    },
    { upsert: true, new: true }
  )

  return res.json({
    success: true,
    daysReceived: parsed.days.length,
    daysUpserted: recordsResult.upsertedCount,
    daysUpdated: recordsResult.modifiedCount,
    workoutsReceived: parsed.workouts.length,
    workoutsUpserted,
    samplesUpserted,
    activeMetrics: device.activeMetrics,
    lastSyncAt: device.lastSyncAt,
  })
})

/**
 * GET /api/sync/status
 * Returns current Apple Health sync status, connection health, metrics, and stats for the frontend.
 */
export const getSyncStatus = asyncHandler(async (req, res) => {
  let device = await SyncDevice.findOne({ deviceId: 'primary-ios' })
  if (!device) {
    device = await SyncDevice.create({
      deviceId: 'primary-ios',
      name: 'Apple Health (iOS)',
      clientType: 'shortcuts',
      syncToken: crypto.randomBytes(16).toString('hex'),
      lastSyncStatus: 'idle',
      lastSyncMessage: 'Ready for initial sync setup',
    })
  }

  const [totalSamples, totalDays, totalWorkouts] = await Promise.all([
    HealthSample.countDocuments(),
    DailyRecord.countDocuments(),
    Workout.countDocuments(),
  ])

  const envConfigured = Boolean(process.env.WEBHOOK_SECRET)
  const activeSecret = process.env.WEBHOOK_SECRET || device.syncToken

  return res.json({
    connected: Boolean(device.lastSyncAt),
    deviceId: device.deviceId,
    name: device.name,
    clientType: device.clientType,
    lastSyncAt: device.lastSyncAt,
    lastSyncStatus: device.lastSyncStatus,
    lastSyncMessage: device.lastSyncMessage,
    lastSyncMetricsCount: device.lastSyncMetricsCount,
    lastSyncWorkoutsCount: device.lastSyncWorkoutsCount,
    totalSyncs: device.totalSyncs,
    totalSamples,
    totalDays,
    totalWorkouts,
    activeMetrics: device.activeMetrics || [],
    lastError: device.lastError,
    syncToken: activeSecret,
    isEnvSecret: envConfigured,
  })
})

/**
 * POST /api/sync/generate-token
 * Generates or regenerates a new device sync token.
 */
export const generateNewSyncToken = asyncHandler(async (req, res) => {
  const newToken = crypto.randomBytes(16).toString('hex')
  const device = await SyncDevice.findOneAndUpdate(
    { deviceId: 'primary-ios' },
    { $set: { syncToken: newToken } },
    { upsert: true, new: true }
  )

  return res.json({
    success: true,
    syncToken: device.syncToken,
    message: 'New sync token generated successfully.',
  })
})
