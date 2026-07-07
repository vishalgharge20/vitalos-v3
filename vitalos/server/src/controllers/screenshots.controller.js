import mongoose from 'mongoose'
import Screenshot from '../models/Screenshot.js'
import DailyRecord from '../models/DailyRecord.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError, isValidDateString } from '../utils/validation.js'

const SCREENSHOT_TYPES = ['sleep', 'heart', 'stress', 'workout', 'weight', 'spo2', 'activity']

function requireValidDate(date) {
  if (!isValidDateString(date)) {
    throw new ApiError(400, `Invalid date "${date}" — expected format YYYY-MM-DD.`)
  }
}

function requireValidType(type) {
  if (!SCREENSHOT_TYPES.includes(type)) {
    throw new ApiError(400, `Invalid type "${type}". Must be one of: ${SCREENSHOT_TYPES.join(', ')}.`)
  }
}

// POST /api/records/:date/screenshots  (multipart/form-data, field "file", body "type")
export const uploadScreenshot = asyncHandler(async (req, res) => {
  const { date } = req.params
  const { type } = req.body

  requireValidDate(date)
  requireValidType(type)

  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Attach it under the "file" field.')
  }

  const screenshot = await Screenshot.create({
    date,
    type,
    filename: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer,
  })

  // Attach a lightweight reference to that day's record, creating the
  // record if this is the first thing uploaded for the day.
  await DailyRecord.findOneAndUpdate(
    { date },
    {
      $push: { screenshots: { screenshot: screenshot._id, type, uploadedAt: screenshot.createdAt } },
      $setOnInsert: { date },
    },
    { upsert: true }
  )

  res.status(201).json({
    id: screenshot._id,
    date: screenshot.date,
    type: screenshot.type,
    filename: screenshot.filename,
    size: screenshot.size,
    uploadedAt: screenshot.createdAt,
    url: `/api/screenshots/${screenshot._id}/image`,
  })
})

// GET /api/screenshots?date=YYYY-MM-DD&type=sleep — metadata only, no binary
export const listScreenshots = asyncHandler(async (req, res) => {
  const { date, type } = req.query
  const filter = {}
  if (date) {
    requireValidDate(date)
    filter.date = date
  }
  if (type) {
    requireValidType(type)
    filter.type = type
  }

  const screenshots = await Screenshot.find(filter)
    .select('-data')
    .sort({ createdAt: -1 })
    .lean()

  res.json(
    screenshots.map((s) => ({
      id: s._id,
      date: s.date,
      type: s.type,
      filename: s.filename,
      size: s.size,
      uploadedAt: s.createdAt,
      url: `/api/screenshots/${s._id}/image`,
    }))
  )
})

// GET /api/screenshots/:id/image — streams the raw image bytes
export const getScreenshotImage = asyncHandler(async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid screenshot id.')
  }

  const screenshot = await Screenshot.findById(id).lean()
  if (!screenshot) throw new ApiError(404, 'Screenshot not found.')

  res.set('Content-Type', screenshot.contentType)
  res.set('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(screenshot.data)
})

// DELETE /api/screenshots/:id
export const deleteScreenshot = asyncHandler(async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid screenshot id.')
  }

  const screenshot = await Screenshot.findByIdAndDelete(id)
  if (!screenshot) throw new ApiError(404, 'Screenshot not found.')

  await DailyRecord.updateOne({ date: screenshot.date }, { $pull: { screenshots: { screenshot: id } } })

  res.json({ deleted: true, id })
})
