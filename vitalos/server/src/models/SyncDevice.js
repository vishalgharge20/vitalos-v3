import mongoose from 'mongoose'

const { Schema } = mongoose

const SyncDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, default: 'primary-ios', index: true },
    name: { type: String, default: 'Apple Health (iOS)' },
    syncToken: { type: String, default: '' },
    clientType: { type: String, default: 'shortcuts' }, // 'shortcuts' | 'health_auto_export' | 'manual'
    lastSyncAt: { type: Date, default: null },
    lastSyncStatus: {
      type: String,
      enum: ['idle', 'success', 'partial', 'error'],
      default: 'idle',
    },
    lastSyncMessage: { type: String, default: 'Awaiting initial sync from iPhone' },
    lastSyncMetricsCount: { type: Number, default: 0 },
    lastSyncWorkoutsCount: { type: Number, default: 0 },
    totalSyncs: { type: Number, default: 0 },
    activeMetrics: { type: [String], default: [] },
    lastError: { type: String, default: null },
    lastPayloadSummary: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

export default mongoose.model('SyncDevice', SyncDeviceSchema)
