import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

async function updateLiveWithParsedData() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  const todayStr = '2026-11-06'
  const updateDoc = {
    'activity.steps': 3509,
    'activity.distance': 3.0,
    'activity.calories': 231,
    'heart.resting': 56,
    'heart.average': 72,
    'spo2': 98.0,
    'updatedAt': new Date(),
  }

  await db.collection('dailyrecords').updateOne(
    { date: todayStr },
    { $set: updateDoc },
    { upsert: true }
  )

  await db.collection('syncdevices').updateOne(
    { deviceId: 'primary-ios' },
    {
      $set: {
        lastSyncStatus: 'success',
        lastSyncMessage: 'Sync successful: 1 days, 5 metrics synced',
        lastSyncMetricsCount: 5,
        activeMetrics: ['steps', 'distance', 'activeCalories', 'restingHeartRate', 'spo2'],
      },
      $inc: { totalSyncs: 1 },
    }
  )

  const doc = await db.collection('dailyrecords').findOne({ date: todayStr })
  console.log('Updated Daily Record:', JSON.stringify(doc, null, 2))

  await mongoose.disconnect()
}

updateLiveWithParsedData().catch(console.error)
