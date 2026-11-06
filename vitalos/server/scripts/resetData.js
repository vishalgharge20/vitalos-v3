import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

async function resetAllData() {
  if (!process.env.MONGODB_URI) {
    console.error('No MONGODB_URI found!')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected to MongoDB Atlas')
  const db = mongoose.connection.db

  const todayStr = '2026-11-06'

  // 1. Reset dailyrecords: keep only today initialized to 0
  await db.collection('dailyrecords').deleteMany({ date: { $ne: todayStr } })
  await db.collection('dailyrecords').updateOne(
    { date: todayStr },
    {
      $set: {
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
        extensibleMetrics: {},
      },
    },
    { upsert: true }
  )
  console.log(`[reset] dailyrecords: initialized ${todayStr} to 0`)

  // 2. Clear healthsamples
  const samplesResult = await db.collection('healthsamples').deleteMany({})
  console.log(`[reset] healthsamples: deleted ${samplesResult.deletedCount} samples`)

  // 3. Clear workouts
  const workoutsResult = await db.collection('workouts').deleteMany({})
  console.log(`[reset] workouts: deleted ${workoutsResult.deletedCount} workouts`)

  // 4. Reset syncdevices stats
  await db.collection('syncdevices').updateMany(
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
      },
    }
  )
  console.log('[reset] syncdevices: stats reset to idle')

  // Verify
  const record = await db.collection('dailyrecords').findOne({ date: todayStr })
  console.log('\nVerification - Current Record for today:')
  console.log(JSON.stringify(record, null, 2))

  await mongoose.disconnect()
  console.log('\n[SUCCESS] All data has been reset to zero on MongoDB Atlas.')
}

resetAllData().catch((err) => {
  console.error('[reset] Error:', err)
  process.exit(1)
})
