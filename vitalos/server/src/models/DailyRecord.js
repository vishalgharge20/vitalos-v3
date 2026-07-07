import mongoose from 'mongoose'

const { Schema } = mongoose

const SleepSchema = new Schema(
  {
    duration: Number, // hours
    score: Number, // 0-100
    deep: Number, // hours
    rem: Number, // hours
    light: Number, // hours
    debt: Number, // hours
  },
  { _id: false }
)

const HeartSchema = new Schema(
  {
    resting: Number,
    average: Number,
    min: Number,
    max: Number,
    vo2max: Number,
  },
  { _id: false }
)

const StressPointSchema = new Schema(
  {
    hour: Number,
    value: Number,
  },
  { _id: false }
)

const StressSchema = new Schema(
  {
    average: Number,
    timeline: [StressPointSchema],
  },
  { _id: false }
)

const WeightSchema = new Schema(
  {
    value: Number, // kg
    bmi: Number,
    goal: Number,
  },
  { _id: false }
)

const ActivitySchema = new Schema(
  {
    steps: Number,
    distance: Number, // km
    calories: Number, // active calories
    basalCalories: Number,
    walkingMinutes: Number,
    exerciseMinutes: Number,
  },
  { _id: false }
)

// Lightweight reference to a Screenshot document — the binary image data
// itself lives in a separate collection so daily_records stays small and
// fast to query even after months of daily uploads.
const ScreenshotRefSchema = new Schema(
  {
    screenshot: { type: Schema.Types.ObjectId, ref: 'Screenshot', required: true },
    type: {
      type: String,
      enum: ['sleep', 'heart', 'stress', 'workout', 'weight', 'spo2', 'activity'],
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const AiReportSchema = new Schema(
  {
    summary: String,
    recovery: String,
    recommendations: [String],
    warnings: [String],
    sleepAnalysis: String,
    heartAnalysis: String,
    stressAnalysis: String,
    generatedAt: Date,
  },
  { _id: false }
)

const DailyRecordSchema = new Schema(
  {
    // Stored as 'YYYY-MM-DD' (not a Date) so "one record per calendar day"
    // is trivial to enforce and query, with no timezone ambiguity.
    date: { type: String, required: true, unique: true, index: true },

    recovery: { type: Number, min: 0, max: 100 },
    readiness: { type: Number, min: 0, max: 100 },

    sleep: SleepSchema,
    heart: HeartSchema,
    stress: StressSchema,
    spo2: Number,
    weight: WeightSchema,
    activity: ActivitySchema,
    hydration: Number, // liters

    screenshots: [ScreenshotRefSchema],
    notes: { type: String, default: '' },
    aiReport: { type: AiReportSchema, default: null },
  },
  { timestamps: true } // createdAt / updatedAt
)

export default mongoose.model('DailyRecord', DailyRecordSchema)
