import mongoose from 'mongoose'

const { Schema } = mongoose

/**
 * Screenshot images live in their own collection (rather than embedded in
 * DailyRecord) so a day with several uploads doesn't bloat the record
 * document or slow down normal dashboard queries. Fine on MongoDB's free
 * tier as long as individual images stay well under the 16MB document
 * limit — the upload middleware enforces an 8MB cap for that reason.
 */
const ScreenshotSchema = new Schema(
  {
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    type: {
      type: String,
      enum: ['sleep', 'heart', 'stress', 'workout', 'weight', 'spo2', 'activity'],
      required: true,
    },
    filename: String,
    contentType: { type: String, required: true },
    size: Number, // bytes
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
)

export default mongoose.model('Screenshot', ScreenshotSchema)
