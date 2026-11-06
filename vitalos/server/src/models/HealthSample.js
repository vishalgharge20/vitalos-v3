import mongoose from 'mongoose'

const { Schema } = mongoose

const HealthSampleSchema = new Schema(
  {
    // Unique identifier from HealthKit (UUID) or synthetic hash for deduplication
    sampleId: { type: String, required: true, unique: true, index: true },

    // Metric type (e.g. 'steps', 'heart_rate', 'hrv', 'spo2', 'respiratory_rate', etc.)
    type: { type: String, required: true, index: true },

    // Calendar date formatted as 'YYYY-MM-DD' for fast daily queries
    date: { type: String, required: true, index: true },

    // Exact sample start and end timestamps (ISO Date with UTC timezone)
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },

    // Sample numeric value
    value: { type: Number, required: true },

    // Unit of measurement ('count', 'bpm', 'ms', '%', 'kcal', 'km', 'min', 'kg', 'degC', etc.)
    unit: { type: String, default: '' },

    // Originating device or source ('Apple Watch Series 9', 'iPhone', etc.)
    source: { type: String, default: 'Apple Health' },

    // Hardware/device details if available
    device: { type: Schema.Types.Mixed, default: null },

    // Any contextual metadata (e.g., sleep stage, motion context, weather)
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

// Efficient compound index for querying samples by date and type
HealthSampleSchema.index({ date: 1, type: 1 })
HealthSampleSchema.index({ startDate: 1, type: 1 })

export default mongoose.model('HealthSample', HealthSampleSchema)
