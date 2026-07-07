import mongoose from 'mongoose'

const { Schema } = mongoose

const WorkoutSchema = new Schema(
  {
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    type: { type: String, required: true }, // e.g. "Running", "Cycling" (HKWorkoutActivityType prefix stripped)
    durationMin: Number,
    distanceKm: Number,
    calories: Number,
  },
  { timestamps: true }
)

// A user could re-import the same export twice — this keeps workouts
// idempotent so bulk imports don't create duplicate rows on re-run.
WorkoutSchema.index({ date: 1, type: 1, durationMin: 1 }, { unique: true })

export default mongoose.model('Workout', WorkoutSchema)
