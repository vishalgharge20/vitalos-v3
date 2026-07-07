import DailyRecord from '../models/DailyRecord.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError, isValidDateString } from '../utils/validation.js'

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 }

function average(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n))
  if (!valid.length) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
}

// GET /api/reports?period=daily|weekly|monthly&date=YYYY-MM-DD
// Returns simple period averages over existing records. This is a plain
// aggregation for now — richer AI-generated reports are a later phase
// (see aiReport on DailyRecord, which stays null until then).
export const getReport = asyncHandler(async (req, res) => {
  const period = req.query.period || 'weekly'
  const endDate = req.query.date || new Date().toISOString().slice(0, 10)

  if (!PERIOD_DAYS[period]) {
    throw new ApiError(400, `Invalid period "${period}". Must be one of: daily, weekly, monthly.`)
  }
  if (!isValidDateString(endDate)) {
    throw new ApiError(400, `Invalid date "${endDate}" — expected format YYYY-MM-DD.`)
  }

  const end = new Date(endDate + 'T00:00:00Z')
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (PERIOD_DAYS[period] - 1))
  const startDate = start.toISOString().slice(0, 10)

  const records = await DailyRecord.find({ date: { $gte: startDate, $lte: endDate } })
    .sort({ date: 1 })
    .lean()

  res.json({
    period,
    startDate,
    endDate,
    daysWithData: records.length,
    averages: {
      recovery: average(records.map((r) => r.recovery)),
      readiness: average(records.map((r) => r.readiness)),
      sleepScore: average(records.map((r) => r.sleep?.score)),
      sleepDuration: average(records.map((r) => r.sleep?.duration)),
      restingHeartRate: average(records.map((r) => r.heart?.resting)),
      stress: average(records.map((r) => r.stress?.average)),
      weight: average(records.map((r) => r.weight?.value)),
      steps: average(records.map((r) => r.activity?.steps)),
    },
    records,
  })
})
