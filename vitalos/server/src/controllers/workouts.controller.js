import Workout from '../models/Workout.js'
import { asyncHandler } from '../utils/asyncHandler.js'

// GET /api/workouts?limit=15
export const listWorkouts = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 15, 100)
  const workouts = await Workout.find({}).sort({ date: -1 }).limit(limit).lean()
  res.json(workouts)
})
